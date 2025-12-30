import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limit: max 3 submissions per IP per hour
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_HOURS = 1;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Use service role for rate limit checking (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log('Received application submission request');

    // Get client IP for rate limiting
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    
    // Hash the IP for privacy
    const encoder = new TextEncoder();
    const data = encoder.encode(clientIP + 'salt_for_hashing');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const ipHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);

    console.log(`Processing submission from IP hash: ${ipHash}`);

    // Check honeypot field - if filled, log it but don't block (browser autofill can cause false positives)
    const honeypotFilled = body.honeypot_field && body.honeypot_field.trim() !== '';
    if (honeypotFilled) {
      console.log(`Honeypot field filled with value: "${body.honeypot_field}" - flagging but allowing submission`);
    }

    // Validate required fields
    if (!body.full_name || body.full_name.trim() === '') {
      return new Response(JSON.stringify({ error: 'Full name is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!body.email || body.email.trim() === '') {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate Vocaroo link if provided (now required)
    if (!body.vocaroo_link || body.vocaroo_link.trim() === '') {
      return new Response(JSON.stringify({ error: 'Voice introduction (Vocaroo link) is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate Vocaroo link format
    const vocarooLink = body.vocaroo_link.trim();
    if (!vocarooLink.includes('vocaroo.com') && !vocarooLink.includes('voca.ro')) {
      return new Response(JSON.stringify({ error: 'Please provide a valid Vocaroo link' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check rate limit - count submissions from this IP in the last hour
    const rateLimitWindow = new Date();
    rateLimitWindow.setHours(rateLimitWindow.getHours() - RATE_LIMIT_WINDOW_HOURS);

    const { count, error: countError } = await supabase
      .from('applicants_prescreen')
      .select('*', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', rateLimitWindow.toISOString());

    if (countError) {
      console.error('Error checking rate limit:', countError);
      // Continue anyway - don't block legitimate users due to rate limit check failures
    } else if (count && count >= RATE_LIMIT_MAX) {
      console.log(`Rate limit exceeded for IP hash ${ipHash}: ${count} submissions in last hour`);
      return new Response(JSON.stringify({ 
        error: 'Too many submissions. Please try again later.' 
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insert the application with all fields including CV scoring and Vocaroo
    const insertData: Record<string, unknown> = {
      full_name: body.full_name.trim(),
      email: body.email.trim().toLowerCase(),
      home_office: body.home_office,
      noise_canceling_headset: body.noise_canceling_headset,
      laptop_or_pc: body.laptop_or_pc,
      good_internet: body.good_internet,
      internet_speed: body.internet_speed?.trim() || '',
      power_backup: body.power_backup,
      can_work_40_50: body.can_work_40_50,
      us_timezone_ok: body.us_timezone_ok,
      start_availability: body.start_availability?.trim() || '',
      has_experience: body.has_experience,
      currently_working: body.currently_working,
      location: body.location?.trim() || '',
      job_title: body.job_title,
      job_id: body.job_id,
      apply_url: body.apply_url,
      status: 'new',
      ip_hash: ipHash,
      honeypot_field: null,
      // New CV scoring fields
      cv_file_url: body.cv_file_url || null,
      cv_text: body.cv_text || null,
      role_experience_score: body.role_experience_score ?? null,
      skills_tools_score: body.skills_tools_score ?? null,
      availability_setup_score: body.availability_setup_score ?? null,
      bonus_red_flag_score: body.bonus_red_flag_score ?? null,
      total_score: body.total_score ?? null,
      ranking_status: body.ranking_status || null,
      ai_summary: body.ai_summary || null,
      ai_assessment_details: body.ai_assessment_details || null,
      vocaroo_link: vocarooLink,
    };

    console.log('Inserting application with CV scoring data:', {
      total_score: insertData.total_score,
      ranking_status: insertData.ranking_status,
      has_cv: !!insertData.cv_file_url,
      has_vocaroo: !!insertData.vocaroo_link,
    });

    const { error: insertError } = await supabase
      .from('applicants_prescreen')
      .insert(insertData);

    if (insertError) {
      console.error('Error inserting application:', insertError);
      return new Response(JSON.stringify({ 
        error: 'Failed to submit application. Please try again.' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Application submitted successfully');
    return new Response(JSON.stringify({ 
      success: true,
      message: 'Application submitted successfully' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in submit-application function:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
