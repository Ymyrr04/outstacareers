import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { NotesEditor } from '@/components/NotesEditor';
import { supabase } from '@/integrations/supabase/client';
import { getErrorMessageSync } from '@/lib/errors';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

export interface PendingStageNote {
  applicantId: string;
  candidateName: string;
  newStatus: string;
}

interface Props {
  pending: PendingStageNote | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function StageNoteDialog({ pending, onOpenChange, onSaved }: Props) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (pending) {
      setContent('');
      setSaving(false);
    }
  }, [pending]);

  if (!pending) return null;

  const handleSave = async () => {
    if (!content || content === '<p></p>') {
      toast.error('Note cannot be empty');
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('applicant_notes').insert({
      applicant_id: pending.applicantId,
      content,
      created_by: user?.id || null,
    });
    setSaving(false);
    if (error) {
      toast.error(getErrorMessageSync(error, 'Failed to save note'));
      return;
    }
    toast.success('Note added');
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={!!pending} onOpenChange={(o) => { if (!o) onOpenChange(false); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a note</DialogTitle>
          <DialogDescription>
            {pending.candidateName} moved to <span className="font-medium">{pending.newStatus}</span>.
            Add a note — it will be saved to this candidate's notes.
          </DialogDescription>
        </DialogHeader>

        <NotesEditor
          value={content}
          onChange={setContent}
          placeholder="Write your note..."
          minHeight="140px"
          autoFocus
        />

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Skip
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save note
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
