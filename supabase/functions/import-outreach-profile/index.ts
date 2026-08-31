import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-import-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Accepts either:
//  1) A valid admin JWT (Authorization: Bearer ...) — imported_by is set to that user
//  2) The shared extension key (x-import-key header matching OUTREACH_IMPORT_KEY)
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const admin = createClient(SUPABASE_URL, SERVICE);

    const authHeader = req.headers.get('Authorization');
    const importKey = req.headers.get('x-import-key');
    let userId: string | null = null;
    let authorized = false;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const authed = createClient(SUPABASE_URL, ANON, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claims } = await authed.auth.getClaims(token);
      const uid = claims?.claims?.sub as string | undefined;
      if (uid) {
        const { data: isAdmin } = await admin.rpc('is_admin', { _user_id: uid });
        if (isAdmin) {
          authorized = true;
          userId = uid;
        }
      }
    }

    if (!authorized && importKey) {
      const { data: setting } = await admin
        .from('outreach_settings')
        .select('value')
        .eq('key', 'import_key')
        .maybeSingle();
      if (setting?.value && importKey === setting.value) {
        authorized = true;
      }
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const fullName = (body?.full_name || '').toString().trim();
    if (!fullName) {
      return new Response(JSON.stringify({ error: 'full_name is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizeUrl = (u: unknown): string | null => {
      if (!u || typeof u !== 'string') return null;
      let url = u.trim();
      if (!url) return null;
      url = url.split('?')[0].replace(/\/+$/, '');
      return url || null;
    };

    const linkedinUrl = normalizeUrl(body.linkedin_url);
    const str = (v: unknown, max = 2000): string | null => {
      if (v == null) return null;
      const s = String(v).trim();
      return s ? s.slice(0, max) : null;
    };
    const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v.slice(0, 50) : []);

    const row: Record<string, unknown> = {
      full_name: fullName.slice(0, 200),
      headline: str(body.headline, 500),
      current_title: str(body.current_title, 300),
      current_company: str(body.current_company, 300),
      location: str(body.location, 300),
      linkedin_url: linkedinUrl,
      about: str(body.about, 8000),
      experience: arr(body.experience),
      education: arr(body.education),
      skills: arr(body.skills),
      photo_url: str(body.photo_url, 1000),
      source: str(body.source, 100) || 'linkedin-extension',
    };
    if (userId) row.imported_by = userId;

    let result;
    if (linkedinUrl) {
      // Upsert on the LinkedIn URL so re-importing a profile refreshes it
      result = await admin
        .from('outreach_prospects')
        .upsert(row, { onConflict: 'linkedin_url' })
        .select('id, full_name, status')
        .single();
    } else {
      result = await admin
        .from('outreach_prospects')
        .insert(row)
        .select('id, full_name, status')
        .single();
    }

    if (result.error) {
      console.error('outreach_prospects upsert failed:', result.error);
      return new Response(JSON.stringify({ error: result.error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, prospect: result.data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('import-outreach-profile error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
