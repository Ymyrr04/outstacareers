import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_PHP_RATE } from '@/lib/jobRate';

const STALE_MS = 24 * 60 * 60 * 1000;

/** USD→PHP rate; refreshes via the backend when the stored rate is over 24h old. */
export function useExchangeRate() {
  const [rate, setRate] = useState(DEFAULT_PHP_RATE);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('exchange_rates').select('rate_per_usd, fetched_at').eq('currency', 'PHP').maybeSingle();
        const r = Number(data?.rate_per_usd);
        if (!cancelled && r > 0) { setRate(r); setFetchedAt(data!.fetched_at); }
        if (!data || Date.now() - new Date(data.fetched_at).getTime() > STALE_MS) {
          const { data: fresh } = await supabase.functions.invoke('get-exchange-rate');
          const fr = Number(fresh?.rate);
          if (!cancelled && fr > 0) { setRate(fr); setFetchedAt(fresh.fetched_at ?? null); }
        }
      } catch {
        /* keep fallback */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { rate, fetchedAt };
}
