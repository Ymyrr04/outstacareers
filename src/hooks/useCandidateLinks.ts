import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CandidateLink {
  requestId: string;
  clientName: string;
  jobTitle: string;
  createdAt: string;
}

type LinkMap = Record<string, CandidateLink[]>;

let cache: LinkMap | null = null;
let inFlight: Promise<LinkMap> | null = null;
const listeners = new Set<(m: LinkMap) => void>();

interface CommentRow {
  linked_applicant_id: string | null;
  created_at: string;
  request_id: string;
  client_hiring_requests: {
    job_title: string | null;
    clients: { company_name: string | null } | null;
  } | null;
}

async function fetchLinks(): Promise<LinkMap> {
  const { data, error } = await supabase
    .from('hiring_request_comments')
    .select('linked_applicant_id, created_at, request_id, client_hiring_requests(job_title, clients(company_name))')
    .not('linked_applicant_id', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error loading candidate links:', error);
    return {};
  }

  const map: LinkMap = {};
  for (const row of (data as unknown as CommentRow[]) || []) {
    if (!row.linked_applicant_id) continue;
    const entry: CandidateLink = {
      requestId: row.request_id,
      clientName: row.client_hiring_requests?.clients?.company_name || 'Unknown client',
      jobTitle: row.client_hiring_requests?.job_title || '',
      createdAt: row.created_at,
    };
    (map[row.linked_applicant_id] ||= []).push(entry);
  }
  return map;
}

function load(force = false): Promise<LinkMap> {
  if (!force && cache) return Promise.resolve(cache);
  if (!force && inFlight) return inFlight;
  inFlight = fetchLinks().then((m) => {
    cache = m;
    inFlight = null;
    listeners.forEach((l) => l(m));
    return m;
  });
  return inFlight;
}

/** Invalidate + reload the shared cache (call after a new link is created). */
export function refreshCandidateLinks() {
  void load(true);
}

/** Links previously created for a candidate, newest first. */
export function useCandidateLinks(applicantId: string): CandidateLink[] {
  const [links, setLinks] = useState<CandidateLink[]>(() => cache?.[applicantId] || []);

  useEffect(() => {
    let active = true;
    const listener = (m: LinkMap) => {
      if (active) setLinks(m[applicantId] || []);
    };
    listeners.add(listener);
    void load().then(listener);
    return () => {
      active = false;
      listeners.delete(listener);
    };
  }, [applicantId]);

  return links;
}
