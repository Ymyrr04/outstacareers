import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";

// Email -> display name for Slack messages
const EMAIL_TO_NAME: Record<string, string> = {
  "czarina@outsta.io": "Czarina",
  "kristine@outsta.io": "Kristine",
  "eduardo@outsta.io": "Eduardo",
  "mark@outsta.io": "Mark",
  "liezl@outsta.io": "Liezl",
};

function getDisplayName(email: string | null | undefined): string {
  if (!email) return "Someone";
  return EMAIL_TO_NAME[email.toLowerCase()] || email.split("@")[0];
}

interface SlackPayload {
  type: "mention" | "new_request" | "status_change";
  mentionedEmail?: string;
  mentionedByEmail?: string;
  commentContent?: string;
  requestId?: string;
  requestTitle?: string;
  clientName?: string;
  createdByEmail?: string;
  priority?: string;
  industry?: string;
  oldStage?: string;
  newStage?: string;
  changedByEmail?: string;
}

async function postToSlack(channel: string, text: string, blocks: unknown[]) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const SLACK_API_KEY = Deno.env.get("SLACK_API_KEY");

  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }
  if (!SLACK_API_KEY) {
    throw new Error("SLACK_API_KEY is not configured");
  }

  const response = await fetch(`${GATEWAY_URL}/chat.postMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": SLACK_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, text, blocks }),
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    const reason = data.error ?? `HTTP ${response.status}`;
    throw new Error(`Slack API call failed [${response.status}]: ${reason}`);
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SLACK_CHANNEL = Deno.env.get("SLACK_CHANNEL") || "#hiring-pipeline";

  try {
    const payload: SlackPayload = await req.json();
    console.log("Slack notification request:", JSON.stringify(payload));

    let text = "";
    let blocks: unknown[] = [];

    if (payload.type === "mention") {
      const mentionedName = getDisplayName(payload.mentionedEmail);
      const mentionedByName = getDisplayName(payload.mentionedByEmail);
      const cleanComment = (payload.commentContent || "")
        .replace(/<[^>]*>/g, "")
        .substring(0, 200);

      text = `🔔 ${mentionedByName} mentioned ${mentionedName} in a hiring request`;
      blocks = [
        {
          type: "section",
          text: { type: "mrkdwn", text: `🔔 *${mentionedByName}* mentioned *${mentionedName}*` },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Request:*\n${payload.clientName || "Unknown"} - ${payload.requestTitle || "Untitled"}`,
            },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Comment:*\n>${cleanComment}${cleanComment.length >= 200 ? "..." : ""}`,
          },
        },
        { type: "divider" },
      ];
    } else if (payload.type === "new_request") {
      const createdByName = getDisplayName(payload.createdByEmail);
      const priorityEmoji =
        payload.priority === "high" ? "🔴" : payload.priority === "medium" ? "🟡" : "🟢";

      text = `📋 New hiring request: ${payload.clientName} - ${payload.requestTitle}`;
      blocks = [
        { type: "section", text: { type: "mrkdwn", text: "📋 *New Hiring Request Created*" } },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Client:*\n${payload.clientName || "Unknown"}` },
            { type: "mrkdwn", text: `*Role:*\n${payload.requestTitle || "Untitled"}` },
            { type: "mrkdwn", text: `*Priority:*\n${priorityEmoji} ${payload.priority || "N/A"}` },
            { type: "mrkdwn", text: `*Industry:*\n${payload.industry || "N/A"}` },
            { type: "mrkdwn", text: `*Created by:*\n${createdByName}` },
          ],
        },
        { type: "divider" },
      ];
    } else if (payload.type === "status_change") {
      const changedByName = getDisplayName(payload.changedByEmail);

      text = `🔄 ${payload.clientName} - ${payload.requestTitle} moved to ${payload.newStage}`;
      blocks = [
        { type: "section", text: { type: "mrkdwn", text: "🔄 *Pipeline Stage Changed*" } },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Request:*\n${payload.clientName || "Unknown"} - ${payload.requestTitle || "Untitled"}`,
            },
            { type: "mrkdwn", text: `*Changed by:*\n${changedByName}` },
            { type: "mrkdwn", text: `*From:*\n${payload.oldStage || "Unknown"}` },
            { type: "mrkdwn", text: `*To:*\n${payload.newStage || "Unknown"}` },
          ],
        },
        { type: "divider" },
      ];
    } else {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid notification type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await postToSlack(SLACK_CHANNEL, text, blocks);
    console.log("Slack message sent:", data.ts);

    return new Response(
      JSON.stringify({ success: true, message_ts: data.ts }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error sending Slack notification:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
