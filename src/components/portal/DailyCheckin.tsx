import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Check, X, Settings2, MessageSquare, CheckCheck } from 'lucide-react';
import { FormattedNotes } from '@/components/FormattedNotes';
import { parseCheckinItem } from '@/lib/checkinItem';

export interface CheckinSection {
  title: string;
  items: string[];
  color?: string;
  enabled?: boolean;
}

const DEFAULT_SECTIONS: CheckinSection[] = [];




interface Props {
  contractorAssignmentId: string;
  contractorName: string;
  jobTitle?: string | null;
  companyName?: string | null;
  onSubmitted?: () => void;
}

export const DailyCheckin = ({ contractorAssignmentId, contractorName, jobTitle, companyName, onSubmitted }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);

  const [sections, setSections] = useState<CheckinSection[]>(DEFAULT_SECTIONS);
  const [draftSections, setDraftSections] = useState<CheckinSection[]>(DEFAULT_SECTIONS);
  const [checked, setChecked] = useState<Record<string, Set<number>>>({});
  const [notes, setNotes] = useState('');
  const [recent, setRecent] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);

  const loadMessages = async () => {
    const { data, error } = await supabase.rpc('get_contractor_checkin_messages' as any, {
      _contractor_assignment_id: contractorAssignmentId,
    });
    if (error) {
      console.error('Failed to load contractor check-in messages', error);
      return;
    }
    setMessages((data as any) || []);
  };

  const markMessageRead = async (id: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, read_at: new Date().toISOString() } : m));
    await supabase.from('contractor_checkin_messages' as any).update({ read_at: new Date().toISOString() } as any).eq('id', id);
  };

  const [msgChecked, setMsgChecked] = useState<Record<string, Record<string, Set<number>>>>({});
  const [msgAnswers, setMsgAnswers] = useState<Record<string, Record<string, Record<number, string>>>>({});
  const [msgNotes, setMsgNotes] = useState<Record<string, string>>({});
  const [msgSubmitting, setMsgSubmitting] = useState<string | null>(null);

  const toggleMsgItem = (msgId: string, sectionTitle: string, idx: number) => {
    setMsgChecked(prev => {
      const forMsg = { ...(prev[msgId] || {}) };
      const set = new Set(forMsg[sectionTitle] || []);
      if (set.has(idx)) set.delete(idx); else set.add(idx);
      forMsg[sectionTitle] = set;
      return { ...prev, [msgId]: forMsg };
    });
  };

  const setMsgAnswer = (msgId: string, sectionTitle: string, idx: number, value: string) => {
    setMsgAnswers(prev => {
      const forMsg = { ...(prev[msgId] || {}) };
      const forSec = { ...(forMsg[sectionTitle] || {}) };
      forSec[idx] = value;
      forMsg[sectionTitle] = forSec;
      return { ...prev, [msgId]: forMsg };
    });
  };

  const submitMsgForm = async (m: any) => {
    setMsgSubmitting(m.id);
    try {
      const responses: any = { sections: [], notes: msgNotes[m.id] || '' };
      (m.sections || []).forEach((sec: any) => {
        const checkedSet = msgChecked[m.id]?.[sec.title] || new Set();
        const answersFor = msgAnswers[m.id]?.[sec.title] || {};
        const checked: string[] = [];
        const answers: { question: string; answer: string }[] = [];
        (sec.items || []).forEach((raw: string, i: number) => {
          const p = parseCheckinItem(raw);
          if (p.type === 'check') {
            if (checkedSet.has(i)) checked.push(p.text);
          } else {
            const a = (answersFor[i] || '').trim();
            if (a) answers.push({ question: p.text, answer: a });
          }
        });
        responses.sections.push({ title: sec.title, checked, answers });
      });
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('contractor_checkin_messages' as any)
        .update({ responses, submitted_at: nowIso, read_at: m.read_at || nowIso } as any)
        .eq('id', m.id);
      if (error) throw error;
      setMessages(prev => prev.map(x => x.id === m.id ? { ...x, responses, submitted_at: nowIso, read_at: x.read_at || nowIso } : x));
      toast({ title: 'Submitted', description: 'Your response was sent to your manager.' });
      onSubmitted?.();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setMsgSubmitting(null);
    }
  };


  const initChecked = (s: CheckinSection[]) => {
    const m: Record<string, Set<number>> = {};
    s.forEach(sec => { m[sec.title] = new Set(); });
    return m;
  };

  const load = async () => {
    setLoading(true);
    const { data: tpl } = await supabase
      .from('contractor_checkin_templates')
      .select('sections')
      .eq('contractor_assignment_id', contractorAssignmentId)
      .maybeSingle();

    let secs: CheckinSection[] | null = null;
    if (tpl?.sections && Array.isArray(tpl.sections) && tpl.sections.length > 0) {
      secs = tpl.sections as unknown as CheckinSection[];
    } else {
      // Fallback: use the contractor's current pipeline stage template if set
      const { data: trk } = await supabase
        .from('contractor_pipeline_tracking')
        .select('current_stage_id')
        .eq('contractor_assignment_id', contractorAssignmentId)
        .maybeSingle();
      if (trk?.current_stage_id) {
        const { data: stg } = await supabase
          .from('contractor_pipeline_stages')
          .select('checkin_sections')
          .eq('id', trk.current_stage_id)
          .maybeSingle();
        const stageSecs = (stg as any)?.checkin_sections;
        if (Array.isArray(stageSecs) && stageSecs.length > 0) {
          secs = stageSecs as CheckinSection[];
        }
      }
      if (!secs) {
        // Fallback to the library template marked as default (if any)
        const { data: def } = await supabase
          .from('checkin_templates_library')
          .select('sections, template_type')
          .eq('is_default', true)
          .eq('template_type', 'checklist')
          .maybeSingle();
        const defSecs = (def as any)?.sections;
        if (Array.isArray(defSecs) && defSecs.length > 0) {
          secs = defSecs as CheckinSection[];
        } else {
          secs = DEFAULT_SECTIONS;
        }
      }
    }
    // Hide sections the admin has toggled off
    secs = secs.filter(s => s.enabled !== false);
    setSections(secs);
    setDraftSections(secs);
    setChecked(initChecked(secs));

    const { data: hist } = await supabase
      .from('contractor_daily_checkins')
      .select('id, checkin_date, sections, additional_notes, created_at')
      .eq('contractor_assignment_id', contractorAssignmentId)
      .order('created_at', { ascending: false })
      .limit(10);
    setRecent(hist || []);
    await loadMessages();

    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [contractorAssignmentId]);

  // Auto-refresh manager messages: poll every 30s and refresh on tab focus,
  // plus realtime subscription so new posts appear without a manual reload.
  useEffect(() => {
    if (!contractorAssignmentId) return;
    const poll = window.setInterval(loadMessages, 30 * 1000);
    const onFocus = () => loadMessages();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const channel = supabase
      .channel(`checkin-msgs-${contractorAssignmentId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'contractor_checkin_messages', filter: `contractor_assignment_id=eq.${contractorAssignmentId}` },
        () => loadMessages()
      )
      .subscribe();
    return () => {
      window.clearInterval(poll);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractorAssignmentId]);

  const toggleItem = (sectionTitle: string, idx: number) => {
    setChecked(prev => {
      const next = { ...prev };
      const s = new Set(next[sectionTitle] || []);
      if (s.has(idx)) s.delete(idx); else s.add(idx);
      next[sectionTitle] = s;
      return next;
    });
  };

  const totalChecked = useMemo(
    () => Object.values(checked).reduce((sum, s) => sum + s.size, 0),
    [checked]
  );

  const handleSubmit = async () => {
    if (totalChecked === 0 && !notes.trim()) {
      toast({ title: 'Nothing to submit', description: 'Tick at least one item or add a note.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const payloadSections = sections.map(sec => ({
        title: sec.title,
        checked: Array.from(checked[sec.title] || []).sort((a, b) => a - b).map(i => sec.items[i]).filter(Boolean),
      }));
      const today = new Date().toISOString().slice(0, 10);

      const { data: inserted, error } = await supabase
        .from('contractor_daily_checkins')
        .insert({
          contractor_assignment_id: contractorAssignmentId,
          checkin_date: today,
          sections: payloadSections as any,
          additional_notes: notes.trim() || null,
        })
        .select('id')
        .single();
      if (error) throw error;

      // Send email
      const { error: fnErr } = await supabase.functions.invoke('send-daily-checkin', {
        body: {
          contractorName,
          jobTitle,
          companyName,
          date: today,
          sections: payloadSections,
          additionalNotes: notes.trim(),
          checkinId: inserted?.id,
        },
      });
      if (fnErr) console.warn('Email send failed:', fnErr);

      toast({ title: 'Check-in submitted', description: 'Your daily report has been sent.' });
      setChecked(initChecked(sections));
      setNotes('');
      onSubmitted?.();
      load();
    } catch (e: any) {
      toast({ title: 'Submission failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveTemplate = async () => {
    const cleaned = draftSections.map(s => ({
      title: s.title.trim() || 'Untitled section',
      items: s.items.map(i => i.trim()).filter(Boolean),
    }));
    setTemplateSaving(true);
    try {
      const { error } = await supabase
        .from('contractor_checkin_templates')
        .upsert({ contractor_assignment_id: contractorAssignmentId, sections: cleaned as any }, { onConflict: 'contractor_assignment_id' });
      if (error) throw error;
      setSections(cleaned);
      setChecked(initChecked(cleaned));
      setEditingTemplate(false);
      toast({ title: 'Template saved' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setTemplateSaving(false);
    }
  };

  const updateDraftItem = (si: number, ii: number, v: string) => {
    setDraftSections(prev => prev.map((s, i) => i === si ? { ...s, items: s.items.map((it, j) => j === ii ? v : it) } : s));
  };
  const removeDraftItem = (si: number, ii: number) => {
    setDraftSections(prev => prev.map((s, i) => i === si ? { ...s, items: s.items.filter((_, j) => j !== ii) } : s));
  };
  const addDraftItem = (si: number) => {
    setDraftSections(prev => prev.map((s, i) => i === si ? { ...s, items: [...s.items, ''] } : s));
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {messages.length > 0 && (
        <Card className="border-primary/40">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Messages from your manager</CardTitle>
              {messages.some(m => !m.read_at) && (
                <span className="text-[10px] font-semibold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                  {messages.filter(m => !m.read_at).length} new
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-md border p-3 ${m.read_at ? 'bg-background' : 'bg-primary/5 border-primary/30'}`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="text-sm font-semibold">{m.subject}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(m.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                  {!m.read_at && (
                    <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => markMessageRead(m.id)}>
                      <CheckCheck className="w-3 h-3 mr-1" /> Mark read
                    </Button>
                  )}
                </div>

                {m.template_type === 'checklist' && Array.isArray(m.sections) ? (
                  m.submitted_at ? (
                    <div className="space-y-2">
                      {m.body_html && <FormattedNotes content={m.body_html} className="mb-2" />}
                      <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Submitted {new Date(m.submitted_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </div>
                      {(m.responses?.sections || []).map((sec: any, i: number) => (
                        <div key={i} className="text-xs">
                          <p className="font-semibold">{sec.title}</p>
                          {sec.checked?.length > 0 && (
                            <ul className="pl-4 list-disc text-muted-foreground">
                              {sec.checked.map((it: string, j: number) => <li key={j}>{it}</li>)}
                            </ul>
                          )}
                          {sec.answers?.length > 0 && (
                            <div className="pl-4 space-y-1 mt-0.5">
                              {sec.answers.map((a: any, j: number) => (
                                <div key={j}>
                                  <p className="text-foreground/80">{a.question}</p>
                                  <p className="pl-2 text-muted-foreground whitespace-pre-wrap">{a.answer}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          {!sec.checked?.length && !sec.answers?.length && (
                            <p className="pl-4 text-muted-foreground italic">No response</p>
                          )}
                        </div>
                      ))}
                      {m.responses?.notes && (
                        <div className="text-xs">
                          <p className="font-semibold">Notes</p>
                          <p className="pl-1 text-muted-foreground whitespace-pre-wrap">{m.responses.notes}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {m.body_html && <FormattedNotes content={m.body_html} />}
                      {(m.sections as CheckinSection[]).map((sec, si) => {
                        const checkedSet = msgChecked[m.id]?.[sec.title] || new Set<number>();
                        return (
                          <div key={si} className="rounded border bg-background p-2.5">
                            <p className="text-xs font-semibold mb-1.5">{sec.title}</p>
                            <div className="space-y-1.5">
                              {sec.items.map((raw, ii) => {
                                const p = parseCheckinItem(raw);
                                if (p.type === 'check') {
                                  return (
                                    <label key={ii} className="flex items-start gap-2 text-xs cursor-pointer">
                                      <Checkbox
                                        checked={checkedSet.has(ii)}
                                        onCheckedChange={() => toggleMsgItem(m.id, sec.title, ii)}
                                        className="mt-0.5"
                                      />
                                      <span>{p.text}</span>
                                    </label>
                                  );
                                }
                                const val = msgAnswers[m.id]?.[sec.title]?.[ii] || '';
                                return (
                                  <div key={ii} className="space-y-1">
                                    <p className="text-xs text-foreground/80">{p.text}</p>
                                    {p.type === 'short' ? (
                                      <Input
                                        value={val}
                                        onChange={(e) => setMsgAnswer(m.id, sec.title, ii, e.target.value)}
                                        className="h-8 text-xs"
                                        placeholder="Your answer"
                                      />
                                    ) : (
                                      <Textarea
                                        value={val}
                                        onChange={(e) => setMsgAnswer(m.id, sec.title, ii, e.target.value)}
                                        rows={3}
                                        className="text-xs"
                                        placeholder="Your answer"
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      <div className="space-y-1">
                        <Label className="text-[11px]">Notes (optional)</Label>
                        <Textarea
                          value={msgNotes[m.id] || ''}
                          onChange={(e) => setMsgNotes(prev => ({ ...prev, [m.id]: e.target.value }))}
                          rows={2}
                          className="text-xs"
                          placeholder="Add any details..."
                        />
                      </div>
                      <div className="flex justify-end">
                        <Button size="sm" onClick={() => submitMsgForm(m)} disabled={msgSubmitting === m.id}>
                          {msgSubmitting === m.id ? (
                            <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Submitting...</>
                          ) : (
                            <>Submit Response</>
                          )}
                        </Button>
                      </div>
                    </div>
                  )
                ) : (
                  <FormattedNotes content={m.body_html || ''} />
                )}

              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Check-in</CardTitle>
            <CardDescription>
              Tick what applies, add any notes, and submit. A summary is emailed to your manager.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setDraftSections(sections); setEditingTemplate(true); }}>
            <Settings2 className="w-3.5 h-3.5 mr-1.5" /> Customize
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {sections.map((sec, secIdx) => {
            const sectionCount = checked[sec.title]?.size || 0;
            const accentMap: Record<string, { bar: string; chip: string }> = {
              emerald: { bar: 'bg-emerald-500', chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' },
              blue:    { bar: 'bg-blue-500',    chip: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20' },
              violet:  { bar: 'bg-violet-500',  chip: 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20' },
              amber:   { bar: 'bg-amber-500',   chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20' },
              rose:    { bar: 'bg-rose-500',    chip: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20' },
              cyan:    { bar: 'bg-cyan-500',    chip: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20' },
              orange:  { bar: 'bg-orange-500',  chip: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20' },
              pink:    { bar: 'bg-pink-500',    chip: 'bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-500/20' },
            };
            const orderFallback = ['emerald','blue','violet','amber'];
            const a = accentMap[sec.color || orderFallback[secIdx % orderFallback.length]] || accentMap.emerald;
            return (
              <section key={sec.title} className="rounded-lg border bg-muted/30 overflow-hidden">
                <header className="flex items-center justify-between gap-3 px-4 py-2.5 bg-muted/60 border-b">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-1 h-5 rounded-full ${a.bar}`} />
                    <h3 className="text-sm font-semibold tracking-tight">{sec.title}</h3>
                  </div>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${a.chip}`}>
                    {sectionCount}/{sec.items.length}
                  </span>
                </header>
                <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {sec.items.map((item, idx) => {
                    const id = `${sec.title}-${idx}`;
                    const isChecked = checked[sec.title]?.has(idx) || false;
                    return (
                      <label
                        key={id}
                        htmlFor={id}
                        className={`flex items-start gap-2.5 rounded-md border px-3 py-2 cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-primary/5 border-primary/40 shadow-sm'
                            : 'bg-background border-border hover:bg-muted/50 hover:border-foreground/20'
                        }`}
                      >
                        <Checkbox id={id} checked={isChecked} onCheckedChange={() => toggleItem(sec.title, idx)} className="mt-0.5" />
                        <span className={`text-sm leading-snug ${isChecked ? 'font-medium text-foreground' : 'text-foreground/80'}`}>{item}</span>
                      </label>
                    );
                  })}
                  {sec.items.length === 0 && (
                    <p className="text-xs text-muted-foreground italic col-span-full px-1 py-2">No items — click Customize to add some.</p>
                  )}
                </div>
              </section>
            );
          })}

          <div className="space-y-2 pt-2 border-t">
            <Label htmlFor="checkin-notes" className="text-sm font-semibold">Additional notes (optional)</Label>
            <Textarea
              id="checkin-notes"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Anything else to share with your manager?"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{totalChecked}</span> item{totalChecked === 1 ? '' : 's'} checked
            </p>
            <Button onClick={handleSubmit} disabled={submitting} size="lg">
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Submit check-in
            </Button>
          </div>
        </CardContent>
      </Card>

      {editingTemplate && (
        <Card className="border-primary/40">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Customize your checklist</CardTitle>
              <CardDescription>Add, rename, or remove items. Saved instantly to your profile.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditingTemplate(false)} disabled={templateSaving}>
                <X className="w-3.5 h-3.5 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={handleSaveTemplate} disabled={templateSaving}>
                {templateSaving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />} Save
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {draftSections.map((sec, si) => (
              <div key={si} className="space-y-2">
                <h4 className="text-sm font-semibold">{sec.title}</h4>
                <div className="space-y-1.5">
                  {sec.items.map((item, ii) => (
                    <div key={ii} className="flex items-center gap-2">
                      <Input value={item} onChange={e => updateDraftItem(si, ii, e.target.value)} className="text-sm h-8" />
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeDraftItem(si, ii)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => addDraftItem(si)}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add item
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent check-ins</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recent.map((r) => {
              const totalItems = ((r.sections as any[]) || []).reduce((s, sec) => s + (sec.checked?.length || 0), 0);
              return (
                <div key={r.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                  <span className="font-medium">{new Date(r.checkin_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  <span className="text-xs text-muted-foreground">{totalItems} item{totalItems === 1 ? '' : 's'}{r.additional_notes ? ' · with notes' : ''}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
