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

export function useEmailTemplates() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
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
    } else {
      setTemplates(data || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Real-time subscription for email_templates
  useEffect(() => {
    const channel = supabase
      .channel('email-templates-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'email_templates',
        },
        (payload) => {
          console.log('Email template change:', payload);
          
          if (payload.eventType === 'INSERT') {
            setTemplates((prev) => [...prev, payload.new as EmailTemplate]);
          } else if (payload.eventType === 'UPDATE') {
            setTemplates((prev) =>
              prev.map((t) => (t.id === payload.new.id ? (payload.new as EmailTemplate) : t))
            );
          } else if (payload.eventType === 'DELETE') {
            setTemplates((prev) => prev.filter((t) => t.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
    setLoading(true);
    let query = supabase
      .from('email_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (applicantId) {
      query = query.eq('applicant_id', applicantId);
    }

    const { data, error } = await query;

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch email logs',
        variant: 'destructive',
      });
    } else {
      setLogs(data || []);
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
