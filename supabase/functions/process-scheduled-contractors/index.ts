import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];

    // Find all contractors with status 'scheduled' and start_date <= today
    const { data: scheduledContractors, error: fetchError } = await supabase
      .from('contractor_assignments')
      .select('id, start_date, applicant:applicants_prescreen(full_name)')
      .eq('status', 'scheduled')
      .lte('start_date', today);

    if (fetchError) {
      throw fetchError;
    }

    if (!scheduledContractors || scheduledContractors.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No scheduled contractors to activate",
          updated: 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update all matching contractors to 'active'
    const contractorIds = scheduledContractors.map(c => c.id);
    
    const { error: updateError } = await supabase
      .from('contractor_assignments')
      .update({ status: 'active' })
      .in('id', contractorIds);

    if (updateError) {
      throw updateError;
    }

    const activatedNames = scheduledContractors
      .map(c => {
        const applicant = c.applicant as unknown as { full_name: string } | null;
        return applicant?.full_name || 'Unknown';
      })
      .join(', ');

    console.log(`Activated ${scheduledContractors.length} contractors: ${activatedNames}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Activated ${scheduledContractors.length} contractors`,
        updated: scheduledContractors.length,
        contractors: activatedNames
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error processing scheduled contractors:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});