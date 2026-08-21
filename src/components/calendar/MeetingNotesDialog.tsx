import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CalendarEvent } from '@/hooks/useCalendarEvents';
import { formatMinutes, formatDateLong, pipelineLinkStyle } from '@/lib/calendarTime';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: CalendarEvent;
  adminName?: string;
  currentUserEmail?: string;
  onSaved: () => void;
}

export const MeetingNotesDialog = ({ open, onOpenChange, event, adminName, currentUserEmail, onSaved }: Props) => {
  const { toast } = useToast();
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const link = event.pipeline_link || null;
  const style = link ? pipelineLinkStyle(link.type) : null;

  useEffect(() => {
    if (open) setNotes(event.meeting_notes || '');
  }, [open, event.meeting_notes]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('calendar_events')
      .update({ meeting_notes: notes.trim() || null })
      .eq('id', event.id);
    if (error) {
      setSaving(false);
      toast({ title: 'Could not save notes', description: error.message, variant: 'destructive' });
      return;
    }

    if (link?.type === 'client' && notes.trim()) {
      const { data: client } = await supabase
        .from('clients')
        .select('calendar_notes')
        .eq('id', link.id)
        .maybeSingle();
      const existing = Array.isArray((client as { calendar_notes?: unknown } | null)?.calendar_notes)
        ? ((client as { calendar_notes: unknown[] }).calendar_notes as unknown[])
        : [];
      const entry = {
        date: event.event_date,
        event_title: event.title,
        admin: adminName || 'Admin',
        notes: notes.trim(),
      };
      const { error: clientError } = await supabase
        .from('clients')
        .update({ calendar_notes: [...existing, entry] as unknown as string })
        .eq('id', link.id);
      if (clientError) {
        toast({
          title: 'Notes saved, but not copied to client',
          description: clientError.message,
          variant: 'destructive',
        });
      }
    }

    setSaving(false);
    toast({ title: 'Meeting notes saved' });
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{event.title}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {formatDateLong(event.event_date)} · {formatMinutes(event.start_time)} – {formatMinutes(event.end_time)} ET
          </p>
        </DialogHeader>

        {link && style && (
          <span
            className="inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs"
            style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}55` }}
          >
            {style.label}: {link.name}
          </span>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="meeting-notes">Meeting notes</Label>
          <Textarea
            id="meeting-notes"
            rows={8}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What was discussed?"
          />
          {link?.type === 'client' && (
            <p className="text-xs text-muted-foreground">Notes will be saved to {link.name} client record</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MeetingNotesDialog;
