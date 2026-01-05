import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useEmailTemplates, triggerToStatus, EmailTemplate } from '@/hooks/useEmailTemplates';
import { Mail, Save, Loader2, Clock, ToggleLeft, Eye, AlertTriangle } from 'lucide-react';

interface EmailTemplateEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmailTemplateEditor({ open, onOpenChange }: EmailTemplateEditorProps) {
  const { templates, loading, updateTemplate } = useEmailTemplates();
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [editForm, setEditForm] = useState({
    subject: '',
    body_html: '',
    is_enabled: true,
    delay_hours: 0,
  });
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const handleSelectTemplate = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    setEditForm({
      subject: template.subject,
      body_html: template.body_html,
      is_enabled: template.is_enabled,
      delay_hours: template.delay_hours,
    });
    setPreviewMode(false);
  };

  const handleSave = async () => {
    if (!selectedTemplate) return;
    
    setSaving(true);
    const success = await updateTemplate(selectedTemplate.id, editForm);
    if (success) {
      setSelectedTemplate({ ...selectedTemplate, ...editForm });
    }
    setSaving(false);
  };

  const getPreviewHtml = () => {
    // Replace placeholders with sample data
    return editForm.body_html
      .replace(/\{\{applicant_name\}\}/g, 'John Doe')
      .replace(/\{\{job_title\}\}/g, 'Software Engineer')
      .replace(/\{\{interview_date\}\}/g, 'Monday, January 15, 2025')
      .replace(/\{\{interview_time\}\}/g, '10:00 AM')
      .replace(/\{\{timezone\}\}/g, 'PST')
      .replace(/\{\{meeting_link\}\}/g, 'https://zoom.us/j/123456789');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Template Editor
          </DialogTitle>
          <DialogDescription>
            Edit and manage automated email templates for each pipeline stage
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Template List Sidebar */}
          <div className="w-72 border-r bg-muted/30">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-2">
                <p className="text-sm font-medium text-muted-foreground mb-3">Pipeline Stages</p>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  templates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => handleSelectTemplate(template)}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${
                        selectedTemplate?.id === template.id
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">
                          {triggerToStatus[template.status_trigger] || template.status_trigger}
                        </span>
                        {template.is_enabled ? (
                          <Badge variant="secondary" className="text-xs">ON</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs opacity-50">OFF</Badge>
                        )}
                      </div>
                      {template.delay_hours > 0 && (
                        <div className="flex items-center gap-1 mt-1 text-xs opacity-70">
                          <Clock className="h-3 w-3" />
                          {template.delay_hours}h delay
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Editor Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedTemplate ? (
              <>
                <div className="flex-1 overflow-auto p-6 space-y-6">
                  {/* Settings Row */}
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="enabled"
                          checked={editForm.is_enabled}
                          onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, is_enabled: checked }))}
                        />
                        <Label htmlFor="enabled" className="text-sm">
                          {editForm.is_enabled ? 'Enabled' : 'Disabled'}
                        </Label>
                      </div>

                      {selectedTemplate.status_trigger === 'reject' && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <Label htmlFor="delay" className="text-sm">Delay (hours):</Label>
                          <Input
                            id="delay"
                            type="number"
                            min="0"
                            max="168"
                            value={editForm.delay_hours}
                            onChange={(e) => setEditForm(prev => ({ ...prev, delay_hours: parseInt(e.target.value) || 0 }))}
                            className="w-20 h-8"
                          />
                        </div>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPreviewMode(!previewMode)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      {previewMode ? 'Edit' : 'Preview'}
                    </Button>
                  </div>

                  {selectedTemplate.status_trigger === 'reject' && editForm.delay_hours > 0 && (
                    <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-amber-800 dark:text-amber-200">Delayed Sending</p>
                        <p className="text-amber-700 dark:text-amber-300">
                          Rejection emails will be held for {editForm.delay_hours} hour(s) before sending. 
                          Admins can cancel during this period.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Subject */}
                  <div className="space-y-2">
                    <Label>Subject Line</Label>
                    <Input
                      value={editForm.subject}
                      onChange={(e) => setEditForm(prev => ({ ...prev, subject: e.target.value }))}
                      placeholder="Email subject..."
                      disabled={previewMode}
                    />
                    <p className="text-xs text-muted-foreground">
                      Use placeholders: {'{{applicant_name}}'}, {'{{job_title}}'}
                    </p>
                  </div>

                  {/* Body */}
                  <div className="space-y-2 flex-1">
                    <Label>Email Body (HTML)</Label>
                    {previewMode ? (
                      <Card>
                        <CardContent className="p-4">
                          <div 
                            className="prose prose-sm max-w-none dark:prose-invert"
                            dangerouslySetInnerHTML={{ __html: getPreviewHtml() }}
                          />
                        </CardContent>
                      </Card>
                    ) : (
                      <>
                        <Textarea
                          value={editForm.body_html}
                          onChange={(e) => setEditForm(prev => ({ ...prev, body_html: e.target.value }))}
                          placeholder="<p>Email content...</p>"
                          className="min-h-[300px] font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                          Available placeholders: {'{{applicant_name}}'}, {'{{job_title}}'}, {'{{interview_date}}'}, {'{{interview_time}}'}, {'{{timezone}}'}, {'{{meeting_link}}'}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="border-t px-6 py-4 flex justify-end gap-3">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save Template
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Select a template to edit</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
