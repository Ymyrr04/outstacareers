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

    const results: string[] = [];

    // 1. Get all pipeline stages ordered
    const { data: stages, error: stagesError } = await supabase
      .from('contractor_pipeline_stages')
      .select('*')
      .order('stage_order', { ascending: true });

    if (stagesError) throw stagesError;
    if (!stages || stages.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No pipeline stages configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Get all active contractor assignments that have tracking entries
    const { data: tracked, error: trackedError } = await supabase
      .from('contractor_pipeline_tracking')
      .select(`
        *,
        contractor:contractor_assignments(
          id, start_date, status, job_title, client_id, applicant_id,
          applicant:applicants_prescreen(full_name, email),
          client:clients(company_name)
        )
      `);

    if (trackedError) throw trackedError;

    // 3. Get active assignments NOT yet in tracking (auto-add them)
    const trackedAssignmentIds = (tracked || []).map((t: any) => t.contractor_assignment_id);
    const { data: activeAssignments, error: activeError } = await supabase
      .from('contractor_assignments')
      .select('id, start_date, status, job_title, client_id, applicant_id')
      .in('status', ['active', 'scheduled']);

    if (activeError) throw activeError;

    const firstStage = stages[0];
    const newAssignments = (activeAssignments || []).filter(
      (a: any) => !trackedAssignmentIds.includes(a.id)
    );

    if (newAssignments.length > 0) {
      const inserts = newAssignments.map((a: any) => ({
        contractor_assignment_id: a.id,
        current_stage_id: firstStage.id,
      }));

      const { error: insertError } = await supabase
        .from('contractor_pipeline_tracking')
        .insert(inserts);

      if (insertError) {
        console.error('Error inserting new tracking entries:', insertError);
      } else {
        results.push(`Added ${newAssignments.length} new contractors to pipeline`);
      }
    }

    // 4. Auto-advance contractors based on days elapsed
    const today = new Date();
    let advancedCount = 0;

    for (const item of (tracked || []) as any[]) {
      const contractor = item.contractor;
      if (!contractor || !contractor.start_date) continue;
      if (contractor.status !== 'active') continue;

      const startDate = new Date(contractor.start_date);
      const daysElapsed = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      // Find what stage they should be in
      const currentStageIndex = stages.findIndex((s: any) => s.id === item.current_stage_id);
      let targetStageIndex = currentStageIndex;

      for (let i = currentStageIndex + 1; i < stages.length; i++) {
        if (daysElapsed >= stages[i].trigger_days) {
          targetStageIndex = i;
        } else {
          break;
        }
      }

      if (targetStageIndex > currentStageIndex) {
        const targetStage = stages[targetStageIndex];

        // Update tracking
        const { error: updateError } = await supabase
          .from('contractor_pipeline_tracking')
          .update({
            current_stage_id: targetStage.id,
            moved_at: new Date().toISOString(),
            auto_moved: true,
          })
          .eq('id', item.id);

        if (updateError) {
          console.error(`Error advancing ${contractor.id}:`, updateError);
          continue;
        }

        const applicant = contractor.applicant as any;
        const name = applicant?.full_name || 'Unknown';
        advancedCount++;
        results.push(`${name} → ${targetStage.name}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed: ${advancedCount} advanced, ${emailsSent} emails sent, ${newAssignments.length} new entries`,
        details: results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error processing milestones:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
