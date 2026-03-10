import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This function processes pending admin notifications for interviews that:
// 1. Have been in_progress for more than 20 minutes (abandoned/timeout)
// 2. Have not yet notified the admin
// Should be called via a cron job every 5 minutes

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[Pending Notifications] Starting check for stale interviews...');

    // Find interviews that:
    // - Are still "in_progress" 
    // - Started more than 20 minutes ago
    // - Have NOT been notified yet (admin_notified_at IS NULL)
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();

    const { data: staleInterviews, error: fetchError } = await supabase
      .from('interview_sessions')
      .select(`
        id,
        applicant_id,
        job_id,
        started_at,
        status
      `)
      .eq('status', 'in_progress')
      .is('admin_notified_at', null)
      .lt('started_at', twentyMinutesAgo);

    if (fetchError) {
      console.error('[Pending Notifications] Error fetching stale interviews:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch stale interviews' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!staleInterviews || staleInterviews.length === 0) {
      console.log('[Pending Notifications] No stale interviews found');
      return new Response(
        JSON.stringify({ message: 'No pending notifications to process', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Pending Notifications] Found ${staleInterviews.length} stale interviews to process`);

    let processedCount = 0;
    let errorCount = 0;

    for (const session of staleInterviews) {
      try {
        // Get applicant details
        const { data: applicant, error: applicantError } = await supabase
          .from('applicants_prescreen')
          .select('full_name, email, job_title')
          .eq('id', session.applicant_id)
          .single();

        if (applicantError || !applicant) {
          console.error(`[Pending Notifications] Failed to get applicant for session ${session.id}:`, applicantError);
          errorCount++;
          continue;
        }

        // Get job and assigned admin
        if (!session.job_id) {
          console.log(`[Pending Notifications] No job_id on session ${session.id}, skipping`);
          // Mark as notified to prevent re-processing
          await supabase
            .from('interview_sessions')
            .update({ admin_notified_at: new Date().toISOString() })
            .eq('id', session.id);
          continue;
        }

        const { data: job, error: jobError } = await supabase
          .from('jobs')
          .select('assigned_admin_id, title')
          .eq('id', session.job_id)
          .single();

        if (jobError || !job || !job.assigned_admin_id) {
          console.log(`[Pending Notifications] No assigned admin for job on session ${session.id}, skipping`);
          // Mark as notified to prevent re-processing
          await supabase
            .from('interview_sessions')
            .update({ admin_notified_at: new Date().toISOString() })
            .eq('id', session.id);
          continue;
        }

        // Get admin email
        const { data: userData, error: userError } = await supabase.auth.admin.getUserById(job.assigned_admin_id);
        
        if (userError || !userData?.user?.email) {
          console.error(`[Pending Notifications] Failed to get admin email for session ${session.id}:`, userError);
          errorCount++;
          continue;
        }

        const adminEmail = userData.user.email;
        console.log(`[Pending Notifications] Sending notification for session ${session.id} to ${adminEmail}`);

        // Send email notification
        const gmailUser = Deno.env.get("GMAIL_USER");
        const gmailPassword = Deno.env.get("GMAIL_APP_PASSWORD");

        if (!gmailUser || !gmailPassword) {
          console.error('[Pending Notifications] Gmail credentials not configured');
          errorCount++;
          continue;
        }

        const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");

        const client = new SMTPClient({
          connection: {
            hostname: "smtp.gmail.com",
            port: 465,
            tls: true,
            auth: {
              username: gmailUser,
              password: gmailPassword,
            },
          },
        });

        const applicantProfileUrl = `https://outstahub.com/admin?applicant=${session.applicant_id}`;
        const subject = `New Application: ${applicant.full_name} - ${job.title || applicant.job_title} (Interview Incomplete)`;
        const bodyHtml = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #1a1a2e;">New Application - Interview Incomplete</h2>
            <p>A candidate has submitted an application but did not complete the assessment interview within 20 minutes:</p>
            <table style="border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 8px 16px 8px 0; font-weight: bold; color: #666;">Position:</td>
                <td style="padding: 8px 0;">${job.title || applicant.job_title}</td>
              </tr>
              <tr>
                <td style="padding: 8px 16px 8px 0; font-weight: bold; color: #666;">Candidate Name:</td>
                <td style="padding: 8px 0;">${applicant.full_name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 16px 8px 0; font-weight: bold; color: #666;">Candidate Email:</td>
                <td style="padding: 8px 0;">${applicant.email}</td>
              </tr>
              <tr>
                <td style="padding: 8px 16px 8px 0; font-weight: bold; color: #666;">Status:</td>
                <td style="padding: 8px 0; color: #f59e0b;">Interview Started but Not Completed</td>
              </tr>
            </table>
            <p style="margin: 20px 0;">
              <a href="${applicantProfileUrl}" style="display: inline-block; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">View Applicant Profile</a>
            </p>
            <p style="color: #888; font-size: 12px; margin-top: 30px;">This is an automated notification from OutSta Recruitment.</p>
          </div>
        `;

        const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${subject}</title></head><body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;"><table role="presentation" style="width: 100%; border-collapse: collapse;"><tr><td align="center" style="padding: 40px 0;"><table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);"><tr><td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 50px 40px; border-radius: 12px 12px 0 0; text-align: center;"><h1 style="color: #ffffff; margin: 0; font-size: 36px; font-weight: 700; letter-spacing: 3px;">OutSta</h1><p style="color: #e2e8f0; margin: 8px 0 0 0; font-size: 16px; font-weight: 400; letter-spacing: 2px;">Recruitment Team</p></td></tr><tr><td style="padding: 40px;">${bodyHtml}</td></tr><tr><td style="background-color: #f8f9fa; padding: 25px 40px; border-radius: 0 0 12px 12px; text-align: center;"><p style="color: #999999; font-size: 12px; margin: 0;">This is an automated notification.<br>Please do not reply to this email.</p></td></tr></table></td></tr></table></body></html>`;

        await client.send({
          from: `OutSta Recruitment <${gmailUser}>`,
          to: adminEmail,
          subject: subject,
          content: "auto",
          html: emailHtml,
        });

        await client.close();

        // Mark notification as sent
        await supabase
          .from('interview_sessions')
          .update({ admin_notified_at: new Date().toISOString() })
          .eq('id', session.id);

        console.log(`[Pending Notifications] Successfully notified admin for session ${session.id}`);
        processedCount++;

      } catch (sessionError) {
        console.error(`[Pending Notifications] Error processing session ${session.id}:`, sessionError);
        errorCount++;
      }
    }

    console.log(`[Pending Notifications] Completed. Processed: ${processedCount}, Errors: ${errorCount}`);

    return new Response(
      JSON.stringify({ 
        message: 'Pending notifications processed',
        processed: processedCount,
        errors: errorCount,
        total: staleInterviews.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Pending Notifications] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
