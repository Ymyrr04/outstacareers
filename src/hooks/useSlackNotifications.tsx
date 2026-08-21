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

interface CalendarActivityPayload {
  activityTitle: string;
  eventType: string;
  eventDate: string;
  startTime: number;
  endTime: number;
  createdByEmail: string;
  assignedToEmails: string[];
  activityDescription?: string;
  pipelineLinkName?: string;
}

interface CalendarCommentPayload {
  commentByEmail: string;
  commentText: string;
  activityTitleForComment: string;
  eventDateForComment: string;
  mentionedEmails?: string[];
}

interface CalendarUpdatePayload {
  updatedByEmail: string;
  activityTitle: string;
  eventDate: string;
  updateType: string;
  updateDetail?: string;
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

  const notifyCalendarActivity = async (payload: CalendarActivityPayload) => {
    return invokeSlackNotification({ type: 'calendar_activity', ...payload });
  };

  const notifyCalendarComment = async (payload: CalendarCommentPayload) => {
    return invokeSlackNotification({ type: 'calendar_comment', ...payload });
  };

  return { notifyMention, notifyNewRequest, notifyStatusChange, notifyCalendarActivity, notifyCalendarComment };
}
