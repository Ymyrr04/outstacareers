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
    const results: string[] = [];

    // --- 1. Activate scheduled contractors whose start_date has arrived ---
    const { data: scheduledContractors, error: fetchScheduledError } = await supabase
      .from('contractor_assignments')
      .select('id, start_date, applicant:applicants_prescreen(full_name)')
      .eq('status', 'scheduled')
      .lte('start_date', today);

    if (fetchScheduledError) throw fetchScheduledError;

    if (scheduledContractors && scheduledContractors.length > 0) {
      const ids = scheduledContractors.map(c => c.id);
      const { error: updateError } = await supabase
        .from('contractor_assignments')
        .update({ status: 'active' })
        .in('id', ids);

      if (updateError) throw updateError;

      const names = scheduledContractors
        .map(c => {
          const applicant = c.applicant as unknown as { full_name: string } | null;
          return applicant?.full_name || 'Unknown';
        })
        .join(', ');

      console.log(`Activated ${scheduledContractors.length} scheduled contractors: ${names}`);
      results.push(`Activated ${scheduledContractors.length}: ${names}`);
    }

    // --- 2. Transition rendering contractors whose end_date has passed ---
    const { data: renderingContractors, error: fetchRenderingError } = await supabase
      .from('contractor_assignments')
      .select('id, end_date, notes, applicant:applicants_prescreen(full_name)')
      .eq('status', 'rendering')
      .not('end_date', 'is', null)
      .lte('end_date', today);

    if (fetchRenderingError) throw fetchRenderingError;

    if (renderingContractors && renderingContractors.length > 0) {
      for (const contractor of renderingContractors) {
        // Determine final status from notes: "Rendering for termination" or "Rendering for resign"
        const notes = (contractor.notes || '').toLowerCase();
        const finalStatus = notes.includes('termination') ? 'terminated' : 'resigned';

        const { error: updateError } = await supabase
          .from('contractor_assignments')
          .update({ status: finalStatus })
          .eq('id', contractor.id);

        if (updateError) {
          console.error(`Failed to transition contractor ${contractor.id}:`, updateError);
          continue;
        }

        const applicant = contractor.applicant as unknown as { full_name: string } | null;
        const name = applicant?.full_name || 'Unknown';
        console.log(`Transitioned ${name} from rendering to ${finalStatus}`);
        results.push(`${name} → ${finalStatus}`);
      }
    }

    const totalUpdated = (scheduledContractors?.length || 0) + (renderingContractors?.length || 0);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: totalUpdated === 0 
          ? "No contractors to process" 
          : `Processed ${totalUpdated} contractors`,
        updated: totalUpdated,
        details: results
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