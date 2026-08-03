import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WysiwygEditor } from '@/components/WysiwygEditor';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { sanitizeHtml } from '@/lib/sanitize';
import { Loader2, Send, Pencil, Eye } from 'lucide-react';

const ADMIN_SENDERS = [
  { email: 'mark@outsta.io', name: 'Mark' },
  { email: 'kristine@outsta.io', name: 'Kristine' },
  { email: 'czarina@outsta.io', name: 'Czarina' },
  { email: 'eduardo@outsta.io', name: 'Eduardo' },
  { email: 'jil@outsta.io', name: 'Jil' },
];

export interface PendingStageEmail {
  candidateName: string;
  recipientEmail: string;
  newStatus: string;
  subject: string;
  bodyHtml: string;
  scheduleFor?: string;
}

interface Props {
  pending: PendingStageEmail | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (subject: string, bodyHtml: string, cc: string[]) => Promise<void> | void;
}

export function StageEmailConfirmDialog({ pending, onOpenChange, onConfirm }: Props) {
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const DEFAULT_CC = 'jil@outsta.io';
  const [cc, setCc] = useState(DEFAULT_CC);
  const [showCc, setShowCc] = useState(true);
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (pending) {
      setSubject(pending.subject);
      setBodyHtml(pending.bodyHtml);
      setCc(DEFAULT_CC);
      setShowCc(true);
      setEditing(false);
      setSending(false);
    }
  }, [pending]);

  if (!pending) return null;

  const ccList = cc
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => e.includes('@'));

  const handleConfirm = async () => {
    setSending(true);
    try {
      await onConfirm(subject, bodyHtml, ccList);
      onOpenChange(false);
    } finally {
      setSending(false);
    }
  };


  return (
    <Dialog open={!!pending} onOpenChange={(o) => { if (!o) onOpenChange(false); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-4 h-4" />
            Send stage email?
          </DialogTitle>
          <DialogDescription>
            {pending.candidateName} was moved to <span className="font-medium">{pending.newStatus}</span>.
            Review the template below — edit it, confirm to send as-is, or skip the email.
            {pending.scheduleFor && ' This email is scheduled per the template delay.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">To</Label>
              {!showCc && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setShowCc(true)}>
                  Add CC
                </Button>
              )}
            </div>
            <p className="text-sm font-medium">{pending.recipientEmail}</p>
          </div>

          {showCc && (
            <div className="space-y-2">
              <Label>CC</Label>
              <Input
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="name@outsta.io, other@example.com"
              />
              <p className="text-xs text-muted-foreground">Separate multiple emails with commas.</p>
            </div>
          )}


          <div className="space-y-2">
            <Label>Subject</Label>
            {editing ? (
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            ) : (
              <p className="text-sm font-medium">{subject}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Message</Label>
            {editing ? (
              <WysiwygEditor value={bodyHtml} onChange={setBodyHtml} minHeight="240px" />
            ) : (
              <div
                className="rounded-md border p-4 text-sm prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(bodyHtml) }}
              />
            )}
          </div>
        </div>

        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Skip email
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(!editing)} disabled={sending}>
              {editing ? <Eye className="w-4 h-4 mr-2" /> : <Pencil className="w-4 h-4 mr-2" />}
              {editing ? 'Preview' : 'Edit'}
            </Button>
            <Button onClick={handleConfirm} disabled={sending || !subject.trim()}>
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Confirm & send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
