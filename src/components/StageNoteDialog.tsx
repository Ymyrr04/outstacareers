import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TimeSelect } from '@/components/ui/time-select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NotesEditor } from '@/components/NotesEditor';
import { StageNoteTemplates } from '@/components/StageNoteTemplates';
import { loadTemplateQuestions, questionAnswersHtml, type TemplateQuestion } from '@/lib/stageNoteTemplates';
import { type ReversibleStageMove } from '@/lib/stageMoveCancellation';
import { supabase } from '@/integrations/supabase/client';
import { getErrorMessageSync } from '@/lib/errors';
import { useSlackNotifications } from '@/hooks/useSlackNotifications';
import { Loader2, Save, CalendarPlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCalendarAdmins } from '@/hooks/useCalendarAdmins';
import { EVENT_TYPES, inputToMinutes, todayET } from '@/lib/calendarTime';
import { defaultsToCalendarOnMove } from '@/lib/stageNoteCalendar';

function escapeNoteText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br />');
}

export interface PendingStageNote extends ReversibleStageMove {
  candidateName: string;
}

const SIV_QUESTIONS = [
  'Do you have a home office setup?',
  'Do you have a noise-canceling headset?',
  'Do you have a fully functioning laptop or PC?',
  'Do you have a good quality internet connection?',
  'Do you have a power generator or backup for power cuts?',
  'Are you willing to work 40–50 hours per week?',
  'Are you comfortable working US time zones?',
  'Do you have experience in a similar role?',
  'Are you still currently Employed or Rendering your notice?',
] as const;

type SivTextField = 'start_availability' | 'upcoming_plans';

const SIV_TEXT_QUESTIONS: {
  field: SivTextField;
  label: string;
  helper: string;
  placeholder: string;
}[] = [
  {
    field: 'start_availability',
    label: 'How soon can you start?',
    helper: '',
    placeholder: 'e.g., Immediately, 2 weeks notice',
  },
  {
    field: 'upcoming_plans',
    label: 'Do you have any plans for the next 3 months?',
    helper: 'e.g. vacation, taking exams, or anything that could potentially affect your work schedule',
    placeholder: "e.g., None, or 1-week vacation in September",
  },
];

type SivAnswers = Partial<Record<string, boolean>>;
type SivTextAnswers = Partial<Record<SivTextField, string>>;

interface Props {
  pending: PendingStageNote | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  onCancel: () => Promise<void>;
}

export function StageNoteDialog({ pending, onOpenChange, onSaved, onCancel }: Props) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [sivAnswers, setSivAnswers] = useState<SivAnswers>({});
  const [sivText, setSivText] = useState<SivTextAnswers>({});
  const [questions, setQuestions] = useState<TemplateQuestion[]>([]);
  const { admins } = useCalendarAdmins();
  const { notifyCalendarActivity } = useSlackNotifications();

  // Calendar section
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [calDate, setCalDate] = useState(todayET());
  const [calStart, setCalStart] = useState('10:00');
  const [calEnd, setCalEnd] = useState('11:00');
  const [calType, setCalType] = useState('task');
  const [calAdmin, setCalAdmin] = useState('');
  const [calDesc, setCalDesc] = useState('');
  const [calTitle, setCalTitle] = useState('');

  useEffect(() => {
    if (!pending) return;
    setContent('');
    setSaving(false);
    setCancelling(false);
    setSivAnswers({});
    setSivText({});
    setQuestions([]);
    setAddToCalendar(defaultsToCalendarOnMove(pending.previousStatus));
    setCalDate(todayET());
    setCalStart('10:00');
    setCalEnd('11:00');
    setCalType('task');
    setCalDesc(`Stage moved to ${pending.newStatus} — ${pending.candidateName}`);
    setCalTitle(`${pending.newStatus} — ${pending.candidateName}`);

    let cancelled = false;
    (async () => {
      const [{ data: { user } }, { data: applicant }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('applicants_prescreen').select('job_id').eq('id', pending.applicantId).maybeSingle(),
      ]);
      let adminId = user?.id || '';
      if (applicant?.job_id) {
        const { data: job } = await supabase
          .from('jobs')
          .select('assigned_admin_id')
          .eq('id', applicant.job_id)
          .maybeSingle();
        if (job?.assigned_admin_id) adminId = job.assigned_admin_id;
      }
      if (!cancelled) setCalAdmin(adminId);
    })();
    return () => { cancelled = true; };
  }, [pending]);

  if (!pending) return null;

  const createCalendarEvent = async (userId: string | undefined) => {
    const s = inputToMinutes(calStart);
    const e = inputToMinutes(calEnd);
    if (e <= s) {
      toast.error('Calendar end time must be after start time');
      return false;
    }
    const owner = calAdmin || userId;
    const assignedToIds = owner ? [owner] : [];
    const { error } = await supabase.from('calendar_events').insert({
      title: calTitle.trim() || `${pending.newStatus} — ${pending.candidateName}`,
      description: calDesc.trim() || null,
      event_date: calDate,
      start_time: s,
      end_time: e,
      event_type: calType,
      created_by: owner,
      assigned_to: assignedToIds,
      is_recurring: false,
      recurrence_rule: null,
      pipeline_link: { type: 'applicant', id: pending.applicantId, name: pending.candidateName },
    });
    if (error) {
      toast.error(getErrorMessageSync(error, 'Failed to create calendar activity'));
      return false;
    }
    // Slack notification is fired server-side by a database trigger on insert.

    return true;
  };

  const handleCancel = async () => {
    if (saving || cancelling) return;
    setCancelling(true);
    try {
      await onCancel();
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessageSync(error, 'Failed to return candidate to the original stage'));
    } finally {
      setCancelling(false);
    }
  };

  const handleSave = async () => {
    if (saving || cancelling) return;
    const isSiv = pending.newStatus === 'SIV';
    const editorContent = content && content !== '<p></p>' ? content : '';
    const hasAnswer =
      SIV_QUESTIONS.some((q) => sivAnswers[q] !== undefined) ||
      SIV_TEXT_QUESTIONS.some((q) => (sivText[q.field] ?? '').trim() !== '');
    const hasCustomAnswer = questions.some(q => q.question.trim() && q.answer.trim());

    if (isSiv) {
      if (!hasAnswer && !hasCustomAnswer && !editorContent) {
        toast.error('Note cannot be empty');
        return;
      }
    } else if (!editorContent && !hasCustomAnswer) {
      toast.error('Note cannot be empty');
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    let noteContent = editorContent;
    if (isSiv) {
      const items = SIV_QUESTIONS.map((q) => {
        const answer = sivAnswers[q];
        const shown = answer === undefined
          ? 'Not answered'
          : `<strong>${answer ? 'Yes' : 'No'}</strong>`;
        return `<li>${q} — ${shown}</li>`;
      }).join('');
      const textItems = SIV_TEXT_QUESTIONS.map((q) => {
        const value = (sivText[q.field] ?? '').trim();
        const shown = value ? `<strong>${escapeNoteText(value)}</strong>` : 'Not answered';
        return `<li>${q.label} — ${shown}</li>`;
      }).join('');
      noteContent = `<p><strong>SIV Screening</strong></p><ul>${items}${textItems}</ul>${questionAnswersHtml(questions)}${editorContent}`;
    } else if (questions.length) {
      noteContent = `${questionAnswersHtml(questions)}${editorContent}`;
    }

    const { error } = await supabase.from('applicant_notes').insert({
      applicant_id: pending.applicantId,
      content: noteContent,
      created_by: user?.id || null,
    });
    if (error) {
      setSaving(false);
      toast.error(getErrorMessageSync(error, 'Failed to save note'));
      return;
    }

    let calendarCreated = false;
    if (addToCalendar) calendarCreated = await createCalendarEvent(user?.id);
    setSaving(false);

    toast.success(calendarCreated ? 'Stage updated and calendar activity created' : 'Note added');
    onSaved?.();
    onOpenChange(false);
  };


  return (
    <Dialog open={!!pending} onOpenChange={(o) => { if (!o && !saving && !cancelling) void handleCancel(); }}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto [&>button.absolute]:hidden" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Add a note</DialogTitle>
          <DialogDescription>
            {pending.candidateName} moved to <span className="font-medium">{pending.newStatus}</span>.
            A note is required — it will be saved to this candidate's notes.
          </DialogDescription>
        </DialogHeader>

        <StageNoteTemplates key={`${pending.applicantId}:${pending.newStatus}`} stage={pending.newStatus} content={content} questions={questions}
          onAddQuestion={() => setQuestions(prev => [...prev, { question: '', answer: '' }])}
          onLoad={(text, prompts) => { setContent(text); setQuestions(loadTemplateQuestions(prompts)); setSivAnswers({}); setSivText({}); }}
        />

        {pending.newStatus === 'SIV' && (
          <div className="rounded-md border p-3 space-y-2.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">SIV Screening</p>
            {SIV_QUESTIONS.map((q) => {
              const answer = sivAnswers[q];
              return (
                <div key={q} className="flex items-center justify-between gap-3">
                  <span className="text-sm leading-snug">{q}</span>
                  <div className="flex gap-1.5 shrink-0">
                    {([true, false] as const).map((val) => {
                      const selected = answer === val;
                      return (
                        <Button
                          key={String(val)}
                          type="button"
                          size="sm"
                          variant={selected ? 'default' : 'outline'}
                          className="h-7 px-3 text-xs"
                          onClick={() => setSivAnswers(prev => ({ ...prev, [q]: selected ? undefined : val }))}
                        >
                          {val ? 'Yes' : 'No'}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="space-y-2.5 pt-2.5 border-t">
              {SIV_TEXT_QUESTIONS.map((q) => {
                const id = `siv_${q.field}`;
                return (
                  <div key={q.field} className="space-y-1">
                    <Label htmlFor={id} className="text-sm font-medium leading-snug">
                      {q.label}
                    </Label>
                    {q.helper && (
                      <p className="text-xs text-muted-foreground">{q.helper}</p>
                    )}
                    <Input
                      id={id}
                      value={sivText[q.field] ?? ''}
                      onChange={(e) =>
                        setSivText(
                          (prev) => ({ ...prev, [q.field]: e.target.value }) as SivTextAnswers,
                        )
                      }
                      placeholder={q.placeholder}
                      className="h-9 text-sm"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {questions.length > 0 && <div className="space-y-3">
          {questions.map((q, index) => <div key={index} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Input aria-label={`Question ${index + 1}`} placeholder="Screening question" value={q.question} maxLength={1000}
                onChange={e => setQuestions(prev => prev.map((item, i) => i === index ? { ...item, question: e.target.value } : item))} />
              <Button type="button" size="icon" variant="ghost" title="Remove question" aria-label={`Remove question ${index + 1}`} onClick={() => setQuestions(prev => prev.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <Textarea aria-label={`Answer ${index + 1}`} placeholder="Candidate’s answer" rows={2} value={q.answer}
              onChange={e => setQuestions(prev => prev.map((item, i) => i === index ? { ...item, answer: e.target.value } : item))} />
          </div>)}
        </div>}

        <NotesEditor
          value={content}
          onChange={setContent}
          placeholder={pending.newStatus === 'SIV' ? 'Additional notes (optional)' : 'Write your note...'}
          minHeight="140px"
          autoFocus
        />

        <div className="rounded-md border p-3 space-y-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={addToCalendar}
              onCheckedChange={(v) => setAddToCalendar(v === true)}
            />
            <CalendarPlus className="w-4 h-4 text-muted-foreground" />
            <span>Add to calendar</span>
          </label>

          {addToCalendar && (
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="sn-title" className="text-xs">Activity title</Label>
                <Input id="sn-title" value={calTitle} onChange={(e) => setCalTitle(e.target.value)} placeholder="Activity title" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sn-date" className="text-xs">Date</Label>
                  <Input id="sn-date" type="date" value={calDate} onChange={(e) => setCalDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sn-start" className="text-xs">Start (ET)</Label>
                  <TimeSelect id="sn-start" value={calStart} onChange={setCalStart} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sn-end" className="text-xs">End (ET)</Label>
                  <TimeSelect id="sn-end" value={calEnd} onChange={setCalEnd} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Activity type</Label>
                  <Select value={calType} onValueChange={setCalType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Assigned to</Label>
                  <Select value={calAdmin} onValueChange={setCalAdmin}>
                    <SelectTrigger><SelectValue placeholder="Select admin" /></SelectTrigger>
                    <SelectContent>
                      {admins.map((a) => (
                        <SelectItem key={a.user_id} value={a.user_id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sn-desc" className="text-xs">Description</Label>
                <Textarea id="sn-desc" rows={2} value={calDesc} onChange={(e) => setCalDesc(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Link</Label>
                <Input readOnly value={`Applicant · ${pending.candidateName}`} className="bg-muted" />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleCancel} disabled={saving || cancelling}>
            {cancelling && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || cancelling}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save note
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
