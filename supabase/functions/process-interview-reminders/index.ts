import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cutoff date: only process sessions created after this timestamp (when feature was deployed)
const FEATURE_CUTOFF_DATE = new Date().toISOString();

serve(async (req: Request) => {
  // Handle CORS preflight
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

    // Find interviews that:
    // 1. Started more than 15 minutes ago
    // 2. Are still in progress (not completed)
    // 3. Haven't received a reminder yet
    // 4. Were created after the feature was deployed (to skip existing applicants)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    
    // Get the cutoff from a stored setting or use a fixed date
    // We'll use created_at > '2025-01-14' to only process new sessions
    const { data: pendingReminders, error: fetchError } = await supabase
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
      .lt("started_at", fifteenMinutesAgo)
      .gt("created_at", "2025-01-14T00:00:00.000Z") // Only new sessions after today
      .order("started_at", { ascending: true });

    if (fetchError) {
      console.error("Error fetching pending reminders:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${pendingReminders?.length || 0} interviews needing reminders`);

    if (!pendingReminders || pendingReminders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No pending reminders to process", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize SMTP client
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
    const results: Array<{ sessionId: string; status: string; error?: string }> = [];

    for (const session of pendingReminders) {
      const applicant = session.applicants_prescreen as any;
      const firstName = applicant.full_name?.split(" ")[0] || "there";
      const resumeLink = `https://outstacareers.lovable.app/interview/${session.id}`;

      const emailHtml = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><p>Hi ${firstName},</p><p>We noticed you started your interview for the <strong>${applicant.job_title}</strong> position but haven't completed it yet.</p><p>Your progress has been saved! You can resume right where you left off by clicking the button below:</p><p style="margin: 24px 0;"><a href="${resumeLink}" style="background-color: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Resume My Interview</a></p><p><strong>⏰ Tip:</strong> Please complete your interview within 1 hour of resuming for the best experience.</p><p>If you have any questions or technical issues, feel free to reach out.</p><p>Best regards,<br>The Outsta Recruitment Team</p></div>`;

      try {
        // Send the reminder email
        await client.send({
          from: gmailUser,
          to: applicant.email,
          subject: `Reminder: Complete Your Interview - ${applicant.job_title}`,
          html: emailHtml,
        });

        // Mark reminder as sent
        const { error: updateError } = await supabase
          .from("interview_sessions")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", session.id);

        if (updateError) {
          console.error(`Failed to update reminder status for session ${session.id}:`, updateError);
        }

        // Log the email
        await supabase.from("email_logs").insert({
          applicant_id: applicant.id,
          recipient_email: applicant.email,
          subject: `Reminder: Complete Your Interview - ${applicant.job_title}`,
          body_html: emailHtml,
          status: "sent",
          sent_at: new Date().toISOString(),
          is_automated: true,
          applicant_status_at_send: "interview_reminder",
        });

        processed++;
        results.push({ sessionId: session.id, status: "sent" });
        console.log(`Sent reminder to ${applicant.email} for session ${session.id}`);

      } catch (emailError: any) {
        console.error(`Failed to send reminder for session ${session.id}:`, emailError);
        failed++;
        results.push({ sessionId: session.id, status: "failed", error: emailError.message });
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
