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
  'Talent Pool': 'talent_pool',
};

export const triggerToStatus: Record<string, string> = {
  'application_received': 'Application Received',
  'for_interview': 'For Interview',
  'siv': 'SIV',
  'client_interview': 'Client Interview',
  'hired': 'Hired',
  'bench': 'Bench',
  'reject': 'Reject',
  'talent_pool': 'Talent Pool',
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

// Cache for email logs per applicant
const emailLogsCache = new Map<string, { logs: EmailLog[]; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute cache

// Cache for scheduled emails per applicant (forward declared for preload fn)
const scheduledEmailsCache = new Map<string, { emails: ScheduledEmail[]; timestamp: number }>();

// EmailReply interface (forward declared for cache type)
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

// Cache for email replies per applicant (forward declared for preload fn)
const emailRepliesCache = new Map<string, { replies: EmailReply[]; timestamp: number }>();

interface FetchNewRepliesOptions {
  silent?: boolean;
  priorityEmail?: string;
}

// Pre-load email data for a specific applicant (used by unread system)
async function preloadApplicantEmailData(applicantId: string) {
  // Pre-load email logs if not cached
  const logsCache = emailLogsCache.get(applicantId);
  if (!logsCache || Date.now() - logsCache.timestamp >= CACHE_TTL) {
    const { data: logsData } = await supabase
      .from('email_logs')
      .select('*')
      .eq('applicant_id', applicantId)
      .order('created_at', { ascending: false });
    if (logsData) {
      emailLogsCache.set(applicantId, { logs: logsData, timestamp: Date.now() });
    }
  }

  // Pre-load scheduled emails if not cached
  const scheduledCache = scheduledEmailsCache.get(applicantId);
  if (!scheduledCache || Date.now() - scheduledCache.timestamp >= CACHE_TTL) {
    const { data: scheduledData } = await supabase
      .from('scheduled_emails')
      .select('*')
      .eq('applicant_id', applicantId)
      .eq('status', 'pending')
      .order('scheduled_for', { ascending: true });
    if (scheduledData) {
      scheduledEmailsCache.set(applicantId, { emails: scheduledData, timestamp: Date.now() });
    }
  }

  // Pre-load email replies if not cached
  const repliesCache = emailRepliesCache.get(applicantId);
  if (!repliesCache || Date.now() - repliesCache.timestamp >= CACHE_TTL) {
    const { data: repliesData } = await supabase
      .from('email_replies')
      .select('*')
      .eq('applicant_id', applicantId)
      .order('received_at', { ascending: false });
    if (repliesData) {
      emailRepliesCache.set(applicantId, { replies: repliesData as EmailReply[], timestamp: Date.now() });
    }
  }
}

export function useEmailLogs(applicantId?: string) {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Sync from cache when applicantId changes
  useEffect(() => {
    if (!applicantId) {
      setLogs([]);
      setLoading(false);
      return;
    }
    
    const cached = emailLogsCache.get(applicantId);
    const isCacheValid = cached && (Date.now() - cached.timestamp < CACHE_TTL);
    
    if (isCacheValid) {
      setLogs(cached.logs);
      setLoading(false);
    } else if (cached) {
      // Show stale data while refreshing
      setLogs(cached.logs);
    }
  }, [applicantId]);

  const fetchLogs = useCallback(async (silent = false) => {
    // Don't fetch if no applicantId is provided to avoid loading all logs
    if (!applicantId) {
      setLogs([]);
      setLoading(false);
      return;
    }
    
    if (!silent) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_logs')
        .select('*')
        .eq('applicant_id', applicantId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching email logs:', error);
        if (!silent) {
          toast({
            title: 'Error',
            description: 'Failed to fetch email logs',
            variant: 'destructive',
          });
        }
        setLogs([]);
      } else {
        const logsData = data || [];
        setLogs(logsData);
        // Update cache
        emailLogsCache.set(applicantId, { logs: logsData, timestamp: Date.now() });
      }
    } catch (err) {
      console.error('Exception fetching email logs:', err);
      if (!silent) {
        toast({
          title: 'Error',
          description: 'Failed to fetch email logs',
          variant: 'destructive',
        });
      }
      setLogs([]);
    }
    setLoading(false);
  }, [applicantId, toast]);

  useEffect(() => {
    if (!applicantId) return;
    
    // Only fetch if cache is stale or empty
    const cached = emailLogsCache.get(applicantId);
    const isCacheValid = cached && (Date.now() - cached.timestamp < CACHE_TTL);
    
    if (!isCacheValid) {
      fetchLogs(!!cached); // Silent if we have stale cache data
    }
  }, [fetchLogs, applicantId]);

  return { logs, loading, fetchLogs };
}

// scheduledEmailsCache is declared above near emailLogsCache

export function useScheduledEmails(applicantId?: string) {
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Sync from cache when applicantId changes
  useEffect(() => {
    if (!applicantId) {
      setScheduledEmails([]);
      setLoading(false);
      return;
    }
    
    const cached = scheduledEmailsCache.get(applicantId);
    const isCacheValid = cached && (Date.now() - cached.timestamp < CACHE_TTL);
    
    if (isCacheValid) {
      setScheduledEmails(cached.emails);
      setLoading(false);
    } else if (cached) {
      // Show stale data while refreshing
      setScheduledEmails(cached.emails);
    }
  }, [applicantId]);

  const fetchScheduledEmails = useCallback(async (silent = false) => {
    // Skip if no applicantId
    if (!applicantId) {
      setScheduledEmails([]);
      setLoading(false);
      return;
    }
    
    if (!silent) setLoading(true);
    const { data, error } = await supabase
      .from('scheduled_emails')
      .select('*')
      .eq('applicant_id', applicantId)
      .eq('status', 'pending')
      .order('scheduled_for', { ascending: true });

    if (error) {
      if (!silent) {
        toast({
          title: 'Error',
          description: 'Failed to fetch scheduled emails',
          variant: 'destructive',
        });
      }
    } else {
      const emails = data || [];
      setScheduledEmails(emails);
      scheduledEmailsCache.set(applicantId, { emails, timestamp: Date.now() });
    }
    setLoading(false);
  }, [applicantId, toast]);

  useEffect(() => {
    if (!applicantId) return;
    
    const cached = scheduledEmailsCache.get(applicantId);
    const isCacheValid = cached && (Date.now() - cached.timestamp < CACHE_TTL);
    
    if (!isCacheValid) {
      fetchScheduledEmails(!!cached);
    }
  }, [fetchScheduledEmails, applicantId]);

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

// EmailReply interface is declared above near emailLogsCache

export function useEmailReplies(applicantId?: string, applicantEmail?: string) {
  const [replies, setReplies] = useState<EmailReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const { toast } = useToast();

  // Sync from cache when applicantId changes
  useEffect(() => {
    if (!applicantId) {
      setReplies([]);
      setLoading(false);
      return;
    }

    const cached = emailRepliesCache.get(applicantId);
    const isCacheValid = cached && (Date.now() - cached.timestamp < CACHE_TTL);

    if (isCacheValid) {
      setReplies(cached.replies);
      setLoading(false);
    } else if (cached) {
      // Show stale data while refreshing
      setReplies(cached.replies);
    }
  }, [applicantId]);

  const fetchReplies = useCallback(async (silent = false) => {
    // Skip if no applicantId
    if (!applicantId) {
      setReplies([]);
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    const { data, error } = await supabase
      .from('email_replies')
      .select('*')
      .eq('applicant_id', applicantId)
      .order('received_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch email replies:', error);
    } else {
      const repliesData = data || [];
      setReplies(repliesData);
      emailRepliesCache.set(applicantId, { replies: repliesData, timestamp: Date.now() });
    }
    setLoading(false);
  }, [applicantId]);

  useEffect(() => {
    if (!applicantId) return;

    const cached = emailRepliesCache.get(applicantId);
    const isCacheValid = cached && (Date.now() - cached.timestamp < CACHE_TTL);

    if (!isCacheValid) {
      fetchReplies(!!cached);
    }
  }, [fetchReplies, applicantId]);

  // Realtime updates so newly stored replies appear immediately in the thread
  useEffect(() => {
    if (!applicantId) return;

    const channel = supabase
      .channel(`email-replies-${applicantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'email_replies',
          filter: `applicant_id=eq.${applicantId}`,
        },
        () => {
          fetchReplies(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [applicantId, fetchReplies]);

  const fetchNewReplies = useCallback(async (options: FetchNewRepliesOptions = {}) => {
    const { silent = false, priorityEmail } = options;

    setFetching(true);
    try {
      // Use AbortController with 55s timeout (edge functions can take up to 50s)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55000);
      const effectivePriorityEmail = (priorityEmail ?? applicantEmail ?? '').trim().toLowerCase() || undefined;

      const { data, error } = await supabase.functions.invoke('fetch-email-replies', {
        body: { priorityEmail: effectivePriorityEmail },
        // @ts-ignore - signal is supported but not in types
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (error) {
        // Check if it's a timeout/abort/network error
        const errorMsg = error.message || '';
        const isAbortOrNetwork = errorMsg.includes('abort') ||
          errorMsg.includes('timeout') ||
          errorMsg.includes('Failed to send a request') ||
          errorMsg.includes('Failed to fetch') ||
          error.context?.message?.includes('aborted');

        if (isAbortOrNetwork) {
          if (!silent) {
            toast({
              title: 'Checking for replies',
              description: 'Email sync is running in the background. New replies will appear shortly.',
            });
          }
          // Refresh local data after a delay
          setTimeout(() => fetchReplies(true), 5000);
        } else {
          throw error;
        }
      } else {
        if (!silent) {
          if (data?.repliesFound > 0) {
            const priorityCount = data.priorityRepliesFound || 0;
            const totalCount = data.repliesFound;

            if (priorityCount > 0) {
              toast({
                title: 'New replies found',
                description: `Found ${priorityCount} new reply(s) for this applicant (${totalCount} total across all applicants)`,
              });
            } else {
              toast({
                title: 'New replies found (other applicants)',
                description: `Found ${totalCount} new replies across other applicants. No new reply from this applicant.`,
              });
            }
          } else {
            const wasProcessed = data?.priorityEmailProcessed;
            toast({
              title: 'No new replies',
              description: wasProcessed
                ? 'This applicant has not replied yet'
                : 'No new email replies found',
            });
          }
        }

        // Always refresh local list after a successful sync run
        await fetchReplies(true);
      }
    } catch (error: any) {
      console.error('Error fetching new replies:', error);
      // Handle network/timeout errors gracefully
      const errorMsg = error?.message || '';
      if (error.name === 'AbortError' || errorMsg.includes('Failed to fetch') || errorMsg.includes('abort') || errorMsg.includes('Failed to send a request')) {
        if (!silent) {
          toast({
            title: 'Checking for replies',
            description: 'Email sync is running in the background. New replies will appear shortly.',
          });
        }
        // Refresh local data after a delay
        setTimeout(() => fetchReplies(true), 5000);
      } else if (!silent) {
        toast({
          title: 'Error',
          description: 'Failed to fetch email replies: ' + errorMsg,
          variant: 'destructive',
        });
      }
    } finally {
      setFetching(false);
    }
  }, [applicantEmail, fetchReplies, toast]);

  return { replies, loading, fetching, fetchReplies, fetchNewReplies };
}

// Hook to get unread message counts per applicant
interface UnreadApplicantInfo {
  id: string;
  full_name: string;
  email: string;
  total_score: number | null;
  count: number;
  assigned_admin_id: string | null;
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
    
    // Fetch unread replies with applicant info and job's assigned admin in a single query using join
    const { data, error } = await supabase
      .from('email_replies')
      .select(`
        applicant_id,
        applicants_prescreen!inner (
          id,
          full_name,
          email,
          total_score,
          jobs!applicants_prescreen_job_id_fkey (
            assigned_admin_id
          )
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
          assigned_admin_id: applicant.jobs?.assigned_admin_id || null,
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
    
    // Pre-load email data for all applicants with unread messages (in background)
    // This ensures Communication History opens instantly
    applicantsWithCounts.forEach(applicant => {
      preloadApplicantEmailData(applicant.id);
    });
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

  // Mark all replies as read (optimistic update)
  const markAllAsRead = async () => {
    // Optimistic update
    setUnreadCounts({});
    setUnreadApplicants([]);
    
    // Update cache
    globalUnreadCache = {
      applicants: [],
      counts: {},
      lastFetched: Date.now()
    };
    
    const { error } = await supabase
      .from('email_replies')
      .update({ is_read: true })
      .eq('is_read', false);

    if (error) {
      // Rollback on error
      fetchUnreadCounts(true);
    }
  };

  return { unreadCounts, unreadApplicants, loading, fetchUnreadCounts, markAsRead, markAllAsRead };
}
