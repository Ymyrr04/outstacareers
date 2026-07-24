import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const FIRECRAWL_V2 = 'https://api.firecrawl.dev/v2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function extractAmount(text: string): { amount: number | null; currency: string | null } {
  if (!text) return { amount: null, currency: null };
  const matches = [...text.matchAll(/([\d,]+\.\d{2})\s*(USD|EUR|GBP|AUD|CAD)/gi)];
  let amount: number | null = null;
  let currency: string | null = null;
  for (const m of matches) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (!isNaN(n) && (amount === null || n > amount)) {
      amount = n;
      currency = m[2].toUpperCase();
    }
  }
  return { amount, currency };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { url, force } = await req.json();
    if (!url || typeof url !== 'string' || !/^https?:\/\/(link\.|app\.)?payoneer\.com\//i.test(url)) {
      return new Response(JSON.stringify({ error: 'A valid Payoneer link is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Return cached verification if we already have an amount (unless forced)
    if (!force) {
      const { data: cached } = await supabase
        .from('payoneer_verifications')
        .select('amount, currency, error')
        .eq('url', url)
        .maybeSingle();
      if (cached && cached.amount !== null) {
        return new Response(
          JSON.stringify({ amount: Number(cached.amount), currency: cached.currency, cached: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlKey) {
      return new Response(JSON.stringify({ error: 'FIRECRAWL_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fcRes = await fetch(`${FIRECRAWL_V2}/scrape`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: false,
        waitFor: 2000,
      }),
    });

    if (!fcRes.ok) {
      const body = await fcRes.text();
      const err = `Firecrawl failed [${fcRes.status}]: ${body}`;
      await supabase.from('payoneer_verifications').upsert({ url, amount: null, currency: null, error: err, verified_at: new Date().toISOString() });
      return new Response(
        JSON.stringify({ error: err, amount: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const fcJson = await fcRes.json();
    const markdown: string =
      fcJson?.data?.markdown || fcJson?.markdown || fcJson?.data?.html || fcJson?.html || '';

    const { amount, currency } = extractAmount(markdown);
    if (amount === null) {
      await supabase.from('payoneer_verifications').upsert({ url, amount: null, currency: null, error: 'Could not extract amount', verified_at: new Date().toISOString() });
      return new Response(
        JSON.stringify({ error: 'Could not extract amount from Payoneer page', amount: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    await supabase.from('payoneer_verifications').upsert({ url, amount, currency, error: null, verified_at: new Date().toISOString() });

    return new Response(JSON.stringify({ amount, currency }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
