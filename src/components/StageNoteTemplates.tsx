import { useEffect, useState } from 'react';
import { Download, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { getErrorMessageSync } from '@/lib/errors';
import { templateQuestions, type TemplateQuestion } from '@/lib/stageNoteTemplates';
import { toast } from 'sonner';

interface NoteTemplate { id: string; name: string; content: string; questions: string[] }
interface Props {
  stage: string;
  content: string;
  questions: TemplateQuestion[];
  onLoad: (content: string, questions: string[]) => void;
  onAddQuestion: () => void;
}

export function StageNoteTemplates({ stage, content, questions, onLoad, onAddQuestion }: Props) {
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [naming, setNaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [confirmation, setConfirmation] = useState<'load' | 'delete' | null>(null);
  const chosen = templates.find(t => t.id === selected);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase.from('stage_note_templates').select('id, name, content, questions').eq('stage', stage).order('name')
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        setFailed(Boolean(error));
        if (error) toast.error(getErrorMessageSync(error, 'Could not load note templates'));
        else setTemplates(data ?? []);
      });
    return () => { cancelled = true; };
  }, [stage]);

  const save = async () => {
    if (!name.trim()) { toast.error('Enter a template name'); return; }
    const savedQuestions = templateQuestions(questions);
    if (!savedQuestions.length && !content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() && stage !== 'SIV') {
      toast.error('Add a question or template text first'); return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.from('stage_note_templates')
        .insert({ name: name.trim(), stage, content, questions: savedQuestions })
        .select('id, name, content, questions').single();
      if (error) throw error;
      setTemplates(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSelected(data.id);
      setNaming(false);
      setName('');
      toast.success('Template saved');
    } catch (error) { toast.error(getErrorMessageSync(error, 'Could not save template')); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!chosen) return;
    if (confirmation === 'load') {
      onLoad(chosen.content, chosen.questions);
      setConfirmation(null);
      toast.success('Template loaded');
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.from('stage_note_templates').delete().eq('id', chosen.id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Template could not be deleted');
      setTemplates(prev => prev.filter(t => t.id !== chosen.id));
      setSelected('');
      setConfirmation(null);
      toast.success('Template deleted');
    } catch (error) { toast.error(getErrorMessageSync(error, 'Could not delete template')); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-2 border-b pb-3">
      <Label className="text-xs text-muted-foreground">Note templates</Label>
      <div className="flex items-center gap-1.5">
        <Select value={selected} onValueChange={setSelected} disabled={loading || busy || !templates.length}>
          <SelectTrigger className="min-w-0 flex-1"><SelectValue placeholder={loading ? 'Loading templates…' : failed ? 'Templates unavailable' : templates.length ? 'Select template' : 'No saved templates'} /></SelectTrigger>
          <SelectContent>{templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
        <Button type="button" size="icon" variant="outline" title="Load template" aria-label="Load template" disabled={!chosen || busy} onClick={() => setConfirmation('load')}><Download className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="outline" title="Save as template" aria-label="Save as template" disabled={busy} onClick={() => setNaming(v => !v)}><Save className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="outline" title="Delete template" aria-label="Delete template" disabled={!chosen || busy} onClick={() => setConfirmation('delete')}><Trash2 className="h-4 w-4" /></Button>
      </div>
      {naming && <div className="flex items-center gap-2">
        <Input aria-label="Template name" placeholder="Template name — e.g. Client · SIV" value={name} maxLength={120} disabled={busy} onChange={e => setName(e.target.value)} />
        <Button type="button" size="sm" disabled={busy} onClick={save}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save template'}</Button>
      </div>}
      <Button type="button" variant="ghost" size="sm" disabled={busy || questions.length >= 30} onClick={onAddQuestion}><Plus className="h-4 w-4 mr-1" />Add question</Button>
      <AlertDialog open={confirmation !== null} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation === 'delete' ? 'Delete template?' : 'Load template?'}</AlertDialogTitle>
            <AlertDialogDescription>{confirmation === 'delete' ? `“${chosen?.name}” will be removed for all admins. Saved candidate notes stay unchanged.` : `“${chosen?.name}” will replace the current draft and clear screening answers for this candidate.`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><Button disabled={busy} variant={confirmation === 'delete' ? 'destructive' : 'default'} onClick={confirm}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmation === 'delete' ? 'Delete template' : 'Load template'}</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}