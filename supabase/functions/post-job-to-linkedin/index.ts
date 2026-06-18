import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GATEWAY = 'https://connector-gateway.lovable.dev/linkedin';

function stripHtml(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildPostText(job: any): string {
  const lines: string[] = [];
  lines.push(`We're hiring: ${job.title}`);
  if (job.department) lines.push(`Team: ${job.department}`);
  if (job.region && job.region !== 'all') lines.push(`Location: ${job.region}`);
  if (job.rate) lines.push(`Rate: ${job.rate}`);
  lines.push('');

  const desc = stripHtml(job.description);
  if (desc) {
    lines.push(desc.length > 600 ? desc.slice(0, 600) + '…' : desc);
    lines.push('');
  }

  if (Array.isArray(job.responsibilities) && job.responsibilities.length) {
    lines.push('What you\'ll do:');
    job.responsibilities.slice(0, 5).forEach((r: string) => lines.push(`• ${r}`));
    lines.push('');
  }
  if (Array.isArray(job.qualifications) && job.qualifications.length) {
    lines.push('What we\'re looking for:');
    job.qualifications.slice(0, 5).forEach((q: string) => lines.push(`• ${q}`));
    lines.push('');
  }

  const applyUrl = job.apply_url || `https://outstahub.com/jobs/${job.id}`;
  lines.push(`Apply here: ${applyUrl}`);
  lines.push('');
  lines.push('#hiring #remotejobs #OutSta');
  return lines.join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const LINKEDIN_API_KEY = Deno.env.get('LINKEDIN_API_KEY');

    if (!LOVABLE_API_KEY || !LINKEDIN_API_KEY) {
      return new Response(JSON.stringify({ error: 'LinkedIn connector not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authed = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await authed.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claims.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: isAdmin } = await admin.rpc('is_admin', { _user_id: userId });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const jobId = body?.job_id as string | undefined;
    if (!jobId) {
      return new Response(JSON.stringify({ error: 'job_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: job, error: jobErr } = await admin
      .from('jobs').select('*').eq('id', jobId).maybeSingle();
    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: 'Job not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1) Resolve the member URN via /v2/userinfo
    const uiRes = await fetch(`${GATEWAY}/v2/userinfo`, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': LINKEDIN_API_KEY,
      },
    });
    const uiText = await uiRes.text();
    if (!uiRes.ok) {
      await admin.from('jobs').update({ linkedin_last_error: `userinfo ${uiRes.status}: ${uiText.slice(0, 500)}` }).eq('id', jobId);
      return new Response(JSON.stringify({ error: 'LinkedIn userinfo failed', status: uiRes.status, details: uiText }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const ui = JSON.parse(uiText);
    const memberId = ui.sub as string;
    const authorUrn = `urn:li:person:${memberId}`;

    // 2) Publish a UGC post
    const text = buildPostText(job);
    const ugcBody = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    };

    const postRes = await fetch(`${GATEWAY}/v2/ugcPosts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': LINKEDIN_API_KEY,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(ugcBody),
    });
    const postText = await postRes.text();
    if (!postRes.ok) {
      await admin.from('jobs').update({ linkedin_last_error: `ugcPosts ${postRes.status}: ${postText.slice(0, 800)}` }).eq('id', jobId);
      return new Response(JSON.stringify({ error: 'LinkedIn post failed', status: postRes.status, details: postText }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let postId = '';
    try {
      const parsed = JSON.parse(postText);
      postId = parsed.id || '';
    } catch {
      postId = postRes.headers.get('x-restli-id') || postRes.headers.get('x-linkedin-id') || '';
    }
    if (!postId) postId = postRes.headers.get('x-restli-id') || '';

    const activityId = postId.includes(':') ? postId.split(':').pop() : postId;
    const postUrl = activityId ? `https://www.linkedin.com/feed/update/${postId}/` : null;

    await admin.from('jobs').update({
      linkedin_post_id: postId || null,
      linkedin_post_url: postUrl,
      linkedin_posted_at: new Date().toISOString(),
      linkedin_last_error: null,
    }).eq('id', jobId);

    return new Response(JSON.stringify({ success: true, post_id: postId, post_url: postUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('post-job-to-linkedin error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
