import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParsedJobDescription {
  description: string;
  qualifications: string[];
  responsibilities: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content } = await req.json();

    if (!content || typeof content !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Content is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Parsing job description, content length:', content.length);

    const systemPrompt = `You are a job description parser. Your task is to analyze job postings and extract structured information.

Given a job description text, you must extract and return a JSON object with these fields:
1. "description": A concise general description of the role (2-4 sentences max). This should describe what the role is about, not list duties.
2. "qualifications": An array of individual qualification items (skills, experience, education requirements). Each should be a single, concise point.
3. "responsibilities": An array of individual responsibility items (duties, tasks, what the person will do). Each should be a single, concise point.

Rules:
- Keep each qualification/responsibility as a single, clear bullet point
- Remove any bullet markers, numbers, or special characters from the start of items
- Combine very similar items
- Limit to 10 items max per category
- If a section is not clearly present, return an empty array
- The description should be a cohesive paragraph, not bullet points

Return ONLY valid JSON, no markdown, no explanation.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Parse this job description:\n\n${content}` }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to parse job description' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content;

    if (!aiResponse) {
      console.error('No AI response received');
      return new Response(
        JSON.stringify({ error: 'No response from AI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Clean the response - remove markdown code blocks if present
    let cleanedResponse = aiResponse.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.slice(7);
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.slice(3);
    }
    if (cleanedResponse.endsWith('```')) {
      cleanedResponse = cleanedResponse.slice(0, -3);
    }
    cleanedResponse = cleanedResponse.trim();

    // Parse the JSON response
    let parsed: ParsedJobDescription;
    try {
      parsed = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', cleanedResponse);
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate and sanitize the response
    const result: ParsedJobDescription = {
      description: typeof parsed.description === 'string' ? parsed.description.trim() : '',
      qualifications: Array.isArray(parsed.qualifications) 
        ? parsed.qualifications.filter(q => typeof q === 'string' && q.trim()).map(q => q.trim()).slice(0, 10)
        : [],
      responsibilities: Array.isArray(parsed.responsibilities)
        ? parsed.responsibilities.filter(r => typeof r === 'string' && r.trim()).map(r => r.trim()).slice(0, 10)
        : [],
    };

    console.log('Successfully parsed job description:', {
      descriptionLength: result.description.length,
      qualificationsCount: result.qualifications.length,
      responsibilitiesCount: result.responsibilities.length,
    });

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error parsing job description:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
