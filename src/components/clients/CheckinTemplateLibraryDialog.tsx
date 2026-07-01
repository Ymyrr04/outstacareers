import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Library, Check, X, GripVertical, ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import type { CheckinSection } from './ContractorCheckinConfig';

export interface CheckinTemplate {
  id: string;
  name: string;
  description: string | null;
  sections: CheckinSection[];
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** When set, the "Apply" button will call onApply with the chosen template. */
  onApply?: (tpl: CheckinTemplate) => void;
  /** When set, shows a "Save current as template" section allowing user to name it. */
  saveCurrent?: CheckinSection[] | null;
}

const COLOR_CHOICES = ['emerald', 'blue', 'violet', 'amber', 'rose', 'cyan', 'orange', 'pink'];
const barClass = (c?: string) => {
  const m: Record<string, string> = {
    emerald: 'bg-emerald-500', blue: 'bg-blue-500', violet: 'bg-violet-500',
    amber: 'bg-amber-500', rose: 'bg-rose-500', cyan: 'bg-cyan-500',
    orange: 'bg-orange-500', pink: 'bg-pink-500',
  };
  return m[c || 'emerald'] || m.emerald;
};

const DEFAULT_NEW_SECTIONS: CheckinSection[] = [
  { title: "Today's accomplishments", color: 'emerald', enabled: true, items: [''] },
];

export const CheckinTemplateLibraryDialog = ({ open, onOpenChange, onApply, saveCurrent }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<CheckinTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');

  // Builder state
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bName, setBName] = useState('');
  const [bDesc, setBDesc] = useState('');
  const [bSections, setBSections] = useState<CheckinSection[]>(DEFAULT_NEW_SECTIONS);
  const [bSaving, setBSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('checkin_templates_library')
      .select('id, name, description, sections, created_at')
      .order('created_at', { ascending: false });
    if (error) toast({ title: 'Failed to load templates', description: error.message, variant: 'destructive' });
    setTemplates(((data || []) as any[]).map(t => ({ ...t, sections: Array.isArray(t.sections) ? t.sections : [] })));
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      load();
      setSaveName(''); setSaveDesc('');
      setBuilderOpen(false); resetBuilder();
    }
    /* eslint-disable-next-line */
  }, [open]);

  const resetBuilder = () => {
    setEditingId(null);
    setBName(''); setBDesc('');
    setBSections(DEFAULT_NEW_SECTIONS);
  };

  const startNew = () => { resetBuilder(); setBuilderOpen(true); };
  const startEdit = (t: CheckinTemplate) => {
    setEditingId(t.id);
    setBName(t.name);
    setBDesc(t.description || '');
    setBSections(t.sections.length ? t.sections.map((s, i) => ({
      title: s.title || 'Untitled', items: s.items || [], color: s.color || COLOR_CHOICES[i % COLOR_CHOICES.length], enabled: s.enabled !== false,
    })) : DEFAULT_NEW_SECTIONS);
    setBuilderOpen(true);
  };

  const handleSave = async () => {
    if (!saveCurrent || !saveName.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('checkin_templates_library').insert({
      name: saveName.trim(),
      description: saveDesc.trim() || null,
      sections: saveCurrent as any,
      created_by: user?.id,
    });
    setSaving(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Template saved to library' });
    setSaveName(''); setSaveDesc('');
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    const { error } = await supabase.from('checkin_templates_library').delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  const saveBuilder = async () => {
    if (!bName.trim()) { toast({ title: 'Template name required', variant: 'destructive' }); return; }
    const cleaned = bSections.map(s => ({
      title: (s.title || '').trim() || 'Untitled',
      items: (s.items || []).map(i => i.trim()).filter(Boolean),
      color: s.color || 'emerald',
      enabled: s.enabled !== false,
    })).filter(s => s.items.length > 0);
    if (cleaned.length === 0) { toast({ title: 'Add at least one item', variant: 'destructive' }); return; }

    setBSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      name: bName.trim(),
      description: bDesc.trim() || null,
      sections: cleaned as any,
    };
    const { error } = editingId
      ? await supabase.from('checkin_templates_library').update(payload).eq('id', editingId)
      : await supabase.from('checkin_templates_library').insert({ ...payload, created_by: user?.id });
    setBSaving(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editingId ? 'Template updated' : 'Template created' });
    setBuilderOpen(false); resetBuilder();
    load();
  };

  // builder helpers
  const updateItem = (si: number, ii: number, v: string) =>
    setBSections(p => p.map((s, i) => i === si ? { ...s, items: s.items.map((it, j) => j === ii ? v : it) } : s));
  const removeItem = (si: number, ii: number) =>
    setBSections(p => p.map((s, i) => i === si ? { ...s, items: s.items.filter((_, j) => j !== ii) } : s));
  const addItem = (si: number) =>
    setBSections(p => p.map((s, i) => i === si ? { ...s, items: [...s.items, ''] } : s));
  const updateSection = (si: number, patch: Partial<CheckinSection>) =>
    setBSections(p => p.map((s, i) => i === si ? { ...s, ...patch } : s));
  const removeSection = (si: number) =>
    setBSections(p => p.filter((_, i) => i !== si));
  const addSection = () =>
    setBSections(p => [...p, { title: 'New section', items: [''], color: COLOR_CHOICES[p.length % COLOR_CHOICES.length], enabled: true }]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Library className="w-4 h-4" /> Check-in Template Library</DialogTitle>
          <DialogDescription>Create, save and reuse check-in templates across contractors and pipeline stages.</DialogDescription>
        </DialogHeader>

        {saveCurrent && (
          <div className="rounded-md border p-3 bg-muted/30 space-y-2">
            <Label className="text-sm font-medium">Save current setup as a new template</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input placeholder="Template name (e.g. Standard Onboarding)" value={saveName} onChange={e => setSaveName(e.target.value)} />
              <Input placeholder="Short description (optional)" value={saveDesc} onChange={e => setSaveDesc(e.target.value)} />
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSave} disabled={saving || !saveName.trim()}>
                {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                Save to library
              </Button>
            </div>
          </div>
        )}

        {/* Builder */}
        <div className="rounded-md border">
          <button
            type="button"
            onClick={() => { if (!builderOpen) startNew(); else setBuilderOpen(false); }}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/40 rounded-t-md"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              {builderOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              {editingId ? 'Edit template' : 'Create new template'}
            </div>
            {!builderOpen && (
              <span className="text-xs text-muted-foreground flex items-center gap-1"><Plus className="w-3 h-3" /> New</span>
            )}
          </button>

          {builderOpen && (
            <div className="p-3 border-t space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Template name</Label>
                  <Input value={bName} onChange={e => setBName(e.target.value)} placeholder="e.g. Standard Onboarding" />
                </div>
                <div>
                  <Label className="text-xs">Description (optional)</Label>
                  <Input value={bDesc} onChange={e => setBDesc(e.target.value)} placeholder="Short description" />
                </div>
              </div>

              <div className="space-y-2">
                {bSections.map((sec, si) => (
                  <div key={si} className={`rounded-md border bg-background ${sec.enabled === false ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-2 px-2 py-1.5 border-b bg-muted/30 rounded-t-md">
                      <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className={`w-1.5 h-5 rounded-full ${barClass(sec.color)}`} />
                      <Input value={sec.title} onChange={e => updateSection(si, { title: e.target.value })} className="h-8 text-sm font-medium flex-1" />
                      <Select value={sec.color || 'emerald'} onValueChange={v => updateSection(si, { color: v })}>
                        <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {COLOR_CHOICES.map(c => (
                            <SelectItem key={c} value={c}>
                              <span className="flex items-center gap-2"><span className={`w-3 h-3 rounded-full ${barClass(c)}`} />{c}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeSection(si)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="p-2 space-y-1.5">
                      {sec.items.map((item, ii) => (
                        <div key={ii} className="flex items-center gap-2">
                          <Input value={item} onChange={e => updateItem(si, ii, e.target.value)} className="h-8 text-sm" placeholder="Checklist item" />
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

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="ghost" size="sm" onClick={() => { setBuilderOpen(false); resetBuilder(); }}>Cancel</Button>
                <Button type="button" size="sm" onClick={saveBuilder} disabled={bSaving}>
                  {bSaving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                  {editingId ? 'Update template' : 'Create template'}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{templates.length} template{templates.length === 1 ? '' : 's'} saved</p>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin" /></div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6 border rounded-md">No templates yet.</p>
          ) : (
            <div className="space-y-2">
              {templates.map(t => (
                <div key={t.id} className="rounded-md border p-3 hover:bg-muted/30 transition">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{t.name}</div>
                      {t.description && <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>}
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {t.sections.length} section{t.sections.length === 1 ? '' : 's'} · {t.sections.reduce((a, s) => a + (s.items?.length || 0), 0)} items
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {onApply && (
                        <Button size="sm" variant="default" onClick={() => { onApply(t); onOpenChange(false); }}>
                          <Check className="w-3.5 h-3.5 mr-1" /> Apply
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(t)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(t.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}><X className="w-3.5 h-3.5 mr-1" /> Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
