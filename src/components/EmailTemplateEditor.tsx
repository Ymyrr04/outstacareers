import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEmailTemplates, triggerToStatus, EmailTemplate } from '@/hooks/useEmailTemplates';
import { Mail, Save, Loader2, Clock, Eye, AlertTriangle, Link2 } from 'lucide-react';

interface EmailTemplateEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Convert HTML to plain text
const htmlToPlainText = (html: string): string => {
  // Replace <br> and </p> with newlines
  let text = html.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  // Extract href from links and format as [text](url)
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)');
  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  // Trim extra whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
};

// Convert plain text to simple HTML for email
const plainTextToHtml = (text: string): string => {
  // Escape HTML entities
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Convert URLs to clickable links
  html = html.replace(
    /\b(https?:\/\/[^\s<>]+)/gi,
    '<a href="$1" style="color: #0066cc;">$1</a>'
  );
  
  // Convert newlines to <br>
  html = html.replace(/\n/g, '<br>');
  
  return html;
};

export function EmailTemplateEditor({ open, onOpenChange }: EmailTemplateEditorProps) {
  const { templates, loading, updateTemplate } = useEmailTemplates();
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [editForm, setEditForm] = useState({
    subject: '',
    body_text: '',
    is_enabled: true,
    delay_hours: 0,
  });
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const handleSelectTemplate = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    setEditForm({
      subject: template.subject,
      body_text: htmlToPlainText(template.body_html),
      is_enabled: template.is_enabled,
      delay_hours: template.delay_hours,
    });
    setPreviewMode(false);
  };

  const handleSave = async () => {
    if (!selectedTemplate) return;
    
    setSaving(true);
    const success = await updateTemplate(selectedTemplate.id, {
      subject: editForm.subject,
      body_html: plainTextToHtml(editForm.body_text),
      is_enabled: editForm.is_enabled,
      delay_hours: editForm.delay_hours,
    });
    if (success) {
      setSelectedTemplate({ 
        ...selectedTemplate, 
        subject: editForm.subject,
        body_html: plainTextToHtml(editForm.body_text),
        is_enabled: editForm.is_enabled,
        delay_hours: editForm.delay_hours,
      });
    }
    setSaving(false);
  };

  const getPreviewText = () => {
    return editForm.body_text
      .replace(/\{\{applicant_name\}\}/g, 'John Doe')
      .replace(/\{\{job_title\}\}/g, 'Software Engineer')
      .replace(/\{\{interview_date\}\}/g, 'Monday, January 15, 2025')
      .replace(/\{\{interview_time\}\}/g, '10:00 AM')
      .replace(/\{\{timezone\}\}/g, 'PST')
      .replace(/\{\{meeting_link\}\}/g, 'https://zoom.us/j/123456789');
  };

  const placeholders = [
    { key: '{{applicant_name}}', desc: 'Candidate name' },
    { key: '{{job_title}}', desc: 'Position title' },
    { key: '{{interview_date}}', desc: 'Interview date' },
    { key: '{{interview_time}}', desc: 'Interview time' },
    { key: '{{timezone}}', desc: 'Timezone' },
    { key: '{{meeting_link}}', desc: 'Meeting URL' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Templates
          </DialogTitle>
          <DialogDescription>
            Manage automated emails for each pipeline stage. Use plain text with links.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Template List */}
          <div className="w-56 border-r bg-muted/20">
            <ScrollArea className="h-full">
              <div className="p-3 space-y-1">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  templates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => handleSelectTemplate(template)}
                      className={`w-full text-left px-3 py-2.5 rounded-md transition-colors text-sm ${
                        selectedTemplate?.id === template.id
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">
                          {triggerToStatus[template.status_trigger] || template.status_trigger}
                        </span>
                        {!template.is_enabled && (
                          <Badge variant="outline" className="text-[10px] px-1.5 opacity-60">OFF</Badge>
                        )}
                      </div>
                      {template.delay_hours > 0 && (
                        <div className="flex items-center gap-1 mt-0.5 text-xs opacity-70">
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

          {/* Editor */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedTemplate ? (
              <>
                <div className="flex-1 overflow-auto p-5 space-y-4">
                  {/* Controls */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="enabled"
                          checked={editForm.is_enabled}
                          onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, is_enabled: checked }))}
                        />
                        <Label htmlFor="enabled" className="text-sm cursor-pointer">
                          {editForm.is_enabled ? 'Enabled' : 'Disabled'}
                        </Label>
                      </div>

                      {selectedTemplate.status_trigger === 'reject' && (
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Delay:</span>
                          <Input
                            type="number"
                            min="0"
                            max="168"
                            value={editForm.delay_hours}
                            onChange={(e) => setEditForm(prev => ({ ...prev, delay_hours: parseInt(e.target.value) || 0 }))}
                            className="w-16 h-8"
                          />
                          <span className="text-muted-foreground">hours</span>
                        </div>
                      )}
                    </div>

                    <Button
                      variant={previewMode ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPreviewMode(!previewMode)}
                    >
                      <Eye className="h-4 w-4 mr-1.5" />
                      {previewMode ? 'Edit' : 'Preview'}
                    </Button>
                  </div>

                  {/* Delay warning */}
                  {selectedTemplate.status_trigger === 'reject' && editForm.delay_hours > 0 && (
                    <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md text-sm">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-amber-800 dark:text-amber-200">
                        Rejection emails will be held for {editForm.delay_hours} hours before sending, allowing you to cancel if needed.
                      </p>
                    </div>
                  )}

                  {/* Subject */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Subject</Label>
                    <Input
                      value={editForm.subject}
                      onChange={(e) => setEditForm(prev => ({ ...prev, subject: e.target.value }))}
                      placeholder="Email subject..."
                      disabled={previewMode}
                      className="h-9"
                    />
                  </div>

                  {/* Body */}
                  <div className="space-y-1.5 flex-1">
                    <Label className="text-sm font-medium">Message</Label>
                    {previewMode ? (
                      <div className="border rounded-md p-4 bg-muted/30 min-h-[250px] whitespace-pre-wrap text-sm font-mono">
                        {getPreviewText()}
                      </div>
                    ) : (
                      <Textarea
                        value={editForm.body_text}
                        onChange={(e) => setEditForm(prev => ({ ...prev, body_text: e.target.value }))}
                        placeholder="Write your email message here...&#10;&#10;URLs will automatically become clickable links."
                        className="min-h-[250px] text-sm resize-none"
                      />
                    )}
                  </div>

                  {/* Placeholders help */}
                  {!previewMode && (
                    <div className="bg-muted/40 rounded-md p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                        <Link2 className="h-3 w-3" />
                        Available placeholders (will be replaced with actual values):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {placeholders.map(p => (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => {
                              const textarea = document.querySelector('textarea');
                              if (textarea) {
                                const start = textarea.selectionStart;
                                const end = textarea.selectionEnd;
                                const newText = editForm.body_text.substring(0, start) + p.key + editForm.body_text.substring(end);
                                setEditForm(prev => ({ ...prev, body_text: newText }));
                              }
                            }}
                            className="text-xs px-2 py-1 rounded bg-background border hover:bg-muted transition-colors"
                            title={p.desc}
                          >
                            {p.key}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="border-t px-5 py-3 flex justify-end gap-2 bg-muted/20">
                  <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-1.5 h-4 w-4" />
                    )}
                    Save
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Mail className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Select a template to edit</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
