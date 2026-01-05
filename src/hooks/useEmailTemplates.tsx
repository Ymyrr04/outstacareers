import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface EmailTemplate {
  id: string;
  status_trigger: string;
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

// Map status to template trigger
export const statusToTrigger: Record<string, string> = {
  'For Review': 'application_received',
  'Reviewed': 'reviewed',
  'Pass Screening': 'pass_screening',
  'Reject': 'reject',
  '50/50': '50/50',
  'For Interview': 'for_interview',
  'Candidate Successful': 'candidate_successful',
  'Bench': 'bench',
  'Hire': 'hire',
};

export const triggerToStatus: Record<string, string> = {
  'application_received': 'Application Received',
  'reviewed': 'Reviewed',
  'pass_screening': 'Pass Screening',
  'reject': 'Rejection',
  '50/50': '50/50',
  'for_interview': 'Interview Invitation',
  'candidate_successful': 'Candidate Successful',
  'bench': 'Bench',
  'hire': 'Hire',
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

  const getTemplateByTrigger = (trigger: string) => {
    return templates.find(t => t.status_trigger === trigger);
  };

  return {
    templates,
    loading,
    fetchTemplates,
    updateTemplate,
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
