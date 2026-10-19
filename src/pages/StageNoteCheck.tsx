import { useState } from 'react';
import { StageNoteDialog, type PendingStageNote } from '@/components/StageNoteDialog';

export default function StageNoteCheck() {
  const from = new URLSearchParams(window.location.search).get('from') || 'Qualified';
  const [open, setOpen] = useState(true);
  const pending: PendingStageNote = {
    applicantId: '00000000-0000-0000-0000-000000000000',
    previousStatus: from,
    newStatus: 'For Interview',
    candidateName: 'Check Candidate',
  };
  return <StageNoteDialog pending={pending} onOpenChange={setOpen} onCancel={async () => {}} />;
}
