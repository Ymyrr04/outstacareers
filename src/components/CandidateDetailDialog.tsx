import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { SearchApplicantExpandedView } from '@/components/SearchApplicantExpandedView';
import { Loader2 } from 'lucide-react';
import type { PaginatedApplicant } from '@/hooks/usePaginatedApplicants';

interface CandidateDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicantId: string | null;
}

export function CandidateDetailDialog({ open, onOpenChange, applicantId }: CandidateDetailDialogProps) {
  const [applicant, setApplicant] = useState<PaginatedApplicant | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !applicantId) {
      setApplicant(null);
      return;
    }

    const fetchApplicant = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('applicants_prescreen')
        .select('*')
        .eq('id', applicantId)
        .single();

      if (data) {
        // Fetch interview session
        const { data: sessionData } = await supabase
          .from('interview_sessions')
          .select('id, status, experience_score, technical_score, communication_score, situational_score, personality_score, overall_score, ai_summary, ai_strengths, ai_concerns, completed_at')
          .eq('applicant_id', applicantId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        setApplicant({
          ...data,
          is_starred: data.is_starred ?? false,
          ai_assessment_details: data.ai_assessment_details as any,
          interview_session: sessionData || null,
        } as PaginatedApplicant);
      }
      setLoading(false);
    };

    fetchApplicant();
  }, [open, applicantId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
            onDownloadCv={() => {}}
            rescoring={null}
            downloadingCv={null}
          />
        ) : (
          <p className="text-center text-muted-foreground py-8">Could not load candidate details.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
