import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEmailTemplates, triggerToStatus, EmailTemplate } from '@/hooks/useEmailTemplates';
import { Mail, Save, Loader2, Clock, Eye, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { RichTextToolbar } from './RichTextToolbar';
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

// Convert HTML to plain text (preserving markdown-style formatting)
const htmlToPlainText = (html: string): string => {
  let text = html;
  
  // Convert bold tags to markdown
  text = text.replace(/<strong>([^<]*)<\/strong>/gi, '**$1**');
  text = text.replace(/<b>([^<]*)<\/b>/gi, '**$1**');
  
  // Convert italic tags to markdown
  text = text.replace(/<em>([^<]*)<\/em>/gi, '*$1*');
  text = text.replace(/<i>([^<]*)<\/i>/gi, '*$1*');
  
  // Convert underline tags to markdown
  text = text.replace(/<u>([^<]*)<\/u>/gi, '__$1__');
  
  // Convert list items
  text = text.replace(/<li>([^<]*)<\/li>/gi, '• $1\n');
  text = text.replace(/<\/ul>/gi, '');
  text = text.replace(/<ul>/gi, '');
  text = text.replace(/<\/ol>/gi, '');
  text = text.replace(/<ol>/gi, '');
  
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  // Convert HTML links to markdown-style links
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '[$2]($1)');
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
  
  // Convert markdown-style bold **text** to HTML
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // Convert markdown-style italic *text* to HTML (but not ** which is bold)
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  
  // Convert markdown-style underline __text__ to HTML
  html = html.replace(/__([^_]+)__/g, '<u>$1</u>');
  
  // Convert markdown-style links [text](url) to HTML links
  // Use a function to clean up the URL (remove newlines, trim whitespace)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (match, linkText, url) => {
      // Clean the URL: remove newlines, trim whitespace, remove any stray quotes
      const cleanUrl = url
        .replace(/[\r\n]+/g, '') // Remove line breaks
        .replace(/["']/g, '') // Remove quotes that might have been accidentally included
        .trim();
      // Clean the link text similarly
      const cleanText = linkText.replace(/[\r\n]+/g, ' ').trim();
      return `<a href="${cleanUrl}" style="color: #0066cc;">${cleanText}</a>`;
    }
  );
  
  // Convert bare URLs to links (but not ones already in markdown format or already in href)
  html = html.replace(
    /(?<!\(|href=")(?<!")(?<!')(\bhttps?:\/\/[^\s<>\[\]()]+)(?!\))/gi,
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
  const { templates, loading, updateTemplate, createTemplate, deleteTemplate, setDefaultTemplate } = useEmailTemplates();
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
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
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateTrigger, setNewTemplateTrigger] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Convert stored minutes to display value and unit
  const minutesToDisplayValue = (totalMinutes: number): { value: number; unit: 'minutes' | 'hours' } => {
    if (totalMinutes === 0) return { value: 0, unit: 'minutes' };
    if (totalMinutes >= 60 && totalMinutes % 60 === 0) {
      return { value: totalMinutes / 60, unit: 'hours' };
    }
    return { value: totalMinutes, unit: 'minutes' };
  };

  // Convert display value and unit to minutes for storage
  const displayValueToMinutes = (value: number, unit: 'minutes' | 'hours'): number => {
    if (unit === 'hours') return value * 60;
    return value;
  };

  const handleSelectTemplate = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    // delay_hours now stores minutes
    const { value, unit } = minutesToDisplayValue(template.delay_hours);
    setEditForm({
      name: template.name || '',
      subject: template.subject,
      body_text: htmlToPlainText(template.body_html),
      is_enabled: template.is_enabled,
      delay_hours: value,
      delay_unit: unit,
    });
    setPreviewMode(false);
  };

  const handleSave = async () => {
    if (!selectedTemplate) return;
    
    setSaving(true);
    // Convert to minutes for storage
    const delayInMinutes = displayValueToMinutes(editForm.delay_hours, editForm.delay_unit);
    const success = await updateTemplate(selectedTemplate.id, {
      name: editForm.name,
      subject: editForm.subject,
      body_html: plainTextToHtml(editForm.body_text),
      is_enabled: editForm.is_enabled,
      delay_hours: delayInMinutes,
    });
    if (success) {
      setSelectedTemplate({ 
        ...selectedTemplate,
        name: editForm.name,
        subject: editForm.subject,
        body_html: plainTextToHtml(editForm.body_text),
        is_enabled: editForm.is_enabled,
        delay_hours: delayInMinutes,
      });
    }
    setSaving(false);
  };

  const handleAddTemplate = async () => {
    if (!newTemplateName.trim() || !newTemplateTrigger) return;
    
    setCreating(true);
    // Use the selected trigger as the status_trigger
    const templateKey = `custom_${newTemplateTrigger}_${Date.now()}`;
    const success = await createTemplate({
      status_trigger: templateKey,
      name: newTemplateName,
      subject: newTemplateName, // Default subject to the name, can be changed later
      body_html: 'Hi {{first_name}},<br><br>Your message here.<br><br>Best regards,<br>The Recruitment Team',
    });
    if (success) {
      setShowAddDialog(false);
      setNewTemplateName('');
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

  const getPreviewHtml = () => {
    let text = editForm.body_text
      .replace(/\{\{first_name\}\}/g, 'John')
      .replace(/\{\{full_name\}\}/g, 'John Doe')
      .replace(/\{\{applicant_name\}\}/g, 'John Doe')
      .replace(/\{\{job_title\}\}/g, 'Software Engineer')
      .replace(/\{\{interview_date\}\}/g, 'Monday, January 15, 2025')
      .replace(/\{\{interview_time\}\}/g, '10:00 AM')
      .replace(/\{\{timezone\}\}/g, 'PST')
      .replace(/\{\{meeting_link\}\}/g, 'https://zoom.us/j/123456789');
    
    // Convert to HTML with proper hyperlinks
    return plainTextToHtml(text);
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

  // Get display name for template - now uses the name column
  const getTemplateName = (template: EmailTemplate) => {
    if (template.name) {
      return template.name;
    }
    // Fallback for templates without a name
    return triggerToStatus[template.status_trigger] || template.status_trigger;
  };

  const getDelayDisplay = (template: EmailTemplate) => {
    if (template.delay_hours === 0) return null;
    // delay_hours now stores minutes, convert for display
    if (template.delay_hours >= 60 && template.delay_hours % 60 === 0) {
      return `${template.delay_hours / 60}h delay`;
    }
    return `${template.delay_hours}m delay`;
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
            {/* Template List - Grouped by Pipeline Stage */}
            <div className="w-56 border-r bg-muted/20 flex flex-col">
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-3">
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    (() => {
                      // Group templates by pipeline stage
                      const pipelineOrder = [
                        { key: 'application_received', label: 'Application Received' },
                        { key: 'for_interview', label: 'For Interview' },
                        { key: 'siv', label: 'SIV' },
                        { key: 'client_interview', label: 'Client Interview' },
                        { key: 'hired', label: 'Hired' },
                        { key: 'bench', label: 'Bench' },
                        { key: 'reject', label: 'Reject' },
                        { key: 'check_availability', label: 'Check Availability' },
                        { key: 'reprofiling', label: 'Reprofiling' },
                        { key: 'other', label: 'Other' },
                      ];

                      const getTemplateStage = (template: EmailTemplate) => {
                        const trigger = template.status_trigger;
                        // Check if it's a custom template with stage info
                        if (trigger.startsWith('custom_')) {
                          const parts = trigger.split('_');
                          if (parts.length >= 2) {
                            // Extract the stage from custom_stagename_timestamp
                            const stageKey = parts.slice(1, -1).join('_');
                            if (pipelineOrder.some(p => p.key === stageKey)) {
                              return stageKey;
                            }
                          }
                        }
                        // Check if trigger directly matches a stage
                        if (pipelineOrder.some(p => p.key === trigger)) {
                          return trigger;
                        }
                        return 'other';
                      };

                      const groupedTemplates = pipelineOrder.reduce((acc, stage) => {
                        acc[stage.key] = templates.filter(t => getTemplateStage(t) === stage.key);
                        return acc;
                      }, {} as Record<string, EmailTemplate[]>);

                      return pipelineOrder.map(stage => {
                        const stageTemplates = groupedTemplates[stage.key];
                        if (!stageTemplates || stageTemplates.length === 0) return null;

                        return (
                          <div key={stage.key}>
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1.5">
                              {stage.label}
                            </div>
                            <div className="space-y-0.5">
                              {stageTemplates.map((template) => {
                                const delayDisplay = getDelayDisplay(template);
                                return (
                                  <button
                                    key={template.id}
                                    onClick={() => handleSelectTemplate(template)}
                                    className={`w-full text-left px-3 py-2 rounded-md transition-colors text-sm ${
                                      selectedTemplate?.id === template.id
                                        ? 'bg-primary text-primary-foreground'
                                        : 'hover:bg-muted'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-medium truncate text-xs">
                                        {getTemplateName(template)}
                                      </span>
                                      {!template.is_enabled && (
                                        <Badge variant="outline" className="text-[10px] px-1.5 opacity-60">OFF</Badge>
                                      )}
                                    </div>
                                    {delayDisplay && (
                                      <div className="flex items-center gap-1 mt-0.5 text-[10px] opacity-70">
                                        <Clock className="h-2.5 w-2.5" />
                                        {delayDisplay}
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      });
                    })()
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
                        {selectedTemplate.is_default ? (
                          <Badge className="text-[10px]">Default for this stage</Badge>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDefaultTemplate(selectedTemplate.id)}
                          >
                            Set as stage default
                          </Button>
                        )}
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

                    {/* Template Name */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Template Name</Label>
                      <Input
                        value={editForm.name}
                        onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Template name..."
                        disabled={previewMode}
                        className="h-9"
                      />
                      <p className="text-xs text-muted-foreground">
                        This name is displayed in the template list.
                      </p>
                    </div>

                    {/* Email Subject */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Email Subject</Label>
                      <Input
                        value={editForm.subject}
                        onChange={(e) => setEditForm(prev => ({ ...prev, subject: e.target.value }))}
                        placeholder="Email subject line..."
                        disabled={previewMode}
                        className="h-9"
                      />
                    </div>

                    {/* Body */}
                    <div className="space-y-1.5 flex-1">
                      <Label className="text-sm font-medium">Message</Label>
                      {previewMode ? (
                        <div 
                          className="border rounded-md p-4 bg-muted/30 min-h-[250px] text-sm"
                          dangerouslySetInnerHTML={{ __html: getPreviewHtml() }}
                        />
                      ) : (
                        <div className="border rounded-md overflow-hidden">
                          <RichTextToolbar
                            value={editForm.body_text}
                            onChange={(value) => setEditForm(prev => ({ ...prev, body_text: value }))}
                            textareaRef={textareaRef}
                          />
                          <Textarea
                            ref={textareaRef}
                            value={editForm.body_text}
                            onChange={(e) => setEditForm(prev => ({ ...prev, body_text: e.target.value }))}
                            placeholder="Write your email message here...&#10;&#10;Use Ctrl+K for quick hyperlink insertion."
                            className="min-h-[220px] text-sm resize-none border-0 rounded-none focus-visible:ring-0"
                          />
                        </div>
                      )}
                    </div>

                    {/* Placeholders help */}
                    {!previewMode && (
                      <div className="bg-muted/40 rounded-md p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          Available placeholders (will be replaced with actual values):
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {placeholders.map(p => (
                            <button
                              key={p.key}
                              type="button"
                              onClick={() => {
                                const textarea = textareaRef.current;
                                if (textarea) {
                                  const start = textarea.selectionStart;
                                  const end = textarea.selectionEnd;
                                  const newText = editForm.body_text.substring(0, start) + p.key + editForm.body_text.substring(end);
                                  setEditForm(prev => ({ ...prev, body_text: newText }));
                                  textarea.focus();
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
              Create a custom email template that can be used by any recruiter for any pipeline stage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">Template Name</Label>
              <Input
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="e.g., Follow-up Interview Invite"
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                A descriptive name to identify this template.
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">Pipeline Stage</Label>
              <Select value={newTemplateTrigger} onValueChange={setNewTemplateTrigger}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a pipeline stage..." />
                </SelectTrigger>
                <SelectContent>
                  {availableTriggers.map((trigger) => (
                    <SelectItem key={trigger.value} value={trigger.value}>
                      {trigger.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1.5">
                Choose which pipeline stage this template is associated with.
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setNewTemplateName(''); setNewTemplateTrigger(''); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAddTemplate} disabled={!newTemplateName.trim() || !newTemplateTrigger || creating}>
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
              Are you sure you want to delete the "{selectedTemplate ? getTemplateName(selectedTemplate) : ''}" template? This action cannot be undone.
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