import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { NotesEditor } from '@/components/NotesEditor';
import { FormattedNotes } from '@/components/FormattedNotes';
import { InterviewResultsFetcher } from '@/components/InterviewResultsFetcher';
import { Loader2, Save, Pencil, Eye } from 'lucide-react';
import { toast } from 'sonner';

interface InterviewNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicantId: string;
  applicantName: string;
}

export function InterviewNotesDialog({ open, onOpenChange, applicantId, applicantName }: InterviewNotesDialogProps) {
  const [notes, setNotes] = useState('');
  const [originalNotes, setOriginalNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('applicants_prescreen')
      .select('notes')
      .eq('id', applicantId)
      .single();
    const val = data?.notes || '';
    setNotes(val);
    setOriginalNotes(val);
    setLoading(false);
  }, [applicantId]);

  useEffect(() => {
    if (open) {
      fetchNotes();
      setIsEditing(false);
    }
  }, [open, fetchNotes]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('applicants_prescreen')
      .update({ notes })
      .eq('id', applicantId);
    setSaving(false);

    if (error) {
      toast.error('Failed to save notes');
    } else {
      setOriginalNotes(notes);
      setIsEditing(false);
      toast.success('Notes saved');
    }
  };

  const hasChanges = notes !== originalNotes;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Interview Notes — {applicantName}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="notes" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="notes" className="flex-1 gap-1.5">
              <Pencil className="w-3.5 h-3.5" />
              Notes
            </TabsTrigger>
            <TabsTrigger value="results" className="flex-1 gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              Interview Results
            </TabsTrigger>
          </TabsList>

          <TabsContent value="notes" className="mt-4 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : isEditing ? (
              <div className="space-y-3">
                <NotesEditor
                  value={notes}
                  onChange={setNotes}
                  placeholder="Add interview notes..."
                  minHeight="200px"
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setNotes(originalNotes); setIsEditing(false); }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saving || !hasChanges}
                    className="gap-1.5"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {notes && notes !== '<p></p>' ? (
                  <div className="bg-muted/30 rounded-lg p-4 border">
                    <FormattedNotes notes={notes} />
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No interview notes yet
                  </div>
                )}
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditing(true)}
                    className="gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    {notes && notes !== '<p></p>' ? 'Edit Notes' : 'Add Notes'}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="results" className="mt-4">
            <InterviewResultsFetcher applicantId={applicantId} cachedSession={null} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
