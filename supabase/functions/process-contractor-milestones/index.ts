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
    let emailsSent = 0;

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
        const client = contractor.client as any;
        const name = applicant?.full_name || 'Unknown';
        advancedCount++;
        results.push(`${name} → ${targetStage.name}`);

        // Send check-in emails based on recipient setting and separate templates
        const emailRecipient = (targetStage as any).email_recipient || 'client';
        const hasClientTemplate = targetStage.checkin_email_subject && targetStage.checkin_email_body;
        const hasContractorTemplate = (targetStage as any).contractor_email_subject && (targetStage as any).contractor_email_body;

        const shouldSendClient = (emailRecipient === 'client' || emailRecipient === 'both') && hasClientTemplate;
        const shouldSendContractor = (emailRecipient === 'contractor' || emailRecipient === 'both') && hasContractorTemplate;

        if (shouldSendClient || shouldSendContractor) {
          const { data: existingEmail } = await supabase
            .from('contractor_checkin_emails')
            .select('id')
            .eq('contractor_assignment_id', contractor.id)
            .eq('stage_id', targetStage.id)
            .limit(1);

          if (!existingEmail || existingEmail.length === 0) {
            const sendTargets: { email: string; recipientName: string; subject: string; body: string }[] = [];
            const basePlaceholders = {
              contractor_name: name,
              job_title: contractor.job_title || 'Contractor',
              weeks_elapsed: String(Math.floor(daysElapsed / 7)),
            };

            if (shouldSendClient) {
              const { data: contacts } = await supabase
                .from('client_contacts')
                .select('email, full_name')
                .eq('client_id', contractor.client_id)
                .eq('is_primary', true)
                .limit(1);
              const pc = contacts?.[0];
              if (pc?.email) {
                const ph = { ...basePlaceholders, client_name: pc.full_name || client?.company_name || 'Client' };
                sendTargets.push({
                  email: pc.email,
                  recipientName: pc.full_name || 'Client',
                  subject: replacePlaceholders(targetStage.checkin_email_subject!, ph),
                  body: replacePlaceholders(targetStage.checkin_email_body!, ph),
                });
              }
            }

            if (shouldSendContractor && applicant?.email) {
              const ph = { ...basePlaceholders, client_name: client?.company_name || 'Client' };
              sendTargets.push({
                email: applicant.email,
                recipientName: name,
                subject: replacePlaceholders((targetStage as any).contractor_email_subject!, ph),
                body: replacePlaceholders((targetStage as any).contractor_email_body!, ph),
              });
            }

            for (const tgt of sendTargets) {
              try {
                const gmailUser = Deno.env.get("MARK_GMAIL_USER");
                const gmailPassword = Deno.env.get("MARK_GMAIL_APP_PASSWORD");

                if (gmailUser && gmailPassword) {
                  const smtpClient = new SMTPClient({
                    connection: {
                      hostname: "smtp.gmail.com",
                      port: 465,
                      tls: true,
                      auth: { username: gmailUser, password: gmailPassword },
                    },
                  });

                  const domain = gmailUser.split('@')[1] || 'outsta.io';
                  const messageId = generateMessageId(domain);

                  const signatureHtml = `
<br/>
<p style="margin: 0; color: #333333; font-size: 14px;">--</p>
<p style="margin: 4px 0 0 0; color: #333333; font-size: 14px;">Warm Regards,<br/>Mark</p>
<br/>
<img src="https://ohxtavjababtrcrkgndq.supabase.co/storage/v1/object/public/email-assets/mark-signature.png" alt="Mark Chua" style="width: 420px; max-width: 100%; height: auto; border-radius: 8px;" />`;

                  const formattedBody = tgt.body
                    .replace(/\\n/g, '<br>')
                    .replace(/\n/g, '<br>')
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

                  const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin: 0; padding: 20px; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">${formattedBody}${signatureHtml}</body></html>`;

                  await smtpClient.send({
                    from: `OutSta Mark Chua <${gmailUser}>`,
                    to: tgt.email,
                    subject: tgt.subject,
                    content: "auto",
                    html: emailHtml,
                    headers: { "Message-ID": messageId },
                  });

                  await smtpClient.close();

                  await supabase.from('contractor_checkin_emails').insert({
                    contractor_assignment_id: contractor.id,
                    stage_id: targetStage.id,
                    recipient_email: tgt.email,
                    recipient_name: tgt.recipientName,
                    subject: tgt.subject,
                    body_html: tgt.body,
                    status: 'sent',
                    sent_at: new Date().toISOString(),
                  });

                  emailsSent++;
                  results.push(`✉️ Email sent to ${tgt.email} for ${name}`);
                }
              } catch (emailError: any) {
                console.error(`Error sending check-in email for ${name}:`, emailError);
                await supabase.from('contractor_checkin_emails').insert({
                  contractor_assignment_id: contractor.id,
                  stage_id: targetStage.id,
                  recipient_email: tgt.email,
                  recipient_name: tgt.recipientName,
                  subject: tgt.subject,
                  body_html: tgt.body,
                  status: 'failed',
                  error_message: emailError.message,
                });
              }
            }
          }
        }
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
