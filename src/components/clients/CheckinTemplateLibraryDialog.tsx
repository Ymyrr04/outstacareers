import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { WysiwygEditor } from '@/components/WysiwygEditor';
import { FormattedNotes } from '@/components/FormattedNotes';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Library, Check, X, GripVertical, ChevronDown, ChevronRight, Pencil, Mail, ListChecks } from 'lucide-react';
import type { CheckinSection } from './ContractorCheckinConfig';

export type TemplateType = 'checklist' | 'email';

export interface CheckinTemplate {
  id: string;
  name: string;
  description: string | null;
  sections: CheckinSection[];
  template_type?: TemplateType;
  subject?: string | null;
  body_html?: string | null;
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

const MERGE_TAGS: { label: string; token: string }[] = [
  { label: 'First name', token: '{{first_name}}' },
  { label: 'Full name', token: '{{full_name}}' },
  { label: 'Last name', token: '{{last_name}}' },
  { label: 'Email', token: '{{email}}' },
  { label: 'Role', token: '{{role}}' },
  { label: 'Client', token: '{{client_name}}' },
  { label: 'Start date', token: '{{start_date}}' },
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
  const [bType, setBType] = useState<TemplateType>('checklist');
  const [bName, setBName] = useState('');
  const [bDesc, setBDesc] = useState('');
  const [bSections, setBSections] = useState<CheckinSection[]>(DEFAULT_NEW_SECTIONS);
  const [bSubject, setBSubject] = useState('');
  const [bBody, setBBody] = useState('');
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyEditorRef = useRef<Editor | null>(null);

  const insertInSubject = (token: string) => {
    const el = subjectRef.current;
    if (!el) { setBSubject(s => s + token); return; }
    const start = el.selectionStart ?? bSubject.length;
    const end = el.selectionEnd ?? bSubject.length;
    const next = bSubject.slice(0, start) + token + bSubject.slice(end);
    setBSubject(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const insertInBody = (token: string) => {
    const ed = bodyEditorRef.current;
    if (ed) {
      ed.chain().focus().insertContent(token).run();
    } else {
      setBBody(b => (b || '') + token);
    }
  };
  const [bSaving, setBSaving] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('checkin_templates_library')
      .select('id, name, description, sections, template_type, subject, body_html, created_at')
      .order('created_at', { ascending: false });
    if (error) toast({ title: 'Failed to load templates', description: error.message, variant: 'destructive' });
    setTemplates(((data || []) as any[]).map(t => ({
      ...t,
      sections: Array.isArray(t.sections) ? t.sections : [],
      template_type: (t.template_type || 'checklist') as TemplateType,
    })));
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
    setBType('checklist');
    setBName(''); setBDesc('');
    setBSections(DEFAULT_NEW_SECTIONS);
    setBSubject(''); setBBody('');
  };

  const startNew = () => { resetBuilder(); setBuilderOpen(true); };
  const startEdit = (t: CheckinTemplate) => {
    setEditingId(t.id);
    setBType((t.template_type || 'checklist') as TemplateType);
    setBName(t.name);
    setBDesc(t.description || '');
    setBSections(t.sections.length ? t.sections.map((s, i) => ({
      title: s.title || 'Untitled', items: s.items || [], color: s.color || COLOR_CHOICES[i % COLOR_CHOICES.length], enabled: s.enabled !== false,
    })) : DEFAULT_NEW_SECTIONS);
    setBSubject(t.subject || '');
    setBBody(t.body_html || '');
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
      template_type: 'checklist',
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

    let payload: any = {
      name: bName.trim(),
      description: bDesc.trim() || null,
      template_type: bType,
    };

    if (bType === 'checklist') {
      const cleaned = bSections.map(s => ({
        title: (s.title || '').trim() || 'Untitled',
        items: (s.items || []).map(i => i.trim()).filter(Boolean),
        color: s.color || 'emerald',
        enabled: s.enabled !== false,
      })).filter(s => s.items.length > 0);
      if (cleaned.length === 0) { toast({ title: 'Add at least one item', variant: 'destructive' }); return; }
      payload.sections = cleaned;
      payload.subject = null;
      payload.body_html = null;
    } else {
      const stripped = bBody.replace(/<[^>]*>/g, '').trim();
      if (!stripped) { toast({ title: 'Email body is empty', variant: 'destructive' }); return; }
      payload.subject = bSubject.trim() || null;
      payload.body_html = bBody;
      payload.sections = [];
    }

    setBSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = editingId
      ? await supabase.from('checkin_templates_library').update(payload).eq('id', editingId)
      : await supabase.from('checkin_templates_library').insert({ ...payload, created_by: user?.id });
    setBSaving(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editingId ? 'Template updated' : 'Template created' });
    setBuilderOpen(false); resetBuilder();
    load();
  };

  // checklist builder helpers
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
          <DialogDescription>Create, save and reuse check-in and email templates across contractors and pipeline stages.</DialogDescription>
        </DialogHeader>

        {saveCurrent && (
          <div className="rounded-md border p-3 bg-muted/30 space-y-2">
            <Label className="text-sm font-medium">Save current setup as a new checklist template</Label>
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
              <Tabs value={bType} onValueChange={(v) => setBType(v as TemplateType)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="checklist" className="text-xs"><ListChecks className="w-3.5 h-3.5 mr-1" /> Checklist form</TabsTrigger>
                  <TabsTrigger value="email" className="text-xs"><Mail className="w-3.5 h-3.5 mr-1" /> Email / Rich text</TabsTrigger>
                </TabsList>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                  <div>
                    <Label className="text-xs">Template name</Label>
                    <Input value={bName} onChange={e => setBName(e.target.value)} placeholder="e.g. Standard Onboarding" />
                  </div>
                  <div>
                    <Label className="text-xs">Description (optional)</Label>
                    <Input value={bDesc} onChange={e => setBDesc(e.target.value)} placeholder="Short description" />
                  </div>
                </div>

                <TabsContent value="checklist" className="space-y-2 mt-3">
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
                </TabsContent>

                <TabsContent value="email" className="space-y-2 mt-3">
                  <div>
                    <Label className="text-xs">Subject (optional)</Label>
                    <Input ref={subjectRef} value={bSubject} onChange={e => setBSubject(e.target.value)} placeholder="Weekly check-in reminder" />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {MERGE_TAGS.map(t => (
                        <Button key={t.token} type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]"
                          onClick={() => insertInSubject(t.token)}>
                          + {t.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs">Body</Label>
                      <div className="flex flex-wrap gap-1">
                        {MERGE_TAGS.map(t => (
                          <Button key={t.token} type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]"
                            onClick={() => insertInBody(t.token)}>
                            + {t.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-md border bg-background">
                      <WysiwygEditor value={bBody} onChange={setBBody} onReady={(ed) => { bodyEditorRef.current = ed; }} placeholder="Write your email template. Format text, add links, headings, lists…" />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Use merge tags like <code className="text-[10px] bg-muted px-1 rounded">{'{{first_name}}'}</code> — they are automatically replaced with the contractor's info when the email is sent.
                    </p>
                  </div>
                </TabsContent>
              </Tabs>

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
              {templates.map(t => {
                const type = (t.template_type || 'checklist') as TemplateType;
                const isEmail = type === 'email';
                const isOpen = previewId === t.id;
                return (
                  <div key={t.id} className="rounded-md border hover:bg-muted/30 transition">
                    <div className="p-3 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${isEmail ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'}`}>
                            {isEmail ? <><Mail className="w-3 h-3" /> Email</> : <><ListChecks className="w-3 h-3" /> Checklist</>}
                          </span>
                          <div className="font-medium text-sm">{t.name}</div>
                        </div>
                        {t.description && <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>}
                        <div className="text-[11px] text-muted-foreground mt-1">
                          {isEmail
                            ? (t.subject ? `Subject: ${t.subject}` : 'No subject set')
                            : `${t.sections.length} section${t.sections.length === 1 ? '' : 's'} · ${t.sections.reduce((a, s) => a + (s.items?.length || 0), 0)} items`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => setPreviewId(isOpen ? null : t.id)}>
                          {isOpen ? 'Hide' : 'Preview'}
                        </Button>
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
                    {isOpen && (
                      <div className="border-t p-3 bg-muted/20 text-sm">
                        {isEmail ? (
                          <FormattedNotes content={t.body_html || '<em>Empty body</em>'} />
                        ) : (
                          <div className="space-y-2">
                            {t.sections.map((s, i) => (
                              <div key={i}>
                                <div className="flex items-center gap-2 font-medium text-xs">
                                  <span className={`w-1.5 h-4 rounded-full ${barClass(s.color)}`} />{s.title}
                                </div>
                                <ul className="list-disc ml-6 text-xs text-muted-foreground">
                                  {(s.items || []).map((it, j) => <li key={j}>{it}</li>)}
                                </ul>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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
