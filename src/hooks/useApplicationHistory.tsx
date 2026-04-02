import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OtherApplication {
  id: string;
  job_title: string;
  status: string;
  submitted_at: string;
  total_score: number | null;
  job_id: string | null;
}

// Module-level cache shared across all hook instances
const cache = new Map<string, OtherApplication[]>();
const pendingRequests = new Map<string, Promise<OtherApplication[]>>();

async function fetchHistory(email: string): Promise<OtherApplication[]> {
  if (cache.has(email)) return cache.get(email)!;
  if (pendingRequests.has(email)) return pendingRequests.get(email)!;

  const promise = (async () => {
    const { data } = await supabase
      .from('applicants_prescreen')
      .select('id, job_title, status, submitted_at, total_score, job_id')
      .eq('email', email)
      .order('submitted_at', { ascending: false });
    
    const results = (data || []) as OtherApplication[];
    cache.set(email, results);
    pendingRequests.delete(email);
    return results;
  })();

  pendingRequests.set(email, promise);
  return promise;
}

export function clearApplicationHistoryCache() {
  cache.clear();
  pendingRequests.clear();
}

export function useApplicationHistory(email: string, currentId: string) {
  const [otherApplications, setOtherApplications] = useState<OtherApplication[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!email) return;
    
    let cancelled = false;
    setLoading(true);

    fetchHistory(email).then(results => {
      if (!cancelled) {
        setOtherApplications(results.filter(a => a.id !== currentId));
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [email, currentId]);

  return { otherApplications, loading, totalApplications: otherApplications.length + 1 };
}
