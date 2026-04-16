import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { SearchApplicantExpandedView } from '@/components/SearchApplicantExpandedView';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PaginatedApplicant } from '@/hooks/usePaginatedApplicants';

interface CandidateDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicantId: string | null;
  initialApplicant?: PaginatedApplicant | null;
}

export function CandidateDetailDialog({ open, onOpenChange, applicantId, initialApplicant }: CandidateDetailDialogProps) {
  const [applicant, setApplicant] = useState<PaginatedApplicant | null>(initialApplicant ?? null);
  const [loading, setLoading] = useState(false);
  const [downloadingCv, setDownloadingCv] = useState<string | null>(null);

  // Sync initial data when dialog opens with a (possibly different) candidate
  useEffect(() => {
    if (open && initialApplicant && initialApplicant.id === applicantId) {
      setApplicant(initialApplicant);
    }
  }, [open, applicantId, initialApplicant]);

  useEffect(() => {
    if (!open || !applicantId) {
      if (!open) setApplicant(null);
      return;
    }

    // If we already have data from the parent, skip the spinner — refresh silently in background.
    const hasInitial = !!(initialApplicant && initialApplicant.id === applicantId);

    const fetchApplicant = async () => {
      if (!hasInitial) setLoading(true);
      const [applicantRes, sessionRes] = await Promise.all([
        supabase
          .from('applicants_prescreen')
          .select('*')
          .eq('id', applicantId)
          .maybeSingle(),
        supabase
          .from('interview_sessions')
          .select('id, status, experience_score, technical_score, communication_score, situational_score, personality_score, overall_score, ai_summary, ai_strengths, ai_concerns, completed_at')
          .eq('applicant_id', applicantId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (applicantRes.data) {
        setApplicant({
          ...applicantRes.data,
          is_starred: applicantRes.data.is_starred ?? false,
          ai_assessment_details: applicantRes.data.ai_assessment_details as any,
          interview_session: sessionRes.data || null,
        } as PaginatedApplicant);
      }
      setLoading(false);
    };

    fetchApplicant();
  }, [open, applicantId, initialApplicant]);

  const handleDownloadCv = useCallback(async (id: string, cvUrl: string, name: string) => {
    setDownloadingCv(id);
    try {
      const match = cvUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/cv-uploads\/(.+?)(?:\?|$)/) 
        || cvUrl.match(/cv-uploads\/(.+?)(?:\?|$)/);
      const filePath = match ? decodeURIComponent(match[1]) : cvUrl;

      const { data, error } = await supabase.storage.from('cv-uploads').download(filePath);
      if (error || !data) throw error || new Error('No data');

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}-CV.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      toast.error('Failed to download CV');
    } finally {
      setDownloadingCv(null);
    }
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{applicant?.full_name || 'Candidate Details'}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : applicant ? (
          <SearchApplicantExpandedView
            applicant={applicant}
            onRescoreCv={() => {}}
            onDownloadCv={handleDownloadCv}
            rescoring={null}
            downloadingCv={downloadingCv}
          />
        ) : (
          <p className="text-center text-muted-foreground py-8">Could not load candidate details.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}