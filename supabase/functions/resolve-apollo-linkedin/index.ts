import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const APOLLO_API_URL = 'https://api.apollo.io';

type ResolveRequest = {
  person_id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string | null;
  title?: string | null;
  organization_name?: string | null;
  organization_website?: string | null;
};

const normalizeLinkedInUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  if (trimmed.startsWith('linkedin.com') || trimmed.startsWith('www.linkedin.com')) {
    return `https://${trimmed.replace(/^\/+/, '')}`;
  }

  if (trimmed.startsWith('/in/')) {
    return `https://www.linkedin.com${trimmed}`;
  }

  return null;
};

const extractLinkedInUrl = (payload: any): string | null => {
  const candidates = [
    payload?.person?.linkedin_url,
    payload?.person?.linkedin_profile_url,
    payload?.person?.linkedin,
    payload?.person?.social_links?.linkedin,
    payload?.person?.social_links?.linkedin_url,
    payload?.linkedin_url,
    payload?.linkedin_profile_url,
    payload?.linkedin,
    payload?.data?.person?.linkedin_url,
    payload?.data?.person?.linkedin_profile_url,
    payload?.data?.linkedin_url,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeLinkedInUrl(candidate);
    if (normalized) return normalized;
  }

  return null;
};

const extractDomain = (website?: string | null): string | undefined => {
  if (!website) return undefined;

  try {
    const normalized = website.startsWith('http') ? website : `https://${website}`;
    const hostname = new URL(normalized).hostname.replace(/^www\./, '');
    return hostname || undefined;
  } catch {
    return undefined;
  }
};

const callApollo = async (
  apiKey: string,
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
) => {
  const response = await fetch(`${APOLLO_API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey,
    },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });

  const rawText = await response.text();
  const data = rawText ? JSON.parse(rawText) : {};

  if (!response.ok) {
    throw new Error(`Apollo ${method} ${path} failed [${response.status}]: ${rawText}`);
  }

  return data;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const APOLLO_API_KEY = Deno.env.get('APOLLO_API_KEY');
    if (!APOLLO_API_KEY) {
      throw new Error('APOLLO_API_KEY is not configured');
    }

    const {
      person_id,
      full_name,
      first_name,
      last_name,
      title,
      organization_name,
      organization_website,
    }: ResolveRequest = await req.json();

    if (!person_id) {
      return new Response(JSON.stringify({ error: 'person_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const organizationDomain = extractDomain(organization_website);

    const attempts: Array<{
      label: string;
      method: 'GET' | 'POST';
      path: string;
      body?: Record<string, unknown>;
    }> = [
      {
        label: 'people/match by id',
        method: 'POST',
        path: '/api/v1/people/match',
        body: { id: person_id },
      },
      {
        label: 'people/match by person_id',
        method: 'POST',
        path: '/api/v1/people/match',
        body: { person_id },
      },
      {
        label: 'people by id',
        method: 'GET',
        path: `/api/v1/people/${person_id}`,
      },
      {
        label: 'people/match by profile fields',
        method: 'POST',
        path: '/api/v1/people/match',
        body: {
          name: full_name,
          first_name,
          last_name,
          title,
          organization_name,
          domain: organizationDomain,
        },
      },
    ];

    const errors: string[] = [];

    for (const attempt of attempts) {
      try {
        const data = await callApollo(APOLLO_API_KEY, attempt.path, attempt.method, attempt.body);
        const linkedinUrl = extractLinkedInUrl(data);

        if (linkedinUrl) {
          return new Response(JSON.stringify({
            linkedin_url: linkedinUrl,
            source: attempt.label,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown Apollo error';
        errors.push(`${attempt.label}: ${message}`);
      }
    }

    return new Response(JSON.stringify({
      error: 'Exact LinkedIn profile not found from Apollo',
      linkedin_url: null,
      details: errors,
    }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Resolve Apollo LinkedIn error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
