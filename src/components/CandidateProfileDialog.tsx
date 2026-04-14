import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { CandidateProfileSection } from '@/components/CandidateProfileSection';
import { Loader2 } from 'lucide-react';

interface CandidateProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicantId: string;
  applicantName: string;
}

export function CandidateProfileDialog({ open, onOpenChange, applicantId, applicantName }: CandidateProfileDialogProps) {
  const [candidateProfile, setCandidateProfile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from('applicants_prescreen')
      .select('candidate_profile')
      .eq('id', applicantId)
      .single()
      .then(({ data }) => {
        setCandidateProfile(data?.candidate_profile ?? null);
        setLoading(false);
      });
  }, [open, applicantId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Candidate Profile — {applicantName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <CandidateProfileSection
            applicantId={applicantId}
            candidateProfile={candidateProfile}
            onUpdate={(newProfile) => setCandidateProfile(newProfile)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
