import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("Starting interview reminder processing...");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailAppPassword = Deno.env.get("GMAIL_APP_PASSWORD");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    if (!gmailUser || !gmailAppPassword) {
      throw new Error("Missing Gmail credentials");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Fetch sessions needing FIRST reminder (30+ mins, no reminder sent yet)
    const { data: firstReminderSessions, error: firstError } = await supabase
      .from("interview_sessions")
      .select(`
        id,
        applicant_id,
        started_at,
        created_at,
        applicants_prescreen!inner (
          id,
          full_name,
          email,
          job_title
        )
      `)
      .eq("status", "in_progress")
      .is("reminder_sent_at", null)
      .is("completed_at", null)
      .lt("started_at", thirtyMinutesAgo)
      .gt("created_at", "2025-01-14T00:00:00.000Z")
      .order("started_at", { ascending: true });

    if (firstError) {
      console.error("Error fetching first reminders:", firstError);
      throw firstError;
    }

    // Fetch sessions needing SECOND reminder (60+ mins, first sent, second not sent)
    const { data: secondReminderSessions, error: secondError } = await supabase
      .from("interview_sessions")
      .select(`
        id,
        applicant_id,
        started_at,
        created_at,
        applicants_prescreen!inner (
          id,
          full_name,
          email,
          job_title
        )
      `)
      .eq("status", "in_progress")
      .not("reminder_sent_at", "is", null)
      .is("second_reminder_sent_at", null)
      .is("completed_at", null)
      .lt("started_at", oneHourAgo)
      .gt("created_at", "2025-01-14T00:00:00.000Z")
      .order("started_at", { ascending: true });

    if (secondError) {
      console.error("Error fetching second reminders:", secondError);
      throw secondError;
    }

    const totalPending = (firstReminderSessions?.length || 0) + (secondReminderSessions?.length || 0);
    console.log(`Found ${firstReminderSessions?.length || 0} first reminders, ${secondReminderSessions?.length || 0} second reminders`);

    if (totalPending === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No pending reminders to process", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: {
          username: gmailUser,
          password: gmailAppPassword,
        },
      },
    });

    let processed = 0;
    let failed = 0;
    const results: Array<{ sessionId: string; reminderType: string; status: string; error?: string }> = [];

    // Process FIRST reminders (30 min)
    for (const session of firstReminderSessions || []) {
      const applicant = session.applicants_prescreen as any;
      const firstName = applicant.full_name?.split(" ")[0] || "there";
      const resumeLink = `https://outstahub.com/interview/${session.id}`;

      const emailHtml = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><p>Hi ${firstName},</p><p>We've completed an initial review of your CV, and based on that assessment, your background appears to be a good fit for the <strong>${applicant.job_title}</strong> role.</p><p>However, it appears that the interview assessment was not completed. This assessment is an important part of evaluating your skills and experience, and an incomplete submission will significantly impact your overall score and eligibility to move forward to the final interview.</p><p>Your progress has been saved. Please resume and complete the assessment using the link below if you wish to continue being considered for the role.</p><p style="margin: 24px 0; text-align: center;"><a href="${resumeLink}" style="background-color: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Resume My Interview</a></p><p><strong>Important:</strong> Please complete the assessment within 2 hours to avoid further impact on your application.</p><p>If you experience any technical issues, notify us immediately.</p><p>Best regards,<br>The OutSta Recruitment Team</p></div>`;

      const subject = `Reminder: Complete Your Interview - ${applicant.job_title}`;

      try {
        await client.send({
           from: `OutSta Recruitment <${gmailUser}>`,
          to: applicant.email,
          subject,
          html: emailHtml,
        });

        await supabase
          .from("interview_sessions")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", session.id);

        await supabase.from("email_logs").insert({
          applicant_id: applicant.id,
          recipient_email: applicant.email,
          subject,
          body_html: emailHtml,
          status: "sent",
          sent_at: new Date().toISOString(),
          is_automated: true,
          applicant_status_at_send: "interview_reminder_1",
        });

        processed++;
        results.push({ sessionId: session.id, reminderType: "first", status: "sent" });
        console.log(`Sent 1st reminder to ${applicant.email} for session ${session.id}`);

      } catch (emailError: any) {
        console.error(`Failed to send 1st reminder for session ${session.id}:`, emailError);
        failed++;
        results.push({ sessionId: session.id, reminderType: "first", status: "failed", error: emailError.message });
      }
    }

    // Process SECOND reminders (1 hour)
    for (const session of secondReminderSessions || []) {
      const applicant = session.applicants_prescreen as any;
      const firstName = applicant.full_name?.split(" ")[0] || "there";
      const resumeLink = `https://outstahub.com/interview/${session.id}`;

      const emailHtml = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><p>Hi ${firstName},</p><p>This is a final reminder that your interview assessment for the <strong>${applicant.job_title}</strong> position remains incomplete.</p><p>We understand that unexpected circumstances can arise, but unfortunately, we cannot move forward with incomplete applications. If we don't receive your completed assessment soon, your application will be marked as withdrawn.</p><p>Your progress is still saved. Click below to resume where you left off:</p><p style="margin: 24px 0; text-align: center;"><a href="${resumeLink}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Complete My Interview Now</a></p><p>If you're experiencing technical difficulties or need assistance, please reply to this email immediately.</p><p>We hope to see your completed application.</p><p>Best regards,<br>The OutSta Recruitment Team</p></div>`;

      const subject = `Final Reminder: Your Interview Assessment Is Still Incomplete - ${applicant.job_title}`;

      try {
        await client.send({
          from: `OutSta Recruitment <${gmailUser}>`,
          to: applicant.email,
          subject,
          html: emailHtml,
        });

        await supabase
          .from("interview_sessions")
          .update({ second_reminder_sent_at: new Date().toISOString() })
          .eq("id", session.id);

        await supabase.from("email_logs").insert({
          applicant_id: applicant.id,
          recipient_email: applicant.email,
          subject,
          body_html: emailHtml,
          status: "sent",
          sent_at: new Date().toISOString(),
          is_automated: true,
          applicant_status_at_send: "interview_reminder_2",
        });

        processed++;
        results.push({ sessionId: session.id, reminderType: "second", status: "sent" });
        console.log(`Sent 2nd reminder to ${applicant.email} for session ${session.id}`);

      } catch (emailError: any) {
        console.error(`Failed to send 2nd reminder for session ${session.id}:`, emailError);
        failed++;
        results.push({ sessionId: session.id, reminderType: "second", status: "failed", error: emailError.message });
      }
    }

    await client.close();

    console.log(`Reminder processing complete. Sent: ${processed}, Failed: ${failed}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${processed} reminders, ${failed} failed`,
        processed,
        failed,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in process-interview-reminders:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});