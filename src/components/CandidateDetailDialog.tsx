import { useState, useEffect, useCallback } from 'react';
import { getErrorMessageSync } from "@/lib/errors";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { SearchApplicantExpandedView } from '@/components/SearchApplicantExpandedView';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { priorityGate } from '@/lib/priorityGate';
import type { PaginatedApplicant } from '@/hooks/usePaginatedApplicants';

interface CandidateDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicantId: string | null;
  initialApplicant?: PaginatedApplicant | null;
}

// An "initial" applicant from the kanban is just a slim row (id, name, email,
// status, total_score, etc.) — it's missing the breakdown scores, AI summary,
// flags, etc. that the dialog renders. Treat it as a complete payload only
// when those fields are present; otherwise we show the loading spinner until
// the full fetch finishes.
function isFullyHydrated(a: PaginatedApplicant | null | undefined): boolean {
  if (!a) return false;
  // Use a field that only the full fetch sets (and that the slim kanban row
  // does NOT include) as the hydration marker.
  return Object.prototype.hasOwnProperty.call(a, 'ai_summary')
    && Object.prototype.hasOwnProperty.call(a, 'home_office')
    && Object.prototype.hasOwnProperty.call(a, 'role_experience_score');
}

export function CandidateDetailDialog({ open, onOpenChange, applicantId, initialApplicant }: CandidateDetailDialogProps) {
  const [applicant, setApplicant] = useState<PaginatedApplicant | null>(
    isFullyHydrated(initialApplicant) ? initialApplicant! : null
  );
  const [loading, setLoading] = useState(false);
  const [downloadingCv, setDownloadingCv] = useState<string | null>(null);
  const [replacingCv, setReplacingCv] = useState<string | null>(null);

  // Sync initial data when dialog opens with a (possibly different) candidate
  useEffect(() => {
    if (open && isFullyHydrated(initialApplicant) && initialApplicant!.id === applicantId) {
      setApplicant(initialApplicant!);
    } else if (open && initialApplicant?.id !== applicant?.id) {
      // Different candidate (or slim payload) — clear stale data so the spinner shows.
      setApplicant(null);
    }
  }, [open, applicantId, initialApplicant]);

  useEffect(() => {
    if (!open || !applicantId) {
      if (!open) setApplicant(null);
      return;
    }

    // If parent passed a fully-hydrated payload, skip the spinner. A slim
    // kanban row (no scores/flags) doesn't count — show the spinner so the
    // user doesn't see "-/50" placeholders while data loads.
    const hasInitial = isFullyHydrated(initialApplicant) && initialApplicant!.id === applicantId;

    const fetchApplicant = async () => {
      if (!hasInitial) setLoading(true);
      // Mark this fetch as high-priority so background phases in the kanban
      // (cold columns + interview/history enrichment) yield until we're done.
      priorityGate.begin();
      // Exclude heavy columns (cv_text) — they aren't rendered here and slow down the
      // round-trip significantly for candidates with large CVs.
      const APPLICANT_COLUMNS = 'id, full_name, email, phone, whatsapp, home_office, noise_canceling_headset, laptop_or_pc, good_internet, internet_speed, power_backup, can_work_40_50, us_timezone_ok, start_availability, has_experience, currently_working, location, job_title, job_id, apply_url, status, submitted_at, notes, role_experience_score, skills_tools_score, availability_setup_score, bonus_red_flag_score, total_score, ranking_status, ai_summary, cv_file_url, vocaroo_link, voice_recording_url, ai_assessment_details, extracted_skills, extracted_tools, years_of_experience, job_source, is_available, availability_checked_at, original_job_id, original_job_title, reprofiled_at, candidate_profile, details_viewed_at, is_starred, device_type, employment_status, last_day_with_employer, upcoming_plans';

      try {
        const [applicantRes, sessionRes] = await Promise.all([
          supabase
            .from('applicants_prescreen')
            .select(APPLICANT_COLUMNS)
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
            cv_text: null,
            is_starred: applicantRes.data.is_starred ?? false,
            ai_assessment_details: applicantRes.data.ai_assessment_details as any,
            interview_session: sessionRes.data || null,
          } as PaginatedApplicant);
        }
      } finally {
        setLoading(false);
        priorityGate.end();
      }
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
      toast.error(getErrorMessageSync(err, 'Failed to download CV'));
    } finally {
      setDownloadingCv(null);
    }
  }, []);

  const handleReplaceCv = useCallback(async (
    e: React.ChangeEvent<HTMLInputElement>,
    applicantId: string
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setReplacingCv(applicantId);
    toast.loading('Replacing CV file...', { id: `replace-cv-${applicantId}` });

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      const filePath = `applications/${applicantId}-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('cv-uploads')
        .upload(filePath, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      // Update only the CV file URL — keep all scores and assessment as is
      const { error: updateError } = await supabase
        .from('applicants_prescreen')
        .update({ cv_file_url: filePath })
        .eq('id', applicantId);

      if (updateError) throw updateError;

      setApplicant(prev => prev && prev.id === applicantId ? { ...prev, cv_file_url: filePath } : prev);

      toast.success('CV replaced — scores unchanged.', { id: `replace-cv-${applicantId}` });
    } catch (err) {
      toast.error(getErrorMessageSync(err, 'Could not replace CV'), { id: `replace-cv-${applicantId}` });
    } finally {
      setReplacingCv(null);
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
            onReplaceCv={handleReplaceCv}
            rescoring={null}
            downloadingCv={downloadingCv}
            replacingCv={replacingCv}
          />
        ) : (
          <p className="text-center text-muted-foreground py-8">Could not load candidate details.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}