import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface EmailTemplate {
  id: string;
  status_trigger: string;
  name: string | null;
  subject: string;
  body_html: string;
  is_enabled: boolean;
  delay_hours: number;
  created_at: string;
  updated_at: string;
}

export interface EmailLog {
  id: string;
  applicant_id: string;
  template_id: string | null;
  subject: string;
  body_html: string;
  recipient_email: string;
  status: string;
  sent_at: string | null;
  applicant_status_at_send: string | null;
  is_automated: boolean;
  error_message: string | null;
  message_id: string | null;
  created_at: string;
}

export interface ScheduledEmail {
  id: string;
  applicant_id: string;
  template_id: string | null;
  subject: string;
  body_html: string;
  recipient_email: string;
  scheduled_for: string;
  status: string;
  canceled_at: string | null;
  canceled_by: string | null;
  created_at: string;
}

// Map status to template trigger - updated for new pipeline
export const statusToTrigger: Record<string, string> = {
  'For Review': 'application_received',
  'For Interview': 'for_interview',
  'SIV': 'siv',
  'Client Interview': 'client_interview',
  'Hired': 'hired',
  'Bench': 'bench',
  'Reject': 'reject',
};

export const triggerToStatus: Record<string, string> = {
  'application_received': 'Application Received',
  'for_interview': 'For Interview',
  'siv': 'SIV',
  'client_interview': 'Client Interview',
  'hired': 'Hired',
  'bench': 'Bench',
  'reject': 'Reject',
  'check_availability': 'Check Availability',
  'reprofiling': 'Reprofiling',
};

// Shared state for templates across all hook instances
let sharedTemplates: EmailTemplate[] = [];
let sharedLoading = true;
let subscribers: Set<(templates: EmailTemplate[]) => void> = new Set();
let loadingSubscribers: Set<(loading: boolean) => void> = new Set();
let channelInitialized = false;

const notifySubscribers = (templates: EmailTemplate[]) => {
  sharedTemplates = templates;
  subscribers.forEach(cb => cb(templates));
};

const notifyLoadingSubscribers = (loading: boolean) => {
  sharedLoading = loading;
  loadingSubscribers.forEach(cb => cb(loading));
};

// Initialize real-time channel once
const initializeChannel = () => {
  if (channelInitialized) return;
  channelInitialized = true;

  supabase
    .channel('email-templates-global')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'email_templates',
      },
      (payload) => {
        console.log('Email template change (global):', payload);
        
        if (payload.eventType === 'INSERT') {
          notifySubscribers([...sharedTemplates, payload.new as EmailTemplate]);
        } else if (payload.eventType === 'UPDATE') {
          notifySubscribers(
            sharedTemplates.map((t) => (t.id === payload.new.id ? (payload.new as EmailTemplate) : t))
          );
        } else if (payload.eventType === 'DELETE') {
          notifySubscribers(sharedTemplates.filter((t) => t.id !== payload.old.id));
        }
      }
    )
    .subscribe();
};

export function useEmailTemplates() {
  const [templates, setTemplates] = useState<EmailTemplate[]>(sharedTemplates);
  const [loading, setLoading] = useState(sharedLoading);
  const { toast } = useToast();

  const fetchTemplates = useCallback(async () => {
    notifyLoadingSubscribers(true);
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch email templates',
        variant: 'destructive',
      });
      notifyLoadingSubscribers(false);
      throw error;
    } else {
      notifySubscribers(data || []);
      notifyLoadingSubscribers(false);
    }
  }, [toast]);

  useEffect(() => {
    // Subscribe to shared state updates
    subscribers.add(setTemplates);
    loadingSubscribers.add(setLoading);
    
    // Initialize channel
    initializeChannel();
    
    // Fetch on first mount if not loaded yet
    if (sharedTemplates.length === 0 && sharedLoading) {
      fetchTemplates();
    } else {
      // Sync with current shared state
      setTemplates(sharedTemplates);
      setLoading(sharedLoading);
    }

    return () => {
      subscribers.delete(setTemplates);
      loadingSubscribers.delete(setLoading);
    };
  }, [fetchTemplates]);

  const updateTemplate = async (id: string, updates: Partial<EmailTemplate>) => {
    const { error } = await supabase
      .from('email_templates')
      .update(updates)
      .eq('id', id);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to update template: ' + error.message,
        variant: 'destructive',
      });
      return false;
    }

    await fetchTemplates();
    toast({
      title: 'Success',
      description: 'Template updated successfully',
    });
    return true;
  };

  const createTemplate = async (template: { status_trigger: string; name: string; subject: string; body_html: string }) => {
    const { error } = await supabase
      .from('email_templates')
      .insert({
        status_trigger: template.status_trigger,
        name: template.name,
        subject: template.subject,
        body_html: template.body_html,
        is_enabled: true,
        delay_hours: 0,
      });

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to create template: ' + error.message,
        variant: 'destructive',
      });
      return false;
    }

    await fetchTemplates();
    toast({
      title: 'Success',
      description: 'Template created successfully',
    });
    return true;
  };

  const deleteTemplate = async (id: string) => {
    const { error } = await supabase
      .from('email_templates')
      .delete()
      .eq('id', id);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete template: ' + error.message,
        variant: 'destructive',
      });
      return false;
    }

    await fetchTemplates();
    toast({
      title: 'Success',
      description: 'Template deleted successfully',
    });
    return true;
  };

  const getTemplateByTrigger = (trigger: string) => {
    return templates.find(t => t.status_trigger === trigger);
  };

  return {
    templates,
    loading,
    fetchTemplates,
    updateTemplate,
    createTemplate,
    deleteTemplate,
    getTemplateByTrigger,
  };
}

export function useEmailLogs(applicantId?: string) {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchLogs = useCallback(async () => {
    // Don't fetch if no applicantId is provided to avoid loading all logs
    if (!applicantId) {
      setLogs([]);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_logs')
        .select('*')
        .eq('applicant_id', applicantId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching email logs:', error);
        toast({
          title: 'Error',
          description: 'Failed to fetch email logs',
          variant: 'destructive',
        });
        setLogs([]);
      } else {
        setLogs(data || []);
      }
    } catch (err) {
      console.error('Exception fetching email logs:', err);
      toast({
        title: 'Error',
        description: 'Failed to fetch email logs',
        variant: 'destructive',
      });
      setLogs([]);
    }
    setLoading(false);
  }, [applicantId, toast]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return { logs, loading, fetchLogs };
}

export function useScheduledEmails(applicantId?: string) {
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchScheduledEmails = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('scheduled_emails')
      .select('*')
      .eq('status', 'pending')
      .order('scheduled_for', { ascending: true });

    if (applicantId) {
      query = query.eq('applicant_id', applicantId);
    }

    const { data, error } = await query;

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch scheduled emails',
        variant: 'destructive',
      });
    } else {
      setScheduledEmails(data || []);
    }
    setLoading(false);
  }, [applicantId, toast]);

  useEffect(() => {
    fetchScheduledEmails();
  }, [fetchScheduledEmails]);

  const cancelScheduledEmail = async (id: string) => {
    const { data: userData } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from('scheduled_emails')
      .update({ 
        status: 'canceled',
        canceled_at: new Date().toISOString(),
        canceled_by: userData.user?.id || null,
      })
      .eq('id', id);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to cancel scheduled email: ' + error.message,
        variant: 'destructive',
      });
      return false;
    }

    // Log the cancellation
    const { data: scheduledEmail } = await supabase
      .from('scheduled_emails')
      .select('*')
      .eq('id', id)
      .single();

    if (scheduledEmail) {
      await supabase
        .from('email_logs')
        .insert({
          applicant_id: scheduledEmail.applicant_id,
          template_id: scheduledEmail.template_id,
          subject: scheduledEmail.subject,
          body_html: scheduledEmail.body_html,
          recipient_email: scheduledEmail.recipient_email,
          status: 'canceled',
          is_automated: true,
        });
    }

    await fetchScheduledEmails();
    toast({
      title: 'Success',
      description: 'Scheduled email canceled',
    });
    return true;
  };

  return { scheduledEmails, loading, fetchScheduledEmails, cancelScheduledEmail };
}

export interface EmailReply {
  id: string;
  applicant_id: string;
  from_email: string;
  subject: string;
  body_text: string | null;
  body_html: string | null;
  received_at: string;
  gmail_message_id: string;
  created_at: string;
  is_read: boolean;
  in_reply_to?: string | null;
}

export function useEmailReplies(applicantId?: string) {
  const [replies, setReplies] = useState<EmailReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const { toast } = useToast();

  const fetchReplies = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('email_replies')
      .select('*')
      .order('received_at', { ascending: false });

    if (applicantId) {
      query = query.eq('applicant_id', applicantId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch email replies:', error);
    } else {
      setReplies(data || []);
    }
    setLoading(false);
  }, [applicantId]);

  useEffect(() => {
    fetchReplies();
  }, [fetchReplies]);

  const fetchNewReplies = async () => {
    setFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-email-replies');
      
      if (error) {
        throw error;
      }

      if (data?.repliesFound > 0) {
        toast({
          title: 'New replies found',
          description: `Found ${data.repliesFound} new email replies`,
        });
        await fetchReplies();
      } else {
        toast({
          title: 'No new replies',
          description: 'No new email replies found',
        });
      }
    } catch (error: any) {
      console.error('Error fetching new replies:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch email replies: ' + error.message,
        variant: 'destructive',
      });
    }
    setFetching(false);
  };

  return { replies, loading, fetching, fetchReplies, fetchNewReplies };
}

// Hook to get unread message counts per applicant
interface UnreadApplicantInfo {
  id: string;
  full_name: string;
  email: string;
  total_score: number | null;
  count: number;
}

// Global cache for unread data to persist across component remounts
let globalUnreadCache: {
  applicants: UnreadApplicantInfo[];
  counts: Record<string, number>;
  lastFetched: number;
} = { applicants: [], counts: {}, lastFetched: 0 };

export function useUnreadMessageCounts() {
  // Initialize from cache immediately for instant display
  const [unreadApplicants, setUnreadApplicants] = useState<UnreadApplicantInfo[]>(globalUnreadCache.applicants);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>(globalUnreadCache.counts);
  const [loading, setLoading] = useState(globalUnreadCache.lastFetched === 0);

  const fetchUnreadCounts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    
    // Fetch unread replies with applicant info in a single query using join
    const { data, error } = await supabase
      .from('email_replies')
      .select(`
        applicant_id,
        applicants_prescreen!inner (
          id,
          full_name,
          email,
          total_score
        )
      `)
      .eq('is_read', false);

    if (error) {
      console.error('Failed to fetch unread counts:', error);
      setLoading(false);
      return;
    }

    // Aggregate counts and build applicant info map
    const applicantMap = new Map<string, UnreadApplicantInfo>();
    const counts: Record<string, number> = {};
    
    (data || []).forEach((reply: any) => {
      const applicantId = reply.applicant_id;
      const applicant = reply.applicants_prescreen;
      
      counts[applicantId] = (counts[applicantId] || 0) + 1;
      
      if (!applicantMap.has(applicantId) && applicant) {
        applicantMap.set(applicantId, {
          id: applicant.id,
          full_name: applicant.full_name,
          email: applicant.email,
          total_score: applicant.total_score,
          count: 0
        });
      }
    });
    
    // Set counts on applicant info
    const applicantsWithCounts = Array.from(applicantMap.values()).map(a => ({
      ...a,
      count: counts[a.id] || 0
    }));
    
    // Update global cache
    globalUnreadCache = {
      applicants: applicantsWithCounts,
      counts,
      lastFetched: Date.now()
    };
    
    setUnreadApplicants(applicantsWithCounts);
    setUnreadCounts(counts);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Only fetch if cache is stale (older than 30 seconds) or empty
    const cacheAge = Date.now() - globalUnreadCache.lastFetched;
    if (cacheAge > 30000 || globalUnreadCache.lastFetched === 0) {
      fetchUnreadCounts(globalUnreadCache.lastFetched > 0); // Silent if we have cached data
    }
    
    // Subscribe to realtime changes for instant updates
    const channel = supabase
      .channel('unread-replies-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'email_replies' },
        () => {
          // Silently refresh on any change
          fetchUnreadCounts(true);
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchUnreadCounts]);

  // Mark replies as read for an applicant (optimistic update)
  const markAsRead = async (applicantId: string) => {
    // Optimistic update
    setUnreadCounts(prev => {
      const next = { ...prev };
      delete next[applicantId];
      return next;
    });
    setUnreadApplicants(prev => prev.filter(a => a.id !== applicantId));
    
    // Update cache
    globalUnreadCache = {
      ...globalUnreadCache,
      applicants: globalUnreadCache.applicants.filter(a => a.id !== applicantId),
      counts: Object.fromEntries(
        Object.entries(globalUnreadCache.counts).filter(([id]) => id !== applicantId)
      )
    };
    
    const { error } = await supabase
      .from('email_replies')
      .update({ is_read: true })
      .eq('applicant_id', applicantId)
      .eq('is_read', false);

    if (error) {
      // Rollback on error
      fetchUnreadCounts(true);
    }
  };

  return { unreadCounts, unreadApplicants, loading, fetchUnreadCounts, markAsRead };
}
