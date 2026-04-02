import { useState, useEffect } from 'react';
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

async function fetchHistory(email: string, phone?: string | null): Promise<OtherApplication[]> {
  const cacheKey = `${email}|${phone || ''}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;
  if (pendingRequests.has(cacheKey)) return pendingRequests.get(cacheKey)!;

  const promise = (async () => {
    // Clean phone for matching (strip non-digits)
    const cleanPhone = phone?.replace(/[^0-9]/g, '');
    const hasPhone = cleanPhone && cleanPhone.length >= 7;

    let query;
    if (hasPhone) {
      // Match by email OR phone number
      query = supabase
        .from('applicants_prescreen')
        .select('id, job_title, status, submitted_at, total_score, job_id')
        .or(`email.eq.${email},phone.eq.${phone}`)
        .order('submitted_at', { ascending: false });
    } else {
      query = supabase
        .from('applicants_prescreen')
        .select('id, job_title, status, submitted_at, total_score, job_id')
        .eq('email', email)
        .order('submitted_at', { ascending: false });
    }

    const { data } = await query;
    
    // Deduplicate by id
    const seen = new Set<string>();
    const results: OtherApplication[] = [];
    for (const item of data || []) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        results.push(item as OtherApplication);
      }
    }
    
    cache.set(cacheKey, results);
    pendingRequests.delete(cacheKey);
    return results;
  })();

  pendingRequests.set(cacheKey, promise);
  return promise;
}

export function clearApplicationHistoryCache() {
  cache.clear();
  pendingRequests.clear();
}

export function useApplicationHistory(email: string, currentId: string, phone?: string | null) {
  const [otherApplications, setOtherApplications] = useState<OtherApplication[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!email) return;
    
    let cancelled = false;
    setLoading(true);

    fetchHistory(email, phone).then(results => {
      if (!cancelled) {
        setOtherApplications(results.filter(a => a.id !== currentId));
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [email, currentId, phone]);

  return { otherApplications, loading, totalApplications: otherApplications.length + 1 };
}
