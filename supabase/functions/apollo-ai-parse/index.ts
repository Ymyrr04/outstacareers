import { logAiUsage } from "../_shared/logAiUsage.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SENIORITY = ['entry', 'senior', 'manager', 'director', 'vp', 'c_suite'];
const DEPARTMENTS = [
  'engineering_technical', 'operations', 'marketing', 'sales', 'finance',
  'human_resources', 'support', 'information_technology', 'education', 'media_communications',
];
const EMPLOYEE_RANGES = ['1,10', '11,50', '51,200', '201,500', '501,1000', '1001,5000', '5001,10000', '10001,'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: 'Prompt required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const systemPrompt = `You convert a recruiter's natural-language candidate search into structured Apollo.io search filters.

Return ONLY valid JSON (no markdown, no prose) with this shape:
{
  "jobTitle": string,        // primary job title(s), comma-separated. REQUIRED.
  "location": string,        // country/city, e.g. "Philippines"
  "industry": string,        // e.g. "SaaS", "E-commerce"
  "companyDomain": string,   // e.g. "shopify.com"
  "skills": string,          // comma-separated skills, e.g. "Python, SQL"
  "tools": string,           // comma-separated tools/software, e.g. "Zapier, HubSpot"
  "seniority": string[],     // subset of: ${SENIORITY.join(', ')}
  "department": string[],    // subset of: ${DEPARTMENTS.join(', ')}
  "employeeCountRange": string[] // subset of: ${EMPLOYEE_RANGES.join(' | ')}
}

Rules:
- Omit or empty-string fields not mentioned. Do NOT invent values.
- Map casual terms: "small company" -> ["1,10","11,50"], "mid-size" -> ["51,200","201,500"], "enterprise/large" -> ["1001,5000","5001,10000","10001,"].
- Map "VP" -> "vp", "CEO/CTO/CFO/C-level" -> "c_suite", "junior/entry" -> "entry".
- Keep jobTitle broad but specific (e.g. "VP of Engineering" not just "Engineering").`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Lovable-AIG-SDK': 'raw-fetch',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const txt = await response.text();
      console.error('AI error', response.status, txt);
      return new Response(JSON.stringify({ error: `AI failed: ${txt}` }), {
        status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content ?? '{}';
    logAiUsage({
      functionName: 'apollo-ai-parse',
      model: 'google/gemini-2.5-flash',
      usage: data.usage,
      context: { prompt_length: prompt.length },
    });

    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }

    const filterArr = (arr: unknown, allowed: string[]) =>
      Array.isArray(arr) ? arr.filter((v) => typeof v === 'string' && allowed.includes(v)) : [];
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

    const result = {
      jobTitle: str(parsed.jobTitle),
      location: str(parsed.location),
      industry: str(parsed.industry),
      companyDomain: str(parsed.companyDomain),
      skills: str(parsed.skills),
      tools: str(parsed.tools),
      seniority: filterArr(parsed.seniority, SENIORITY),
      department: filterArr(parsed.department, DEPARTMENTS),
      employeeCountRange: filterArr(parsed.employeeCountRange, EMPLOYEE_RANGES),
    };

    return new Response(JSON.stringify({ success: true, filters: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('apollo-ai-parse error', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
