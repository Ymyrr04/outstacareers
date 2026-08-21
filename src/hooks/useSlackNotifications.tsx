import { supabase } from '@/integrations/supabase/client';

interface MentionPayload {
  mentionedEmail: string;
  mentionedByEmail: string;
  commentContent: string;
  requestId: string;
  requestTitle: string;
  clientName: string;
}

interface NewRequestPayload {
  requestId: string;
  requestTitle: string;
  clientName: string;
  createdByEmail: string;
  priority: string;
  industry?: string;
}

interface StatusChangePayload {
  requestId: string;
  requestTitle: string;
  clientName: string;
  oldStage: string;
  newStage: string;
  changedByEmail: string;
}

async function invokeSlackNotification(payload: Record<string, unknown>) {
  try {
    const { data, error } = await supabase.functions.invoke('send-slack-notification', {
      body: payload,
    });

    if (error) {
      console.error('[Slack] Notification error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err) {
    console.error('[Slack] Failed to send notification:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export function useSlackNotifications() {
  const notifyMention = async (payload: MentionPayload) => {
    return invokeSlackNotification({ type: 'mention', ...payload });
  };

  const notifyNewRequest = async (payload: NewRequestPayload) => {
    return invokeSlackNotification({ type: 'new_request', ...payload });
  };

  const notifyStatusChange = async (payload: StatusChangePayload) => {
    return invokeSlackNotification({ type: 'status_change', ...payload });
  };

  return { notifyMention, notifyNewRequest, notifyStatusChange };
}
