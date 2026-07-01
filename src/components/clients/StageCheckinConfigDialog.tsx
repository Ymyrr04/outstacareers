import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, GripVertical, Library, Save } from 'lucide-react';
import type { CheckinSection } from './ContractorCheckinConfig';
import { CheckinTemplateLibraryDialog } from './CheckinTemplateLibraryDialog';

const COLORS = ['emerald', 'blue', 'violet', 'amber', 'rose', 'cyan', 'orange', 'pink'];
const barClass = (c?: string) => ({
  emerald: 'bg-emerald-500', blue: 'bg-blue-500', violet: 'bg-violet-500',
  amber: 'bg-amber-500', rose: 'bg-rose-500', cyan: 'bg-cyan-500',
  orange: 'bg-orange-500', pink: 'bg-pink-500',
} as Record<string, string>)[c || 'emerald'] || 'bg-emerald-500';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  stageId: string | null;
  stageName?: string;
  onSaved?: () => void;
}

export const StageCheckinConfigDialog = ({ open, onOpenChange, stageId, stageName, onSaved }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sections, setSections] = useState<CheckinSection[]>([]);
  const [libOpen, setLibOpen] = useState(false);
  const [saveLibOpen, setSaveLibOpen] = useState(false);

  useEffect(() => {
    if (!open || !stageId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('contractor_pipeline_stages')
        .select('checkin_sections')
        .eq('id', stageId)
        .maybeSingle();
      const secs = ((data as any)?.checkin_sections as CheckinSection[]) || [];
      setSections(Array.isArray(secs) ? secs : []);
      setLoading(false);
    })();
  }, [open, stageId]);

  const save = async () => {
    if (!stageId) return;
    setSaving(true);
    const cleaned = sections.map((s, i) => ({
      title: (s.title || '').trim() || 'Untitled',
      items: (s.items || []).map(x => x.trim()).filter(Boolean),
      color: s.color || COLORS[i % COLORS.length],
      enabled: s.enabled !== false,
    }));
    const { error } = await supabase
      .from('contractor_pipeline_stages')
      .update({ checkin_sections: cleaned as any })
      .eq('id', stageId);
    setSaving(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Stage check-in template saved' });
    onSaved?.();
    onOpenChange(false);
  };

  const upd = (si: number, patch: Partial<CheckinSection>) =>
    setSections(p => p.map((s, i) => i === si ? { ...s, ...patch } : s));
  const updItem = (si: number, ii: number, v: string) =>
    setSections(p => p.map((s, i) => i === si ? { ...s, items: s.items.map((it, j) => j === ii ? v : it) } : s));
  const rmItem = (si: number, ii: number) =>
    setSections(p => p.map((s, i) => i === si ? { ...s, items: s.items.filter((_, j) => j !== ii) } : s));
  const addItem = (si: number) =>
    setSections(p => p.map((s, i) => i === si ? { ...s, items: [...s.items, ''] } : s));
  const addSection = () =>
    setSections(p => [...p, { title: 'New section', items: [], color: COLORS[p.length % COLORS.length], enabled: true }]);
  const rmSection = (si: number) => setSections(p => p.filter((_, i) => i !== si));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Stage check-in template{stageName ? ` — ${stageName}` : ''}</DialogTitle>
            <DialogDescription>
              Default check-in template for contractors in this stage. Used when a contractor has no personal template.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setLibOpen(true)}>
              <Library className="w-3.5 h-3.5 mr-1" /> Load from library
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSaveLibOpen(true)} disabled={sections.length === 0}>
              <Save className="w-3.5 h-3.5 mr-1" /> Save as template
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin" /></div>
          ) : (
            <div className="space-y-3">
              {sections.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6 border rounded-md">
                  No template set. Add a section or load one from the library.
                </p>
              )}
              {sections.map((sec, si) => (
                <div key={si} className={`rounded-md border bg-background ${sec.enabled === false ? 'opacity-60' : ''}`}>
                  <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 rounded-t-md">
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className={`w-1.5 h-5 rounded-full ${barClass(sec.color)}`} />
                    <Input value={sec.title} onChange={e => upd(si, { title: e.target.value })} className="h-8 text-sm font-medium flex-1" />
                    <Select value={sec.color || 'emerald'} onValueChange={v => upd(si, { color: v })}>
                      <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COLORS.map(c => (
                          <SelectItem key={c} value={c}>
                            <span className="flex items-center gap-2"><span className={`w-3 h-3 rounded-full ${barClass(c)}`} />{c}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Switch checked={sec.enabled !== false} onCheckedChange={v => upd(si, { enabled: v })} />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => rmSection(si)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="p-3 space-y-1.5">
                    {sec.items.map((item, ii) => (
                      <div key={ii} className="flex items-center gap-2">
                        <Input value={item} onChange={e => updItem(si, ii, e.target.value)} className="h-8 text-sm" />
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => rmItem(si, ii)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => addItem(si)}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add item
                    </Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addSection}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add section
              </Button>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save stage template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CheckinTemplateLibraryDialog
        open={libOpen}
        onOpenChange={setLibOpen}
        onApply={(tpl) => setSections(tpl.sections)}
      />
      <CheckinTemplateLibraryDialog
        open={saveLibOpen}
        onOpenChange={setSaveLibOpen}
        saveCurrent={sections}
      />
    </>
  );
};
