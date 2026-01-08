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
import { Mail, Save, Loader2, Clock, Eye, AlertTriangle, Link2, Plus, Trash2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface EmailTemplateEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Convert HTML to plain text
const htmlToPlainText = (html: string): string => {
  let text = html.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
};

// Convert plain text to simple HTML for email
const plainTextToHtml = (text: string): string => {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  html = html.replace(
    /\b(https?:\/\/[^\s<>]+)/gi,
    '<a href="$1" style="color: #0066cc;">$1</a>'
  );
  
  html = html.replace(/\n/g, '<br>');
  
  return html;
};

// Available trigger options for new templates
const availableTriggers = [
  { value: 'application_received', label: 'Application Received' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'pass_screening', label: 'Pass Screening' },
  { value: '50/50', label: '50/50' },
  { value: 'candidate_successful', label: 'Candidate Successful' },
  { value: 'hire', label: 'Hire' },
  { value: 'for_interview', label: 'For Interview' },
  { value: 'bench', label: 'Bench' },
  { value: 'reject', label: 'Reject' },
  { value: 'client_interview', label: 'Client Interview' },
  { value: 'hired', label: 'Hired' },
  { value: 'reprofiling', label: 'Reprofiling' },
  { value: 'check_availability', label: 'Check Availability' },
  { value: 'siv', label: 'SIV' },
];

export function EmailTemplateEditor({ open, onOpenChange }: EmailTemplateEditorProps) {
  const { templates, loading, updateTemplate, createTemplate, deleteTemplate } = useEmailTemplates();
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [editForm, setEditForm] = useState({
    subject: '',
    body_text: '',
    is_enabled: true,
    delay_hours: 0,
    delay_unit: 'hours' as 'minutes' | 'hours',
  });
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newTemplateTrigger, setNewTemplateTrigger] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSelectTemplate = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    // Detect if delay is in minutes (< 1 hour stored as minutes in the field)
    const isSivTemplate = template.status_trigger === 'siv';
    setEditForm({
      subject: template.subject,
      body_text: htmlToPlainText(template.body_html),
      is_enabled: template.is_enabled,
      delay_hours: template.delay_hours,
      delay_unit: isSivTemplate && template.delay_hours > 0 && template.delay_hours < 60 ? 'minutes' : 'hours',
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

  const handleAddTemplate = async () => {
    if (!newTemplateTrigger) return;
    
    setCreating(true);
    const success = await createTemplate({
      status_trigger: newTemplateTrigger,
      subject: `Email for ${triggerToStatus[newTemplateTrigger] || newTemplateTrigger}`,
      body_html: 'Hi {{first_name}},<br><br>Your message here.<br><br>Best regards,<br>The Recruitment Team',
    });
    if (success) {
      setShowAddDialog(false);
      setNewTemplateTrigger('');
    }
    setCreating(false);
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplate) return;
    
    setDeleting(true);
    const success = await deleteTemplate(selectedTemplate.id);
    if (success) {
      setSelectedTemplate(null);
      setShowDeleteDialog(false);
    }
    setDeleting(false);
  };

  const getPreviewText = () => {
    return editForm.body_text
      .replace(/\{\{first_name\}\}/g, 'John')
      .replace(/\{\{full_name\}\}/g, 'John Doe')
      .replace(/\{\{applicant_name\}\}/g, 'John Doe')
      .replace(/\{\{job_title\}\}/g, 'Software Engineer')
      .replace(/\{\{interview_date\}\}/g, 'Monday, January 15, 2025')
      .replace(/\{\{interview_time\}\}/g, '10:00 AM')
      .replace(/\{\{timezone\}\}/g, 'PST')
      .replace(/\{\{meeting_link\}\}/g, 'https://zoom.us/j/123456789');
  };

  const placeholders = [
    { key: '{{first_name}}', desc: 'First name only' },
    { key: '{{full_name}}', desc: 'Full name' },
    { key: '{{applicant_name}}', desc: 'Candidate name (alias for full_name)' },
    { key: '{{job_title}}', desc: 'Position title' },
    { key: '{{interview_date}}', desc: 'Interview date' },
    { key: '{{interview_time}}', desc: 'Interview time' },
    { key: '{{timezone}}', desc: 'Timezone' },
    { key: '{{meeting_link}}', desc: 'Meeting URL' },
  ];

  // Get existing triggers to filter out from available options
  const existingTriggers = templates.map(t => t.status_trigger);
  const availableTriggersFiltered = availableTriggers.filter(t => !existingTriggers.includes(t.value));

  const getDelayDisplay = (template: EmailTemplate) => {
    if (template.delay_hours === 0) return null;
    // SIV uses minutes, others use hours
    if (template.status_trigger === 'siv' && template.delay_hours < 60) {
      return `${template.delay_hours}m delay`;
    }
    return `${template.delay_hours}h delay`;
  };

  return (
    <>
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
            <div className="w-56 border-r bg-muted/20 flex flex-col">
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-1">
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    templates.map((template) => {
                      const delayDisplay = getDelayDisplay(template);
                      return (
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
                          {delayDisplay && (
                            <div className="flex items-center gap-1 mt-0.5 text-xs opacity-70">
                              <Clock className="h-3 w-3" />
                              {delayDisplay}
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
              
              {/* Add Template Button */}
              <div className="p-3 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowAddDialog(true)}
                  disabled={availableTriggersFiltered.length === 0}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Template
                </Button>
              </div>
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
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowDeleteDialog(true)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant={previewMode ? "default" : "outline"}
                          size="sm"
                          onClick={() => setPreviewMode(!previewMode)}
                        >
                          <Eye className="h-4 w-4 mr-1.5" />
                          {previewMode ? 'Edit' : 'Preview'}
                        </Button>
                      </div>
                    </div>

                    {/* Time Delay - Editable for all templates */}
                    <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-md">
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground">Send delay:</span>
                      <Input
                        type="number"
                        min="0"
                        max="168"
                        value={editForm.delay_hours}
                        onChange={(e) => setEditForm(prev => ({ ...prev, delay_hours: parseInt(e.target.value) || 0 }))}
                        className="w-20 h-8"
                      />
                      <Select
                        value={editForm.delay_unit}
                        onValueChange={(value: 'minutes' | 'hours') => setEditForm(prev => ({ ...prev, delay_unit: value }))}
                      >
                        <SelectTrigger className="w-24 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="minutes">minutes</SelectItem>
                          <SelectItem value="hours">hours</SelectItem>
                        </SelectContent>
                      </Select>
                      {editForm.delay_hours === 0 && (
                        <span className="text-xs text-muted-foreground">(instant)</span>
                      )}
                    </div>

                    {/* Delay warning */}
                    {editForm.delay_hours > 0 && (
                      <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md text-sm">
                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                        <p className="text-amber-800 dark:text-amber-200">
                          Emails will be held for {editForm.delay_hours} {editForm.delay_unit} before sending, allowing you to cancel if needed.
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

      {/* Add Template Dialog */}
      <AlertDialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add New Template</AlertDialogTitle>
            <AlertDialogDescription>
              Select a pipeline stage to create a new email template for.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label className="text-sm font-medium mb-2 block">Pipeline Stage</Label>
            <Select value={newTemplateTrigger} onValueChange={setNewTemplateTrigger}>
              <SelectTrigger>
                <SelectValue placeholder="Select a stage..." />
              </SelectTrigger>
              <SelectContent>
                {availableTriggersFiltered.map(trigger => (
                  <SelectItem key={trigger.value} value={trigger.value}>
                    {trigger.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAddTemplate} disabled={!newTemplateTrigger || creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Add Template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the "{triggerToStatus[selectedTemplate?.status_trigger || ''] || selectedTemplate?.status_trigger}" template? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTemplate}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}