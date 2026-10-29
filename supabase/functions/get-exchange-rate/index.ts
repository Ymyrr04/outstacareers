import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const FALLBACK = 56;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: row } = await supabase
    .from('exchange_rates').select('rate_per_usd, fetched_at').eq('currency', 'PHP').maybeSingle();

  const stored = row
    ? { rate: Number(row.rate_per_usd), fetched_at: row.fetched_at as string }
    : { rate: FALLBACK, fetched_at: null };

  if (row && Date.now() - new Date(row.fetched_at).getTime() < MAX_AGE_MS) return json(stored);

  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const body = await res.json();
    const rate = Number(body?.rates?.PHP);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('invalid PHP rate');
    const fetched_at = new Date().toISOString();
    const { error } = await supabase
      .from('exchange_rates').upsert({ currency: 'PHP', rate_per_usd: rate, fetched_at });
    if (error) console.error('upsert failed', error.message);
    return json({ rate, fetched_at });
  } catch (e) {
    console.error('exchange rate fetch failed', e);
    return json(stored);
  }
});
