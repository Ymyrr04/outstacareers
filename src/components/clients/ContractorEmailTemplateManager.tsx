import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Loader2, ArrowUp, ArrowDown, Star, FileText, Save, X } from 'lucide-react';
import { RichTextToolbar } from '@/components/RichTextToolbar';
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

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  is_default: boolean;
  template_order: number;
}

interface ContractorEmailTemplateManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ContractorEmailTemplateManager = ({ open, onOpenChange }: ContractorEmailTemplateManagerProps) => {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EmailTemplate | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const lastFocusedRef = useRef<'subject' | 'body'>('body');

  // Form state
  const [formName, setFormName] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formBodyHtml, setFormBodyHtml] = useState('');
  const [formIsDefault, setFormIsDefault] = useState(false);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('contractor_email_templates')
        .select('*')
        .order('template_order');
      if (error) throw error;
      setTemplates((data || []) as EmailTemplate[]);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchTemplates();
  }, [open]);

  const resetForm = () => {
    setFormName('');
    setFormSubject('');
    setFormBodyHtml('');
    setFormIsDefault(false);
    setEditingTemplate(null);
    setIsCreating(false);
  };

  const startCreate = () => {
    resetForm();
    setIsCreating(true);
  };

  const startEdit = (tpl: EmailTemplate) => {
    setFormName(tpl.name);
    setFormSubject(tpl.subject);
    setFormBodyHtml(tpl.body_html);
    setFormIsDefault(tpl.is_default);
    setEditingTemplate(tpl);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formSubject.trim()) {
      toast({ title: 'Missing fields', description: 'Name and subject are required', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      // If setting as default, unset others first
      if (formIsDefault) {
        await supabase
          .from('contractor_email_templates')
          .update({ is_default: false })
          .eq('is_default', true);
      }

      if (editingTemplate) {
        const { error } = await supabase
          .from('contractor_email_templates')
          .update({
            name: formName.trim(),
            subject: formSubject.trim(),
            body_html: formBodyHtml,
            is_default: formIsDefault,
          })
          .eq('id', editingTemplate.id);
        if (error) throw error;
        toast({ title: 'Template updated' });
      } else {
        const maxOrder = templates.length > 0 ? Math.max(...templates.map(t => t.template_order)) : 0;
        const { error } = await supabase
          .from('contractor_email_templates')
          .insert({
            name: formName.trim(),
            subject: formSubject.trim(),
            body_html: formBodyHtml,
            is_default: formIsDefault,
            template_order: maxOrder + 1,
          });
        if (error) throw error;
        toast({ title: 'Template created' });
      }

      resetForm();
      fetchTemplates();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase
        .from('contractor_email_templates')
        .delete()
        .eq('id', deleteTarget.id);
      if (error) throw error;
      toast({ title: 'Template deleted' });
      if (editingTemplate?.id === deleteTarget.id) resetForm();
      setDeleteTarget(null);
      fetchTemplates();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleReorder = async (tpl: EmailTemplate, direction: 'up' | 'down') => {
    const idx = templates.findIndex(t => t.id === tpl.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= templates.length) return;

    const other = templates[swapIdx];
    try {
      await Promise.all([
        supabase.from('contractor_email_templates').update({ template_order: other.template_order }).eq('id', tpl.id),
        supabase.from('contractor_email_templates').update({ template_order: tpl.template_order }).eq('id', other.id),
      ]);
      fetchTemplates();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleSetDefault = async (tpl: EmailTemplate) => {
    try {
      await supabase.from('contractor_email_templates').update({ is_default: false }).eq('is_default', true);
      await supabase.from('contractor_email_templates').update({ is_default: true }).eq('id', tpl.id);
      toast({ title: 'Default updated', description: `"${tpl.name}" is now the default template` });
      fetchTemplates();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const isEditing = isCreating || editingTemplate !== null;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Contractor Email Templates
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Template list */}
            {!isEditing && (
              <>
                <div className="flex justify-end">
                  <Button onClick={startCreate} size="sm">
                    <Plus className="w-4 h-4 mr-1" />
                    New Template
                  </Button>
                </div>

                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : templates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No templates yet. Create one to get started.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {templates.map((tpl, idx) => (
                      <div
                        key={tpl.id}
                        className="flex items-center gap-3 p-3 border rounded-lg bg-background hover:bg-muted/30 transition-colors"
                      >
                        {/* Reorder buttons */}
                        <div className="flex flex-col gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            disabled={idx === 0}
                            onClick={() => handleReorder(tpl, 'up')}
                          >
                            <ArrowUp className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            disabled={idx === templates.length - 1}
                            onClick={() => handleReorder(tpl, 'down')}
                          >
                            <ArrowDown className="w-3 h-3" />
                          </Button>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{tpl.name}</p>
                            {tpl.is_default && (
                              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                                <Star className="w-2.5 h-2.5" />
                                Default
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{tpl.subject}</p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          {!tpl.is_default && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleSetDefault(tpl)}
                            >
                              <Star className="w-3 h-3 mr-1" />
                              Set Default
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(tpl)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(tpl)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Edit / Create form */}
            {isEditing && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    {editingTemplate ? `Edit: ${editingTemplate.name}` : 'New Template'}
                  </h3>
                  <Button variant="ghost" size="sm" onClick={resetForm}>
                    <X className="w-4 h-4 mr-1" />
                    Back to list
                  </Button>
                </div>

                <div>
                  <Label>Template Name</Label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Friday Reminder"
                  />
                </div>

                <div>
                  <Label>Subject Line</Label>
                  <Input
                    ref={subjectRef}
                    value={formSubject}
                    onChange={(e) => setFormSubject(e.target.value)}
                    placeholder="Email subject..."
                    onFocus={() => { lastFocusedRef.current = 'subject'; }}
                  />
                </div>

                <div>
                  <Label>Body (HTML)</Label>
                  <RichTextToolbar
                    value={formBodyHtml}
                    onChange={setFormBodyHtml}
                    textareaRef={textareaRef as React.RefObject<HTMLTextAreaElement>}
                    placeholders={['{{first_name}}', '{{full_name}}', '{{company}}', '{{job_title}}', '{{schedule}}']}
                    onInsertPlaceholder={(p) => {
                      if (lastFocusedRef.current === 'subject') {
                        const el = subjectRef.current;
                        if (!el) return;
                        const start = el.selectionStart ?? formSubject.length;
                        const end = el.selectionEnd ?? formSubject.length;
                        const newVal = formSubject.substring(0, start) + p + formSubject.substring(end);
                        setFormSubject(newVal);
                        setTimeout(() => {
                          el.focus();
                          const pos = start + p.length;
                          el.setSelectionRange(pos, pos);
                        }, 0);
                      } else {
                        const ta = textareaRef.current;
                        const start = ta?.selectionStart ?? formBodyHtml.length;
                        const end = ta?.selectionEnd ?? formBodyHtml.length;
                        const newVal = formBodyHtml.substring(0, start) + p + formBodyHtml.substring(end);
                        setFormBodyHtml(newVal);
                        setTimeout(() => {
                          ta?.focus();
                          const pos = start + p.length;
                          ta?.setSelectionRange(pos, pos);
                        }, 0);
                      }
                    }}
                  />
                  <textarea
                    ref={textareaRef}
                    value={formBodyHtml}
                    onChange={(e) => setFormBodyHtml(e.target.value)}
                    onFocus={() => { lastFocusedRef.current = 'body'; }}
                    className="w-full min-h-[200px] p-3 border rounded-md bg-background text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Write your email template here... HTML is supported. Use {{first_name}}, {{full_name}}, {{company}}, {{job_title}} as placeholders."
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Switch
                    id="tpl-default"
                    checked={formIsDefault}
                    onCheckedChange={setFormIsDefault}
                  />
                  <Label htmlFor="tpl-default" className="cursor-pointer">
                    Set as default template
                  </Label>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={resetForm} disabled={saving}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" />{editingTemplate ? 'Update' : 'Create'} Template</>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
