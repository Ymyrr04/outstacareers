import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Library, Check, X } from 'lucide-react';
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

export const CheckinTemplateLibraryDialog = ({ open, onOpenChange, onApply, saveCurrent }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<CheckinTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');

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

  useEffect(() => { if (open) { load(); setSaveName(''); setSaveDesc(''); } /* eslint-disable-next-line */ }, [open]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Library className="w-4 h-4" /> Check-in Template Library</DialogTitle>
          <DialogDescription>Save reusable check-in templates and apply them to any contractor or pipeline stage.</DialogDescription>
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
