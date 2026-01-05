import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Allowed origins for CORS
const allowedOrigins = [
  'https://ohxtavjababtrcrkgndq.lovableproject.com',
  'https://lovable.dev',
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (allowedOrigins.includes(origin)) return true;
  if (origin.endsWith('.lovable.app') || origin.endsWith('.lovableproject.com')) return true;
  // Don't allow localhost for analytics to prevent dev pollution
  return false;
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  const allowedOrigin = isAllowedOrigin(origin) ? origin! : allowedOrigins[0];
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// Validate event type
const validEventTypes = ['page_view', 'job_view', 'apply_click'];

// UUID validation regex
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Validate origin
    const origin = req.headers.get('origin');
    if (!isAllowedOrigin(origin)) {
      console.warn('Analytics request from disallowed origin:', origin);
      return new Response(
        JSON.stringify({ error: 'Origin not allowed' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    
    // Validate required fields
    const { event_type, job_id, page_path, referrer, user_agent, ip_hash, session_id } = body;
    
    // Validate event_type
    if (!event_type || !validEventTypes.includes(event_type)) {
      console.warn('Invalid event_type:', event_type);
      return new Response(
        JSON.stringify({ error: 'Invalid event type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Validate job_id format if provided
    if (job_id && !uuidRegex.test(job_id)) {
      console.warn('Invalid job_id format:', job_id);
      return new Response(
        JSON.stringify({ error: 'Invalid job ID format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Validate string lengths to prevent abuse
    const maxLengths = {
      page_path: 500,
      referrer: 2000,
      user_agent: 500,
      ip_hash: 128,
      session_id: 64,
    };
    
    for (const [field, maxLength] of Object.entries(maxLengths)) {
      const value = body[field];
      if (value && typeof value === 'string' && value.length > maxLength) {
        console.warn(`Field ${field} exceeds max length:`, value.length);
        return new Response(
          JSON.stringify({ error: `Field ${field} exceeds maximum length` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Create Supabase client with service role for insert
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Insert analytics event
    const { error } = await supabase.from('analytics_events').insert({
      event_type,
      job_id: job_id || null,
      page_path: page_path?.substring(0, 500) || null,
      referrer: referrer?.substring(0, 2000) || null,
      user_agent: user_agent?.substring(0, 500) || null,
      ip_hash: ip_hash?.substring(0, 128) || null,
      session_id: session_id?.substring(0, 64) || null,
    });

    if (error) {
      console.error('Database insert error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to track event' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Analytics event tracked:', event_type, job_id ? `for job ${job_id}` : '');
    
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Analytics tracking error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
