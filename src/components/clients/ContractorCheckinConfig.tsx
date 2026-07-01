import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, GripVertical, ChevronDown, ChevronRight, Bell, Library, Save } from 'lucide-react';
import { CheckinTemplateLibraryDialog } from './CheckinTemplateLibraryDialog';

export interface CheckinSection {
  title: string;
  items: string[];
  color?: string;
  enabled?: boolean;
}

const DEFAULT_SECTIONS: CheckinSection[] = [
  { title: "Today's accomplishments", color: 'emerald', enabled: true, items: [
    'Client communication completed','Deliverables submitted or finished','Meeting or call attended','Research or planning done','Administrative tasks completed','Internal coordination done',
  ]},
  { title: 'Plans for tomorrow', color: 'blue', enabled: true, items: [
    'Follow up with client','Submit or review deliverables','Attend a scheduled meeting','Continue ongoing project tasks','Planning or preparation session',
  ]},
  { title: 'Weekly goals progress', color: 'violet', enabled: true, items: [
    'Main project is on track','Client satisfaction maintained','Weekly milestones being hit','Team or cross-functional collaboration is good',
  ]},
  { title: 'Blockers / struggles', color: 'amber', enabled: true, items: [
    'Awaiting client feedback or response','Communication delays','Client not answering questions','Low client visibility or engagement','Technical issues or blockers','Unclear scope or instructions','Resource or access issues',
  ]},
];

const COLOR_CHOICES = ['emerald', 'blue', 'violet', 'amber', 'rose', 'cyan', 'orange', 'pink'];
const barClass = (c?: string) => {
  const m: Record<string, string> = {
    emerald: 'bg-emerald-500', blue: 'bg-blue-500', violet: 'bg-violet-500',
    amber: 'bg-amber-500', rose: 'bg-rose-500', cyan: 'bg-cyan-500',
    orange: 'bg-orange-500', pink: 'bg-pink-500',
  };
  return m[c || 'emerald'] || m.emerald;
};

// 12h time slots — matches contractor portal convention
const TIME_SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) for (const m of [0, 30]) {
    const period = h < 12 ? 'AM' : 'PM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    out.push(`${hour12}:${m.toString().padStart(2, '0')} ${period}`);
  }
  return out;
})();
const to24h = (s: string): string => {
  const m = s.trim().toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (!m) return '';
  let h = parseInt(m[1], 10); const mm = parseInt(m[2], 10);
  if (m[3] === 'PM' && h < 12) h += 12;
  if (m[3] === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
};
const to12h = (s?: string | null): string => {
  if (!s) return '';
  const m = s.match(/^(\d{2}):(\d{2})/);
  if (!m) return '';
  let h = parseInt(m[1], 10); const mm = parseInt(m[2], 10);
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12 === 0 ? 12 : h % 12;
  return `${h}:${String(mm).padStart(2, '0')} ${period}`;
};

interface Props {
  contractorAssignmentId: string;
  timezone?: string | null;
}

export const ContractorCheckinConfig = ({ contractorAssignmentId, timezone }: Props) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sections, setSections] = useState<CheckinSection[]>(DEFAULT_SECTIONS);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState<string>('5:00 PM');
  const [dragItem, setDragItem] = useState<{ s: number; i: number } | null>(null);
  const [dragSection, setDragSection] = useState<number | null>(null);
  const [libOpen, setLibOpen] = useState(false);
  const [saveLibOpen, setSaveLibOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: tpl }, { data: asn }] = await Promise.all([
        supabase.from('contractor_checkin_templates').select('sections').eq('contractor_assignment_id', contractorAssignmentId).maybeSingle(),
        supabase.from('contractor_assignments').select('checkin_reminder_enabled, checkin_reminder_time').eq('id', contractorAssignmentId).maybeSingle(),
      ]);
      let secs: CheckinSection[] = DEFAULT_SECTIONS;
      if (tpl?.sections && Array.isArray(tpl.sections) && (tpl.sections as any[]).length > 0) {
        secs = (tpl.sections as any[]).map((s: any, i: number) => ({
          title: s.title || 'Untitled',
          items: Array.isArray(s.items) ? s.items : [],
          color: s.color || COLOR_CHOICES[i % COLOR_CHOICES.length],
          enabled: s.enabled !== false,
        }));
      }
      setSections(secs);
      setReminderEnabled(Boolean((asn as any)?.checkin_reminder_enabled));
      const t12 = to12h((asn as any)?.checkin_reminder_time);
      setReminderTime(t12 || '5:00 PM');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, contractorAssignmentId]);

  const save = async () => {
    setSaving(true);
    try {
      const cleaned = sections.map(s => ({
        title: (s.title || '').trim() || 'Untitled',
        items: (s.items || []).map(i => i.trim()).filter(Boolean),
        color: s.color || 'emerald',
        enabled: s.enabled !== false,
      }));
      const [{ error: tplErr }, { error: asnErr }] = await Promise.all([
        supabase.from('contractor_checkin_templates').upsert(
          { contractor_assignment_id: contractorAssignmentId, sections: cleaned as any },
          { onConflict: 'contractor_assignment_id' }
        ),
        supabase.from('contractor_assignments').update({
          checkin_reminder_enabled: reminderEnabled,
          checkin_reminder_time: reminderEnabled ? to24h(reminderTime) : null,
        }).eq('id', contractorAssignmentId),
      ]);
      if (tplErr) throw tplErr;
      if (asnErr) throw asnErr;
      toast({ title: 'Check-in settings saved' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const updateItem = (si: number, ii: number, v: string) =>
    setSections(p => p.map((s, i) => i === si ? { ...s, items: s.items.map((it, j) => j === ii ? v : it) } : s));
  const removeItem = (si: number, ii: number) =>
    setSections(p => p.map((s, i) => i === si ? { ...s, items: s.items.filter((_, j) => j !== ii) } : s));
  const addItem = (si: number) =>
    setSections(p => p.map((s, i) => i === si ? { ...s, items: [...s.items, ''] } : s));
  const updateSection = (si: number, patch: Partial<CheckinSection>) =>
    setSections(p => p.map((s, i) => i === si ? { ...s, ...patch } : s));
  const removeSection = (si: number) =>
    setSections(p => p.filter((_, i) => i !== si));
  const addSection = () =>
    setSections(p => [...p, { title: 'New section', items: [], color: COLOR_CHOICES[p.length % COLOR_CHOICES.length], enabled: true }]);

  const onItemDrop = (si: number, ii: number) => {
    if (!dragItem) return;
    if (dragItem.s !== si) return; // same-section reordering only
    setSections(p => p.map((s, i) => {
      if (i !== si) return s;
      const items = [...s.items];
      const [moved] = items.splice(dragItem.i, 1);
      items.splice(ii, 0, moved);
      return { ...s, items };
    }));
    setDragItem(null);
  };

  const onSectionDrop = (target: number) => {
    if (dragSection === null || dragSection === target) return;
    setSections(p => {
      const arr = [...p];
      const [moved] = arr.splice(dragSection, 1);
      arr.splice(target, 0, moved);
      return arr;
    });
    setDragSection(null);
  };

  return (
    <div className="rounded-lg border bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 rounded-t-lg"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span className="font-medium text-sm">Check-in Template & Reminder</span>
        </div>
        <span className="text-xs text-muted-foreground">Per-contractor</span>
      </button>

      {open && (
        <div className="p-4 space-y-5 border-t">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin" /></div>
          ) : (
            <>
              {/* Reminder */}
              <div className="rounded-md border bg-background p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-primary" />
                    <Label className="text-sm">Check-in reminder notification</Label>
                  </div>
                  <Switch checked={reminderEnabled} onCheckedChange={setReminderEnabled} />
                </div>
                {reminderEnabled && (
                  <div className="grid grid-cols-2 gap-3 items-center">
                    <Label className="text-xs text-muted-foreground">Remind at</Label>
                    <Select value={reminderTime} onValueChange={setReminderTime}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        {TIME_SLOTS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="col-span-2 text-[11px] text-muted-foreground">
                      Sent daily at this time in the contractor's timezone{timezone ? ` (${timezone})` : ''}.
                    </p>
                  </div>
                )}
              </div>

              {/* Template library actions */}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setLibOpen(true)}>
                  <Library className="w-3.5 h-3.5 mr-1" /> Load from library
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setSaveLibOpen(true)} disabled={sections.length === 0}>
                  <Save className="w-3.5 h-3.5 mr-1" /> Save as template
                </Button>
              </div>

              {/* Sections */}
              <div className="space-y-3">

                {sections.map((sec, si) => (
                  <div
                    key={si}
                    draggable
                    onDragStart={() => setDragSection(si)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onSectionDrop(si)}
                    className={`rounded-md border bg-background ${sec.enabled === false ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 rounded-t-md">
                      <GripVertical className="w-3.5 h-3.5 text-muted-foreground cursor-grab" />
                      <span className={`w-1.5 h-5 rounded-full ${barClass(sec.color)}`} />
                      <Input
                        value={sec.title}
                        onChange={e => updateSection(si, { title: e.target.value })}
                        className="h-8 text-sm font-medium flex-1"
                      />
                      <Select value={sec.color || 'emerald'} onValueChange={v => updateSection(si, { color: v })}>
                        <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {COLOR_CHOICES.map(c => (
                            <SelectItem key={c} value={c}>
                              <span className="flex items-center gap-2">
                                <span className={`w-3 h-3 rounded-full ${barClass(c)}`} />{c}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Switch checked={sec.enabled !== false} onCheckedChange={v => updateSection(si, { enabled: v })} />
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeSection(si)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="p-3 space-y-1.5">
                      {sec.items.map((item, ii) => (
                        <div
                          key={ii}
                          draggable
                          onDragStart={() => setDragItem({ s: si, i: ii })}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => onItemDrop(si, ii)}
                          className="flex items-center gap-2"
                        >
                          <GripVertical className="w-3.5 h-3.5 text-muted-foreground cursor-grab" />
                          <Input value={item} onChange={e => updateItem(si, ii, e.target.value)} className="h-8 text-sm" />
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeItem(si, ii)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={() => addItem(si)}>
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add item
                      </Button>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addSection}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add section
                </Button>
              </div>

              <div className="flex justify-end pt-2 border-t">
                <Button type="button" onClick={save} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save check-in settings
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <CheckinTemplateLibraryDialog
        open={libOpen}
        onOpenChange={setLibOpen}
        onApply={(tpl) => {
          if ((tpl.template_type || 'checklist') !== 'checklist') {
            toast({ title: 'Email templates cannot be applied to a check-in form', description: 'Pick a checklist template.', variant: 'destructive' });
            return;
          }
          setSections(tpl.sections.map((s, i) => ({
            title: s.title, items: s.items || [], color: s.color || COLOR_CHOICES[i % COLOR_CHOICES.length], enabled: s.enabled !== false,
          })));
        }}
      />
      <CheckinTemplateLibraryDialog
        open={saveLibOpen}
        onOpenChange={setSaveLibOpen}
        saveCurrent={sections}
      />
    </div>
  );
};

