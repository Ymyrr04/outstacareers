import { useState, useEffect, useCallback } from 'react';
import { getErrorMessageSync } from "@/lib/errors";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { NotesEditor } from '@/components/NotesEditor';
import { FormattedNotes } from '@/components/FormattedNotes';
import { InterviewResultsFetcher } from '@/components/InterviewResultsFetcher';
import { Loader2, Save, Pencil, Eye, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getAdminDisplayName } from '@/lib/adminDisplayNames';
import { format } from 'date-fns';
import { formatDateTime } from "@/lib/dateFormat";

interface ApplicantNote {
  id: string;
  content: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface InterviewNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicantId: string;
  applicantName: string;
  onNotesUpdated?: () => void;
}

export function InterviewNotesDialog({ open, onOpenChange, applicantId, applicantName, onNotesUpdated }: InterviewNotesDialogProps) {
  const [notes, setNotes] = useState<ApplicantNote[]>([]);
  const [legacyNotes, setLegacyNotes] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    const [notesResult, applicantResult] = await Promise.all([
      supabase
        .from('applicant_notes')
        .select('*')
        .eq('applicant_id', applicantId)
        .order('created_at', { ascending: false }),
      supabase
        .from('applicants_prescreen')
        .select('notes')
        .eq('id', applicantId)
        .single(),
    ]);
    setNotes((notesResult.data as ApplicantNote[]) || []);
    setLegacyNotes(applicantResult.data?.notes || null);
    setLoading(false);
  }, [applicantId]);

  useEffect(() => {
    if (open) {
      fetchNotes();
      setEditingNoteId(null);
      setIsAddingNew(false);
      setNewContent('');
    }
  }, [open, fetchNotes]);

  const handleAddNote = async () => {
    if (!newContent || newContent === '<p></p>') {
      toast.error('Note cannot be empty');
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('applicant_notes')
      .insert({
        applicant_id: applicantId,
        content: newContent,
        created_by: user?.id || null,
      });
    setSaving(false);

    if (error) {
      toast.error(getErrorMessageSync(error, 'Failed to add note'));
    } else {
      setNewContent('');
      setIsAddingNew(false);
      toast.success('Note added');
      fetchNotes();
      onNotesUpdated?.();
    }
  };

  const handleUpdateNote = async (noteId: string) => {
    if (!editContent || editContent === '<p></p>') {
      toast.error('Note cannot be empty');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('applicant_notes')
      .update({ content: editContent, updated_at: new Date().toISOString() })
      .eq('id', noteId);
    setSaving(false);

    if (error) {
      toast.error(getErrorMessageSync(error, 'Failed to update note'));
    } else {
      setEditingNoteId(null);
      toast.success('Note updated');
      fetchNotes();
      onNotesUpdated?.();
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    const { error } = await supabase
      .from('applicant_notes')
      .delete()
      .eq('id', noteId);

    if (error) {
      toast.error(getErrorMessageSync(error, 'Failed to delete note'));
    } else {
      toast.success('Note deleted');
      fetchNotes();
      onNotesUpdated?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Notes — {applicantName}</DialogTitle>
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
            {/* Add New Note */}
            {!isAddingNew ? (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setIsAddingNew(true); setEditingNoteId(null); }}
                  className="gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Note
                </Button>
              </div>
            ) : (
              <div className="space-y-3 border rounded-lg p-3 bg-muted/20">
                <NotesEditor
                  value={newContent}
                  onChange={setNewContent}
                  placeholder="Write your note..."
                  minHeight="120px"
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setIsAddingNew(false); setNewContent(''); }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAddNote}
                    disabled={saving}
                    className="gap-1.5"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save Note
                  </Button>
                </div>
              </div>
            )}

            {/* Notes List */}
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : notes.length === 0 && !legacyNotes ? (
              <div className="text-center py-8 text-muted-foreground">
                No notes yet. Click "Add Note" to get started.
              </div>
            ) : (
              <div className="space-y-3">
                {notes.map((note) => (
                  <div key={note.id} className="border rounded-lg p-3 bg-muted/10">
                    {/* Header with timestamp and author */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium">
                          {getAdminDisplayName(note.created_by, 'Unknown')}
                        </span>
                        <span>•</span>
                        <span>{formatDateTime(note.created_at)}</span>
                        {note.updated_at !== note.created_at && (
                          <>
                            <span>•</span>
                            <span className="italic">edited</span>
                          </>
                        )}
                      </div>
                      {editingNoteId !== note.id && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => { setEditingNoteId(note.id); setEditContent(note.content); setIsAddingNew(false); }}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => setDeletingNoteId(note.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    {editingNoteId === note.id ? (
                      <div className="space-y-2">
                        <NotesEditor
                          value={editContent}
                          onChange={setEditContent}
                          placeholder="Edit note..."
                          minHeight="100px"
                          autoFocus
                        />
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingNoteId(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleUpdateNote(note.id)}
                            disabled={saving}
                            className="gap-1.5"
                          >
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <FormattedNotes content={note.content} />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Legacy notes from applicants_prescreen.notes field */}
            {legacyNotes && (
              <div className="border rounded-lg p-3 bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/50 dark:border-amber-800/30">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Applicant Notes</p>
                <FormattedNotes content={legacyNotes} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="results" className="mt-4">
            <InterviewResultsFetcher applicantId={applicantId} cachedSession={null} />
          </TabsContent>
        </Tabs>
      </DialogContent>

      <AlertDialog open={!!deletingNoteId} onOpenChange={(open) => !open && setDeletingNoteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the note. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deletingNoteId) {
                  await handleDeleteNote(deletingNoteId);
                  setDeletingNoteId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
