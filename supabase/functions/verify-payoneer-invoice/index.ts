import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string' || !/^https?:\/\/(link\.)?payoneer\.com\//i.test(url)) {
      return new Response(JSON.stringify({ error: 'A valid Payoneer link is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OutStaBot/1.0)',
        'Accept': 'text/html',
      },
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `Payoneer responded ${res.status}`, status: res.status }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const html = await res.text();

    // Payoneer renders amount like: "400.00 USD" or "1,234.56 USD"
    const matches = [...html.matchAll(/([\d,]+\.\d{2})\s*(USD|EUR|GBP|AUD|CAD)/gi)];
    // Pick the largest one to avoid catching fees/etc.
    let amount: number | null = null;
    let currency: string | null = null;
    for (const m of matches) {
      const n = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(n) && (amount === null || n > amount)) {
        amount = n;
        currency = m[2].toUpperCase();
      }
    }

    if (amount === null) {
      return new Response(
        JSON.stringify({ error: 'Could not extract amount from Payoneer page', amount: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

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
