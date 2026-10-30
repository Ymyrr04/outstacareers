import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_PHP_RATE } from '@/lib/jobRate';

const STALE_MS = 24 * 60 * 60 * 1000;

/**
 * USD→currency rate; refreshes via the backend when the stored rate is over 24h old.
 * Only loads while `enabled`. PHP falls back to ₱56; other currencies return null until known.
 */
export function useExchangeRate(currency = 'PHP', enabled = true) {
  const code = currency.toUpperCase();
  const fallback = code === 'PHP' ? DEFAULT_PHP_RATE : null;
  const [state, setState] = useState<{ code: string; rate: number | null; fetchedAt: string | null }>(
    { code, rate: fallback, fetchedAt: null },
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const set = (rate: number, fetchedAt: string | null) => {
      if (!cancelled) setState({ code, rate, fetchedAt });
    };
    (async () => {
      try {
        const { data } = await supabase
          .from('exchange_rates').select('rate_per_usd, fetched_at').eq('currency', code).maybeSingle();
        const r = Number(data?.rate_per_usd);
        if (r > 0) set(r, data!.fetched_at);
        if (!data || Date.now() - new Date(data.fetched_at).getTime() > STALE_MS) {
          const { data: fresh } = await supabase.functions.invoke('get-exchange-rate', { body: { currency: code } });
          const fr = Number(fresh?.rate);
          if (fr > 0) set(fr, fresh.fetched_at ?? null);
        }
      } catch {
        /* keep fallback */
      }
    })();
    return () => { cancelled = true; };
  }, [code, enabled]);

  const rate = state.code === code ? state.rate : fallback;
  return { rate: (rate ?? fallback) as number, known: rate != null, fetchedAt: state.code === code ? state.fetchedAt : null };
}
