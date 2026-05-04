import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Check, X, Settings2 } from 'lucide-react';

export interface CheckinSection {
  title: string;
  items: string[];
}

const DEFAULT_SECTIONS: CheckinSection[] = [
  {
    title: "Today's accomplishments",
    items: [
      'Client communication completed',
      'Deliverables submitted or finished',
      'Meeting or call attended',
      'Research or planning done',
      'Administrative tasks completed',
      'Internal coordination done',
    ],
  },
  {
    title: 'Plans for tomorrow',
    items: [
      'Follow up with client',
      'Submit or review deliverables',
      'Attend a scheduled meeting',
      'Continue ongoing project tasks',
      'Planning or preparation session',
    ],
  },
  {
    title: 'Weekly goals progress',
    items: [
      'Main project is on track',
      'Client satisfaction maintained',
      'Weekly milestones being hit',
      'Team or cross-functional collaboration is good',
    ],
  },
  {
    title: 'Blockers / struggles',
    items: [
      'Awaiting client feedback or response',
      'Communication delays',
      'Client not answering questions',
      'Low client visibility or engagement',
      'Technical issues or blockers',
      'Unclear scope or instructions',
      'Resource or access issues',
    ],
  },
];

interface Props {
  contractorAssignmentId: string;
  contractorName: string;
  jobTitle?: string | null;
  companyName?: string | null;
}

export const DailyCheckin = ({ contractorAssignmentId, contractorName, jobTitle, companyName }: Props) => {
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

    let secs: CheckinSection[] = DEFAULT_SECTIONS;
    if (tpl?.sections && Array.isArray(tpl.sections) && tpl.sections.length > 0) {
      secs = tpl.sections as unknown as CheckinSection[];
    } else {
      // seed default template
      await supabase.from('contractor_checkin_templates').insert({
        contractor_assignment_id: contractorAssignmentId,
        sections: DEFAULT_SECTIONS as any,
      });
    }
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

    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [contractorAssignmentId]);

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
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Daily Check-in</CardTitle>
            <CardDescription>
              Tick what applies, add any notes, and submit. A summary is emailed to your manager.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setDraftSections(sections); setEditingTemplate(true); }}>
            <Settings2 className="w-3.5 h-3.5 mr-1.5" /> Customize
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {sections.map(sec => (
            <div key={sec.title} className="space-y-2">
              <h3 className="text-sm font-semibold">{sec.title}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {sec.items.map((item, idx) => {
                  const id = `${sec.title}-${idx}`;
                  const isChecked = checked[sec.title]?.has(idx) || false;
                  return (
                    <label
                      key={id}
                      htmlFor={id}
                      className="flex items-start gap-2 rounded-md border bg-background px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox id={id} checked={isChecked} onCheckedChange={() => toggleItem(sec.title, idx)} className="mt-0.5" />
                      <span className="text-sm leading-snug">{item}</span>
                    </label>
                  );
                })}
                {sec.items.length === 0 && (
                  <p className="text-xs text-muted-foreground italic col-span-full">No items — click Customize to add some.</p>
                )}
              </div>
            </div>
          ))}

          <div className="space-y-2">
            <Label htmlFor="checkin-notes">Additional notes (optional)</Label>
            <Textarea
              id="checkin-notes"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Anything else to share with your manager?"
            />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{totalChecked} item{totalChecked === 1 ? '' : 's'} checked</p>
            <Button onClick={handleSubmit} disabled={submitting}>
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
