import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GATEWAY_URL = 'https://gateway.lovable.dev/slack/api';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Email to Slack user ID mapping (update with actual Slack user IDs)
const EMAIL_TO_SLACK_USER: Record<string, string> = {
  'czarina@outsta.io': 'Czarina',
  'kristine@outsta.io': 'Kristine',
  'eduardo@outsta.io': 'Eduardo',
  'mark@outsta.io': 'Mark',
  'liezl@outsta.io': 'Liezl',
};

const EMAIL_TO_NAME: Record<string, string> = {
  'czarina@outsta.io': 'Czarina',
  'kristine@outsta.io': 'Kristine',
  'eduardo@outsta.io': 'Eduardo',
  'mark@outsta.io': 'Mark',
  'liezl@outsta.io': 'Liezl',
};

function getDisplayName(email: string | null | undefined): string {
  if (!email) return 'Someone';
  return EMAIL_TO_NAME[email.toLowerCase()] || email.split('@')[0];
}

interface SlackPayload {
  type: 'mention' | 'new_request' | 'status_change';
  // For mentions
  mentionedEmail?: string;
  mentionedByEmail?: string;
  commentContent?: string;
  requestId?: string;
  requestTitle?: string;
  clientName?: string;
  // For new requests
  createdByEmail?: string;
  priority?: string;
  industry?: string;
  // For status changes
  oldStage?: string;
  newStage?: string;
  changedByEmail?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    console.error('LOVABLE_API_KEY is not configured');
    return new Response(JSON.stringify({ success: false, error: 'LOVABLE_API_KEY is not configured' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SLACK_API_KEY = Deno.env.get('SLACK_API_KEY');
  if (!SLACK_API_KEY) {
    console.error('SLACK_API_KEY is not configured');
    return new Response(JSON.stringify({ success: false, error: 'SLACK_API_KEY is not configured' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get Slack channel from env or use default
  const SLACK_CHANNEL = Deno.env.get('SLACK_CHANNEL') || '#hiring-pipeline';

  try {
    const payload: SlackPayload = await req.json();
    console.log('Received Slack notification request:', JSON.stringify(payload));

    let message = '';
    let blocks: unknown[] = [];

    if (payload.type === 'mention') {
      const mentionedName = getDisplayName(payload.mentionedEmail);
      const mentionedByName = getDisplayName(payload.mentionedByEmail);
      
      // Strip HTML tags for Slack display
      const cleanComment = (payload.commentContent || '')
        .replace(/<[^>]*>/g, '')
        .substring(0, 200);

      message = `🔔 ${mentionedByName} mentioned ${mentionedName} in a hiring request`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🔔 *${mentionedByName}* mentioned *${mentionedName}*`
          }
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Request:*\n${payload.clientName || 'Unknown'} - ${payload.requestTitle || 'Untitled'}`
            }
          ]
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Comment:*\n>${cleanComment}${cleanComment.length >= 200 ? '...' : ''}`
          }
        },
        {
          type: "divider"
        }
      ];
    } else if (payload.type === 'new_request') {
      const createdByName = getDisplayName(payload.createdByEmail);
      const priorityEmoji = payload.priority === 'high' ? '🔴' : payload.priority === 'medium' ? '🟡' : '🟢';

      message = `📋 New hiring request: ${payload.clientName} - ${payload.requestTitle}`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `📋 *New Hiring Request Created*`
          }
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Client:*\n${payload.clientName || 'Unknown'}`
            },
            {
              type: "mrkdwn",
              text: `*Role:*\n${payload.requestTitle || 'Untitled'}`
            },
            {
              type: "mrkdwn",
              text: `*Priority:*\n${priorityEmoji} ${payload.priority || 'N/A'}`
            },
            {
              type: "mrkdwn",
              text: `*Industry:*\n${payload.industry || 'N/A'}`
            },
            {
              type: "mrkdwn",
              text: `*Created by:*\n${createdByName}`
            }
          ]
        },
        {
          type: "divider"
        }
      ];
    } else if (payload.type === 'status_change') {
      const changedByName = getDisplayName(payload.changedByEmail);

      message = `🔄 ${payload.clientName} - ${payload.requestTitle} moved to ${payload.newStage}`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🔄 *Pipeline Stage Changed*`
          }
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Request:*\n${payload.clientName || 'Unknown'} - ${payload.requestTitle || 'Untitled'}`
            },
            {
              type: "mrkdwn",
              text: `*Changed by:*\n${changedByName}`
            },
            {
              type: "mrkdwn",
              text: `*From:*\n${payload.oldStage || 'Unknown'}`
            },
            {
              type: "mrkdwn",
              text: `*To:*\n${payload.newStage || 'Unknown'}`
            }
          ]
        },
        {
          type: "divider"
        }
      ];
    } else {
      return new Response(JSON.stringify({ success: false, error: 'Invalid notification type' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log('Sending to Slack channel:', SLACK_CHANNEL);

    const response = await fetch(`${GATEWAY_URL}/chat.postMessage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': SLACK_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: SLACK_CHANNEL,
        text: message,
        blocks: blocks,
      }),
    });

    const data = await response.json();
    console.log('Slack API response:', JSON.stringify(data));

    if (!response.ok || !data.ok) {
      const errorMsg = data.error || `HTTP ${response.status}`;
      console.error(`Slack API call failed: ${errorMsg}`);
      throw new Error(`Slack API call failed [${response.status}]: ${JSON.stringify(data)}`);
    }

    return new Response(JSON.stringify({ success: true, message_ts: data.ts }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error sending Slack notification:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
