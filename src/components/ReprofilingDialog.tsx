import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserCog, Send } from 'lucide-react';
import { useEmailTemplates } from '@/hooks/useEmailTemplates';
import { SendEmailDialog } from '@/components/SendEmailDialog';

interface Job {
  id: string;
  title: string;
  is_active: boolean;
  client_id: string | null;
  client_name?: string | null;
}

interface ReprofilingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicant: {
    id: string;
    full_name: string;
    email: string;
    job_title: string;
    job_id: string | null;
    original_job_id: string | null;
    original_job_title: string | null;
    status: string;
  } | null;
  onReprofiled: () => void;
}

export function ReprofilingDialog({
  open,
  onOpenChange,
  applicant,
  onReprofiled,
}: ReprofilingDialogProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const { toast } = useToast();

  const applicantId = applicant?.id;
  const applicantJobId = applicant?.job_id;

  useEffect(() => {
    if (open) {
      fetchJobs();
      setSelectedJobId(applicantJobId || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, applicantId, applicantJobId]);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      // Fetch all jobs (including inactive ones) for reprofiling
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title, is_active')
        .order('title');

      if (error) throw error;
      setJobs(data || []);
    } catch (error: any) {
      toast({
        title: 'Error loading jobs',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReprofile = async (sendEmail: boolean = false) => {
    if (!applicant || !selectedJobId) return;

    const selectedJob = jobs.find(j => j.id === selectedJobId);
    if (!selectedJob) return;

    setSaving(true);
    try {
      // Prepare update data
      const updateData: Record<string, any> = {
        job_id: selectedJobId,
        job_title: selectedJob.title,
        reprofiled_at: new Date().toISOString(),
      };

      // If this is the first reprofiling, save original job info
      if (!applicant.original_job_id) {
        updateData.original_job_id = applicant.job_id;
        updateData.original_job_title = applicant.job_title;
      }

      const { error } = await supabase
        .from('applicants_prescreen')
        .update(updateData)
        .eq('id', applicant.id);

      if (error) throw error;

      toast({
        title: 'Applicant reprofiled',
        description: `${applicant.full_name} reassigned to ${selectedJob.title}`,
      });

      onReprofiled();
      
      if (sendEmail) {
        setShowEmailDialog(true);
      } else {
        onOpenChange(false);
      }
    } catch (error: any) {
      toast({
        title: 'Failed to reprofile',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!applicant) return null;

  const selectedJob = jobs.find(j => j.id === selectedJobId);
  const isCurrentJob = selectedJobId === applicant.job_id;

  return (
    <>
      <Dialog open={open && !showEmailDialog} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="w-5 h-5" />
              Reprofile Applicant
            </DialogTitle>
            <DialogDescription>
              Change the role for {applicant.full_name}. The original role will be preserved in the history.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Current Role</Label>
              <p className="text-sm font-medium">{applicant.job_title}</p>
              {applicant.original_job_title && applicant.original_job_title !== applicant.job_title && (
                <p className="text-xs text-muted-foreground">
                  Originally applied for: {applicant.original_job_title}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>New Role</Label>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading jobs...
                </div>
              ) : (
                <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role..." />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs.map((job) => (
                      <SelectItem key={job.id} value={job.id}>
                        {job.title}
                        {!job.is_active && ' (Hidden)'}
                        {job.id === applicant.job_id && ' (Current)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedJob && !selectedJob.is_active && (
              <p className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-md">
                Note: This role is currently hidden from the public job board.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => handleReprofile(true)}
              disabled={saving || !selectedJobId || isCurrentJob}
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Save & Send Email
            </Button>
            <Button
              onClick={() => handleReprofile(false)}
              disabled={saving || !selectedJobId || isCurrentJob}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {showEmailDialog && applicant && selectedJob && (
        <SendEmailDialog
          open={showEmailDialog}
          onOpenChange={(open) => {
            setShowEmailDialog(open);
            if (!open) onOpenChange(false);
          }}
          applicant={{
            id: applicant.id,
            full_name: applicant.full_name,
            email: applicant.email,
            job_title: selectedJob.title,
            status: applicant.status,
          }}
          preselectedTemplate="reprofiling"
          onEmailSent={() => {
            setShowEmailDialog(false);
            onOpenChange(false);
          }}
        />
      )}
    </>
  );
}
