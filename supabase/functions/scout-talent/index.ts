import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { logAiUsage } from "../_shared/logAiUsage.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ScoutRequest {
  job_title: string;
  job_description: string;
  requirements: string[];
  must_have_requirements: string[];
  preferred_skills: string[];
  status_filter: string[];
  max_results: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: isAdmin } = await supabase.rpc('is_admin', { _user_id: user.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { job_title, job_description, requirements, must_have_requirements = [], preferred_skills, status_filter, max_results = 20 }: ScoutRequest = await req.json();

    if (!job_title || (!job_description && requirements.length === 0)) {
      return new Response(JSON.stringify({ error: 'Job title and description/requirements are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Build search keywords
    const allKeywords = [...(requirements || []), ...(must_have_requirements || []), ...(preferred_skills || [])];
    const searchTerms = allKeywords
      .flatMap(kw => kw.toLowerCase().split(/[,;/&]+/).map(s => s.trim()))
      .filter(s => s.length > 2);

    // Must-have terms for hard filtering
    const mustHaveTerms = (must_have_requirements || [])
      .flatMap(kw => kw.toLowerCase().split(/[,;/&]+/).map(s => s.trim()))
      .filter(s => s.length > 2);

    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminSupabase = createClient(supabaseUrl, serviceRole);

    let query = adminSupabase
      .from('applicants_prescreen')
      .select('id, full_name, email, job_title, location, cv_text, extracted_skills, extracted_tools, years_of_experience, total_score, ranking_status, ai_summary, status, cv_file_url, phone, whatsapp, is_starred')
      .not('cv_text', 'is', null);

    if (status_filter && status_filter.length > 0) {
      query = query.in('status', status_filter);
    }

    // Fetch in batches
    const BATCH_SIZE = 1000;
    let allCandidates: any[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await query.range(offset, offset + BATCH_SIZE - 1);
      if (error) { console.error('Error fetching candidates:', error); break; }
      if (data && data.length > 0) {
        allCandidates = [...allCandidates, ...data];
        offset += BATCH_SIZE;
        hasMore = data.length === BATCH_SIZE;
      } else {
        hasMore = false;
      }
    }

    console.log(`Total candidates with CV text: ${allCandidates.length}`);

    // Score candidates by keyword matches
    const scoredCandidates = allCandidates.map(candidate => {
      let keywordScore = 0;
      const matchedTerms: string[] = [];
      const cvTextLower = (candidate.cv_text || '').toLowerCase();
      const skills = (candidate.extracted_skills || []).map((s: string) => s.toLowerCase());
      const tools = (candidate.extracted_tools || []).map((t: string) => t.toLowerCase());

      // Check must-have requirements (use word boundary matching)
      let mustHaveMatched = 0;
      const mustHaveResults: { term: string; found: boolean }[] = [];
      for (const term of mustHaveTerms) {
        const inSkills = skills.some((s: string) => s.includes(term) || term.includes(s));
        const inTools = tools.some((t: string) => t.includes(term) || term.includes(t));
        const inCv = cvTextLower.includes(term);
        const found = inSkills || inTools || inCv;
        mustHaveResults.push({ term, found });
        if (found) mustHaveMatched++;
      }

      // If must-haves exist and candidate misses ANY, disqualify
      const passedMustHave = mustHaveTerms.length === 0 || mustHaveMatched === mustHaveTerms.length;

      for (const term of searchTerms) {
        const inSkills = skills.some((s: string) => s.includes(term) || term.includes(s));
        const inTools = tools.some((t: string) => t.includes(term) || term.includes(t));
        const inCv = cvTextLower.includes(term);

        if (inSkills || inTools) {
          keywordScore += 3;
          matchedTerms.push(term);
        } else if (inCv) {
          keywordScore += 1;
          matchedTerms.push(term);
        }
      }

      // Job title relevance
      const titleWords = job_title.toLowerCase().split(/\s+/);
      for (const word of titleWords) {
        if (word.length > 3 && cvTextLower.includes(word)) {
          keywordScore += 0.5;
        }
      }

      return { ...candidate, keywordScore, matchedTerms: [...new Set(matchedTerms)], passedMustHave, mustHaveResults };
    });

    // Filter: must pass must-haves, then sort by keyword score
    const passedCandidates = scoredCandidates.filter(c => c.passedMustHave && c.keywordScore > 0);
    const failedMustHaveCount = scoredCandidates.filter(c => !c.passedMustHave).length;

    passedCandidates.sort((a, b) => b.keywordScore - a.keywordScore);
    const shortlisted = passedCandidates.slice(0, Math.min(max_results * 2, 50));

    console.log(`Shortlisted ${shortlisted.length} candidates (${failedMustHaveCount} failed must-haves)`);

    if (shortlisted.length === 0) {
      return new Response(JSON.stringify({
        results: [],
        total_scanned: allCandidates.length,
        shortlisted_count: 0,
        failed_must_have_count: failedMustHaveCount,
        message: failedMustHaveCount > 0
          ? `No candidates matched. ${failedMustHaveCount} were disqualified for missing must-have requirements.`
          : 'No candidates matched the requirements based on keyword analysis.'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // PASS 2: AI evaluation
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({
        results: shortlisted.slice(0, max_results).map(c => buildKeywordResult(c, searchTerms)),
        total_scanned: allCandidates.length,
        shortlisted_count: shortlisted.length,
        failed_must_have_count: failedMustHaveCount,
        ai_evaluated: false
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const candidateSummaries = shortlisted.map(c => ({
      id: c.id,
      name: c.full_name,
      current_role: c.job_title,
      location: c.location,
      years_exp: c.years_of_experience,
      skills: (c.extracted_skills || []).slice(0, 20).join(', '),
      tools: (c.extracted_tools || []).slice(0, 20).join(', '),
      cv_excerpt: (c.cv_text || '').substring(0, 3000),
      keyword_matches: c.matchedTerms.join(', ')
    }));

    const mustHaveSection = must_have_requirements.length > 0
      ? `\n\nMUST-HAVE REQUIREMENTS (these are non-negotiable — candidates have already been pre-filtered):\n${must_have_requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
      : '';

    const systemPrompt = `You are an expert talent scout. Evaluate candidates against a job description and rank them by fit.

Return ONLY valid JSON array. Each element must have:
{
  "id": "<candidate id>",
  "match_score": <0-100>,
  "match_tier": "Strong Match" | "Partial Match" | "Low Match",
  "matched_requirements": ["<requirement met>"],
  "missing_requirements": ["<requirement not met>"],
  "reasoning": "<2-3 sentence explanation of fit>",
  "score_breakdown": {
    "experience_relevance": <0-35>,
    "skills_match": <0-30>,
    "tools_match": <0-20>,
    "industry_fit": <0-10>,
    "overall_potential": <0-5>
  }
}

SCORE BREAKDOWN (total = 100):
- experience_relevance (0-35): How closely their work history aligns with the role
- skills_match (0-30): How many required/preferred skills they possess
- tools_match (0-20): How many required tools/software they know
- industry_fit (0-10): Whether they've worked in a similar industry
- overall_potential (0-5): General impression of growth potential and adaptability

match_score = sum of all breakdown scores

TIERS:
- 80-100: Strong Match
- 50-79: Partial Match
- 0-49: Low Match

Sort by match_score descending. Only include candidates scoring >= 30.`;

    const userPrompt = `JOB: ${job_title}

DESCRIPTION: ${job_description || 'Not provided'}
${mustHaveSection}

REQUIREMENTS:
${requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

PREFERRED SKILLS:
${preferred_skills.map((s, i) => `${i + 1}. ${s}`).join('\n')}

CANDIDATES TO EVALUATE:
${JSON.stringify(candidateSummaries, null, 1)}

Return the JSON array ranking these candidates with score_breakdown.`;

    console.log('Calling AI for talent scouting evaluation...');

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI error:', aiResponse.status, errorText);

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add credits in Settings → Workspace → Usage.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        results: shortlisted.slice(0, max_results).map(c => buildKeywordResult(c, searchTerms)),
        total_scanned: allCandidates.length, shortlisted_count: shortlisted.length,
        failed_must_have_count: failedMustHaveCount, ai_evaluated: false
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const aiData = await aiResponse.json();
    let content = aiData.choices?.[0]?.message?.content || '';
    logAiUsage({
      functionName: 'scout-talent',
      model: 'google/gemini-3-flash-preview',
      usage: aiData.usage,
      context: { job_title, candidates_evaluated: allCandidates.length },
    });


    let jsonContent = content.trim();
    if (jsonContent.startsWith('```json')) jsonContent = jsonContent.slice(7);
    else if (jsonContent.startsWith('```')) jsonContent = jsonContent.slice(3);
    if (jsonContent.endsWith('```')) jsonContent = jsonContent.slice(0, -3);
    jsonContent = jsonContent.trim();

    let aiResults: any[];
    try {
      aiResults = JSON.parse(jsonContent);
    } catch {
      console.error('Failed to parse AI response:', jsonContent);
      aiResults = [];
    }

    const finalResults = aiResults
      .slice(0, max_results)
      .map((aiResult: any) => {
        const candidate = shortlisted.find(c => c.id === aiResult.id);
        if (!candidate) return null;
        return {
          id: candidate.id,
          full_name: candidate.full_name,
          email: candidate.email,
          phone: candidate.phone,
          whatsapp: candidate.whatsapp,
          job_title: candidate.job_title,
          location: candidate.location,
          status: candidate.status,
          years_of_experience: candidate.years_of_experience,
          existing_score: candidate.total_score,
          cv_file_url: candidate.cv_file_url,
          is_starred: candidate.is_starred,
          match_score: Math.max(0, Math.min(100, aiResult.match_score || 0)),
          match_tier: aiResult.match_tier || 'Low Match',
          matched_requirements: aiResult.matched_requirements || [],
          missing_requirements: aiResult.missing_requirements || [],
          ai_reasoning: aiResult.reasoning || '',
          score_breakdown: aiResult.score_breakdown || null,
        };
      })
      .filter(Boolean);

    console.log(`Returning ${finalResults.length} AI-evaluated results`);

    return new Response(JSON.stringify({
      results: finalResults,
      total_scanned: allCandidates.length,
      shortlisted_count: shortlisted.length,
      failed_must_have_count: failedMustHaveCount,
      ai_evaluated: true
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error in scout-talent:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function buildKeywordResult(c: any, searchTerms: string[]) {
  return {
    id: c.id, full_name: c.full_name, email: c.email, phone: c.phone, whatsapp: c.whatsapp,
    job_title: c.job_title, location: c.location, status: c.status,
    years_of_experience: c.years_of_experience, existing_score: c.total_score,
    cv_file_url: c.cv_file_url, is_starred: c.is_starred,
    match_score: Math.min(100, Math.round(c.keywordScore * 10)),
    matched_requirements: c.matchedTerms,
    missing_requirements: searchTerms.filter((t: string) => !c.matchedTerms.includes(t)),
    ai_reasoning: 'AI evaluation unavailable - showing keyword match results only.',
    match_tier: c.keywordScore >= 8 ? 'Strong Match' : c.keywordScore >= 4 ? 'Partial Match' : 'Low Match',
    score_breakdown: null,
  };
}
