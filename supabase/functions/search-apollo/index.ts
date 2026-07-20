import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const APOLLO_API_URL = 'https://api.apollo.io';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const APOLLO_API_KEY = Deno.env.get('APOLLO_API_KEY');
    if (!APOLLO_API_KEY) {
      throw new Error('APOLLO_API_KEY is not configured');
    }

    const { job_title, location, skills, tools, seniority, industry, company_domain, department, employee_count_range, per_page = 10, page = 1 } = await req.json();

    if (!job_title) {
      throw new Error('job_title is required');
    }

    // Build Apollo people search request body (no api_key in body)
    const searchBody: Record<string, unknown> = {
      q_keywords: job_title,
      page: page,
      per_page: Math.min(per_page, 100),
    };

    if (job_title) {
      searchBody.person_titles = [job_title];
    }

    if (location) {
      searchBody.person_locations = Array.isArray(location) ? location : [location];
    }

    if (seniority && seniority.length > 0) {
      searchBody.person_seniorities = seniority;
    }

    if (department && department.length > 0) {
      searchBody.person_departments = Array.isArray(department) ? department : [department];
    }

    if (company_domain) {
      const domains = Array.isArray(company_domain) ? company_domain : [company_domain];
      searchBody.q_organization_domains_list = domains.map((d: string) => d.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''));
    }

    if (employee_count_range && employee_count_range.length > 0) {
      searchBody.organization_num_employees_ranges = employee_count_range;
    }

    // Skills, tools, and industry go into q_keywords as an OR query so they broaden
    // (not narrow) matches. Apollo treats space-separated terms as AND, so we join
    // with " OR " and wrap multi-word phrases in quotes. Job title is already filtered
    // via person_titles — don't duplicate it into keywords (that makes results AND-strict).
    const normalizeList = (v: unknown): string[] => {
      if (!v) return [];
      if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
      return String(v).split(',').map((x) => x.trim()).filter(Boolean);
    };
    const quote = (s: string) => (s.includes(' ') ? `"${s}"` : s);
    const skillList = normalizeList(skills);
    const toolList = normalizeList(tools);
    const keywordParts: string[] = [];
    if (industry) keywordParts.push(quote(String(industry)));
    if (skillList.length) keywordParts.push(...skillList.map(quote));
    if (toolList.length) keywordParts.push(...toolList.map(quote));
    if (keywordParts.length) {
      searchBody.q_keywords = keywordParts.join(' OR ');
    } else {
      delete searchBody.q_keywords;
    }

    console.log('Apollo search request:', JSON.stringify(searchBody));

    const response = await fetch(`${APOLLO_API_URL}/v1/mixed_people/api_search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': APOLLO_API_KEY,
      },
      body: JSON.stringify(searchBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Apollo API error [${response.status}]:`, errorText);
      throw new Error(`Apollo API error [${response.status}]: ${errorText}`);
    }

    const data = await response.json();

    const results = (data.people || []).map((person: any) => {
      const firstName = person.first_name || person.firstName || '';
      const rawLastName =
        person.last_name ||
        person.lastName ||
        person.last_name_obfuscated ||
        person.lastNameObfuscated ||
        '';
      const lastName = typeof rawLastName === 'string' ? rawLastName.trim() : '';
      const fallbackName = person.full_name || person.fullName || person.name || '';
      const fullName = `${firstName} ${lastName}`.trim() || fallbackName || firstName || 'Unknown Candidate';

      const rawLinkedIn =
        person.linkedin_url ||
        person.linkedin_profile_url ||
        person.linkedin ||
        person.social_links?.linkedin ||
        person.social_links?.linkedin_url ||
        person.links?.linkedin ||
        null;

      const linkedin_url = typeof rawLinkedIn === 'string' && rawLinkedIn.trim()
        ? rawLinkedIn.startsWith('http')
          ? rawLinkedIn
          : `https://${rawLinkedIn.replace(/^\/+/, '')}`
        : null;

      return {
        id: person.id,
        full_name: fullName,
        first_name: firstName || fullName.split(' ')[0] || '',
        last_name: lastName || null,
        email: person.email,
        email_status: person.email_status,
        title: person.title,
        headline: person.headline,
        linkedin_url,
        photo_url: person.photo_url,
        city: person.city,
        state: person.state,
        country: person.country,
        location: [person.city, person.state, person.country].filter(Boolean).join(', '),
        organization: person.organization ? {
          name: person.organization.name,
          website: person.organization.website_url,
          industry: person.organization.industry,
          size: person.organization.estimated_num_employees,
        } : null,
        seniority: person.seniority,
        departments: person.departments,
      };
    });

    return new Response(JSON.stringify({
      results,
      total: data.pagination?.total_entries || results.length,
      page: data.pagination?.page || page,
      per_page: data.pagination?.per_page || per_page,
      total_pages: data.pagination?.total_pages || 1,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Apollo search error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
