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

// Resolve an email to a Slack user ID so we can @-mention them.
const slackUserIdCache = new Map<string, string | null>();

async function lookupSlackUserId(email: string): Promise<string | null> {
  const key = email.toLowerCase();
  if (slackUserIdCache.has(key)) return slackUserIdCache.get(key)!;

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const SLACK_API_KEY = Deno.env.get("SLACK_API_KEY");
  if (!LOVABLE_API_KEY || !SLACK_API_KEY) return null;

  try {
    const res = await fetch(
      `${GATEWAY_URL}/users.lookupByEmail?email=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": SLACK_API_KEY,
        },
      },
    );
    const data = await res.json();
    const id = res.ok && data.ok ? (data.user?.id ?? null) : null;
    if (!id) console.log(`Slack user lookup failed for ${key}: ${data?.error ?? res.status}`);
    slackUserIdCache.set(key, id);
    return id;
  } catch (e) {
    console.error("users.lookupByEmail error:", e);
    slackUserIdCache.set(key, null);
    return null;
  }
}

// Returns "<@U123>" when the email maps to a Slack user, else the display name.
async function mentionOrName(email: string | null | undefined): Promise<string> {
  if (!email) return "Someone";
  const id = await lookupSlackUserId(email);
  return id ? `<@${id}>` : getDisplayName(email);
}

// Resolve auth user IDs -> emails (used when the DB trigger fires the notification)
async function resolveEmails(ids: string[]): Promise<string[]> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key || !ids.length) return [];
  const admin = createClient(url, key);
  const out: string[] = [];
  for (const id of ids) {
    try {
      const { data } = await admin.auth.admin.getUserById(id);
      if (data?.user?.email) out.push(data.user.email);
    } catch (e) {
      console.error("resolveEmails failed for", id, e);
    }
  }
  return out;
}



interface SlackPayload {
  type: "mention" | "new_request" | "status_change" | "calendar_activity" | "calendar_comment" | "calendar_update";
  channel?: string;
  mentionedEmail?: string;
  mentionedByEmail?: string;
  commentContent?: string;
  requestId?: string;
  requestTitle?: string;
  clientName?: string;
  createdByEmail?: string;
  createdById?: string;
  assignedToIds?: string[];

  priority?: string;
  industry?: string;
  oldStage?: string;
  newStage?: string;
  changedByEmail?: string;
  // Calendar activity
  activityTitle?: string;
  eventType?: string;
  eventDate?: string;
  startTime?: number;
  endTime?: number;
  assignedToEmails?: string[];
  activityDescription?: string;
  pipelineLinkName?: string;
  // Calendar comment
  commentByEmail?: string;
  commentText?: string;
  activityTitleForComment?: string;
  eventDateForComment?: string;
  mentionedEmails?: string[];
  // Calendar update
  updatedByEmail?: string;
  updateType?: string;
  updateDetail?: string;
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const period = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${m.toString().padStart(2, "0")} ${period}`;
}

function formatDateET(dateStr: string): string {
  if (!dateStr) return "";
  try {
    // dateStr is a plain calendar date (YYYY-MM-DD) already in ET.
    // Parse it as UTC and format as UTC so no timezone shift occurs.
    const [y, m, d] = dateStr.split("-").map(Number);
    if (!y || !m || !d) return dateStr;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return dateStr;
  }
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

  const DEFAULT_CHANNEL = Deno.env.get("SLACK_CHANNEL") || "#hiring-pipeline";
  // Optional per-type channel routing (Slack channel name or ID)
  const CHANNEL_BY_TYPE: Record<string, string | undefined> = {
    calendar_activity: Deno.env.get("SLACK_CHANNEL_CALENDAR") || undefined,
    calendar_comment: Deno.env.get("SLACK_CHANNEL_CALENDAR") || undefined,
    calendar_update: Deno.env.get("SLACK_CHANNEL_CALENDAR") || undefined,
    mention: Deno.env.get("SLACK_CHANNEL_MENTIONS") || undefined,
    new_request: Deno.env.get("SLACK_CHANNEL_REQUESTS") || undefined,
    status_change: Deno.env.get("SLACK_CHANNEL_STATUS") || undefined,
  };

  try {
    const payload: SlackPayload = await req.json();
    console.log("Slack notification request:", JSON.stringify(payload));

    let text = "";
    let blocks: unknown[] = [];

    if (payload.type === "mention") {
      const mentionedName = getDisplayName(payload.mentionedEmail);
      const mentionedTag = await mentionOrName(payload.mentionedEmail);
      const mentionedByName = getDisplayName(payload.mentionedByEmail);
      const cleanComment = (payload.commentContent || "")
        .replace(/<[^>]*>/g, "")
        .substring(0, 200);

      text = `🔔 ${mentionedByName} mentioned ${mentionedName} in a hiring request`;
      blocks = [
        {
          type: "section",
          text: { type: "mrkdwn", text: `🔔 *${mentionedByName}* mentioned ${mentionedTag}` },
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
    } else if (payload.type === "calendar_activity") {
      // When fired from the DB trigger we only get user IDs — resolve them to emails.
      if (!payload.createdByEmail && payload.createdById) {
        payload.createdByEmail = (await resolveEmails([payload.createdById]))[0];
      }
      if ((!payload.assignedToEmails || !payload.assignedToEmails.length) && payload.assignedToIds?.length) {
        payload.assignedToEmails = await resolveEmails(payload.assignedToIds);
      }
      const createdByName = getDisplayName(payload.createdByEmail);
      // Don't mention the owner again in the assigned list — they're already shown as "Added by".
      const creatorEmail = (payload.createdByEmail || "").toLowerCase();
      const assignedEmails = (payload.assignedToEmails || [])
        .filter(Boolean)
        .filter((e) => e.toLowerCase() !== creatorEmail);
      let assignedStr: string;
      if (assignedEmails.length) {
        const assignedMentions = await Promise.all(assignedEmails.map((e) => mentionOrName(e)));
        assignedStr = assignedMentions.join(", ");
      } else if ((payload.assignedToEmails || []).filter(Boolean).length) {
        // The only assignee was the owner themselves.
        assignedStr = `${createdByName} (owner)`;
      } else {
        // Unassigned / open task — ping every admin so anyone can pick it up.
        const allAdminMentions = await Promise.all(
          Object.keys(EMAIL_TO_NAME).map((e) => mentionOrName(e)),
        );
        assignedStr = `Unassigned — up for grabs ${allAdminMentions.join(" ")}`;
      }



      const timeRange = `${minutesToTime(payload.startTime || 0)} - ${minutesToTime(payload.endTime || 0)}`;
      const dateLabel = formatDateET(payload.eventDate || "");
      const typeLabel = (payload.eventType || "activity")
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const emoji = payload.eventType === "deadline" ? "🚩" : payload.eventType === "meeting" ? "📅" : "📆";

      text = `${emoji} New calendar activity: ${payload.activityTitle} (${typeLabel})`;
      blocks = [
        {
          type: "section",
          text: { type: "mrkdwn", text: `${emoji} *New Calendar Activity Added*` },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Activity:*\n${payload.activityTitle || "Untitled"}` },
            { type: "mrkdwn", text: `*Type:*\n${typeLabel}` },
            { type: "mrkdwn", text: `*When:*\n${dateLabel} • ${timeRange} ET` },
            { type: "mrkdwn", text: `*Assigned to:*\n${assignedStr}` },
            { type: "mrkdwn", text: `*Added by:*\n${createdByName}` },
          ],
        },
      ];

      if (payload.pipelineLinkName) {
        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: `*Linked to:*\n${payload.pipelineLinkName}` },
        });
      }

      if (payload.activityDescription) {
        const cleanDesc = payload.activityDescription.replace(/<[^>]*>/g, "").substring(0, 200);
        if (cleanDesc) {
          blocks.push({
            type: "section",
            text: { type: "mrkdwn", text: `*Details:*\n>${cleanDesc}${cleanDesc.length >= 200 ? "..." : ""}` },
          });
        }
      }

      blocks.push({ type: "divider" });
    } else if (payload.type === "calendar_comment") {
      const commentedByName = getDisplayName(payload.commentByEmail);
      const dateLabel = formatDateET(payload.eventDateForComment || "");
      const cleanComment = (payload.commentText || "")
        .replace(/<[^>]*>/g, "")
        .substring(0, 300);

      const mentionTags: string[] = [];
      for (const email of payload.mentionedEmails || []) {
        mentionTags.push(await mentionOrName(email));
      }

      // Always notify assignees + creator of the task
      const notifyEmails = Array.from(
        new Set(
          [...(payload.assignedToEmails || []), payload.createdByEmail]
            .filter(Boolean)
            .filter((e) => e !== payload.commentByEmail) as string[],
        ),
      );
      const notifyTags: string[] = [];
      for (const email of notifyEmails) {
        notifyTags.push(await mentionOrName(email));
      }

      text = `💬 ${commentedByName} commented on "${payload.activityTitleForComment || "Calendar activity"}"`;
      blocks = [
        {
          type: "section",
          text: { type: "mrkdwn", text: `💬 *${commentedByName}* commented on a calendar activity` },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Activity:*\n${payload.activityTitleForComment || "Untitled"}` },
            { type: "mrkdwn", text: `*Date:*\n${dateLabel}` },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Comment:*\n>${cleanComment}${cleanComment.length >= 300 ? "..." : ""}`,
          },
        },
        ...(notifyTags.length
          ? [{ type: "section", text: { type: "mrkdwn", text: `*Assigned / Created by:* ${notifyTags.join(" ")}` } }]
          : []),
        ...(mentionTags.length
          ? [{ type: "section", text: { type: "mrkdwn", text: `*Mentioned:* ${mentionTags.join(" ")}` } }]
          : []),
        { type: "divider" },
      ];


    } else if (payload.type === "calendar_update") {
      const updatedByName = getDisplayName(payload.updatedByEmail);
      const dateLabel = formatDateET(payload.eventDate || "");
      const updateType = payload.updateType || "updated";

      const emojiMap: Record<string, string> = {
        done: "✅",
        undo: "↩️",
        assigned: "👤",
        unassigned: "👤",
        notes: "📝",
        deleted: "🗑️",
      };
      const emoji = emojiMap[updateType] || "✏️";

      const labelMap: Record<string, string> = {
        done: "marked as done",
        undo: "reopened (undone)",
        assigned: "assigned",
        unassigned: "unassigned",
        notes: "updated meeting notes",
        deleted: "deleted",
      };
      const actionLabel = labelMap[updateType] || "updated";

      text = `${emoji} ${updatedByName} ${actionLabel} "${payload.activityTitle || "Calendar activity"}"`;
      blocks = [
        {
          type: "section",
          text: { type: "mrkdwn", text: `${emoji} *${updatedByName}* ${actionLabel} a calendar activity` },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Activity:*\n${payload.activityTitle || "Untitled"}` },
            { type: "mrkdwn", text: `*Date:*\n${dateLabel}` },
          ],
        },
        ...(payload.updateDetail
          ? [{ type: "section", text: { type: "mrkdwn", text: `*Detail:*\n${payload.updateDetail}` } }]
          : []),
        { type: "divider" },
      ];
    } else {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid notification type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const targetChannel = payload.channel || CHANNEL_BY_TYPE[payload.type] || DEFAULT_CHANNEL;
    const data = await postToSlack(targetChannel, text, blocks);
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
