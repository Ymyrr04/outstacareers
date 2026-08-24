import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSlackNotifications } from '@/hooks/useSlackNotifications';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { X, Plus, Trash2, CheckCircle2, Undo2, NotebookPen, Flag, Pencil } from 'lucide-react';
import { CalendarAdmin } from '@/hooks/useCalendarAdmins';
import { CalendarEvent } from '@/hooks/useCalendarEvents';
import {
  formatMinutes,
  eventTypeLabel,
  colorForIndex,
  recurrenceLabel,
  pipelineLinkStyle,
  pipelineLinkHref,
  isDeadline,
  DEADLINE_COLOR,
} from '@/lib/calendarTime';
import MeetingNotesDialog from './MeetingNotesDialog';
import AddActivityModal from './AddActivityModal';
import { CandidateDetailDialog } from '@/components/CandidateDetailDialog';
import { useToast } from '@/hooks/use-toast';

interface Comment {
  id: string;
  comment: string;
  commented_by: string;
  created_at: string;
}

interface Props {
  event: CalendarEvent;
  admins: CalendarAdmin[];
  currentUserId?: string;
  onClose: () => void;
  onChanged: () => void;
  className?: string;
}

const Avatar = ({ admin, size = 24 }: { admin?: CalendarAdmin; size?: number }) => {
  const color = admin?.color ?? colorForIndex(99);
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-medium shrink-0"
      style={{
        width: size,
        height: size,
        background: color.bg,
        color: color.text,
        border: `1px solid ${color.main}`,
        fontSize: Math.max(9, size * 0.42),
      }}
      title={admin?.name}
    >
      {admin?.initial ?? '?'}
    </span>
  );
};

export const ActivityDetailPanel = ({ event, admins, currentUserId, onClose, onChanged, className }: Props) => {
  const { toast } = useToast();
  const { notifyCalendarComment, notifyCalendarUpdate } = useSlackNotifications();
  const owner = admins.find((a) => a.user_id === event.created_by);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [togglingDone, setTogglingDone] = useState(false);
  const [candidateOpen, setCandidateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const link = event.pipeline_link || null;
  const linkStyle = link ? pipelineLinkStyle(link.type) : null;
  const deadline = isDeadline(event.event_type);
  const done = !!event.is_done;

  const loadComments = useCallback(async () => {
    const { data } = await supabase
      .from('calendar_event_comments')
      .select('*')
      .eq('event_id', event.id)
      .order('created_at', { ascending: true });
    setComments((data || []) as Comment[]);
  }, [event.id]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const postComment = async () => {
    const text = newComment.trim();
    if (!text || !currentUserId) return;
    setPosting(true);
    const { error } = await supabase.from('calendar_event_comments').insert({
      event_id: event.id,
      comment: text,
      commented_by: currentUserId,
    });
    setPosting(false);
    if (error) {
      toast({ title: 'Could not post comment', description: error.message, variant: 'destructive' });
      return;
    }
    setNewComment('');
    loadComments();

    // Fire Slack notification (non-blocking)
    const commenter = admins.find((a) => a.user_id === currentUserId);
    // Resolve @mentions typed in the comment to admin emails
    const plain = text.replace(/<[^>]*>/g, ' ');
    const mentionedEmails = Array.from(
      new Set(
        admins
          .filter((a) => {
            if (!a.email || a.user_id === currentUserId) return false;
            const names = [a.name, a.name?.split(' ')[0], a.email.split('@')[0]].filter(Boolean) as string[];
            return names.some((n) =>
              new RegExp(`@${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(plain),
            );
          })
          .map((a) => a.email),
      ),
    );
    // Always notify the people assigned to the task and its creator
    const assignedToEmails = (event.assigned_to || [])
      .map((id) => admins.find((a) => a.user_id === id)?.email)
      .filter(Boolean) as string[];
    const creatorEmail = admins.find((a) => a.user_id === event.created_by)?.email;
    if (commenter?.email) {
      notifyCalendarComment({
        commentByEmail: commenter.email,
        commentText: text,
        activityTitleForComment: event.title,
        eventDateForComment: event.event_date,
        mentionedEmails,
        assignedToEmails,
        createdByEmail: creatorEmail || undefined,
      }).catch((err) => console.error('[Slack] Calendar comment notification failed:', err));
    }


  };

  const toggleAssignee = async (userId: string) => {
    const current = event.assigned_to || [];
    const isAdding = !current.includes(userId);
    const next = isAdding
      ? [...current, userId]
      : current.filter((id) => id !== userId);
    const { error } = await supabase
      .from('calendar_events')
      .update({ assigned_to: next })
      .eq('id', event.id);
    if (error) {
      toast({ title: 'Could not update assignees', description: error.message, variant: 'destructive' });
      return;
    }
    onChanged();

    // Fire Slack notification (non-blocking)
    const admin = admins.find((a) => a.user_id === userId);
    const actor = admins.find((a) => a.user_id === currentUserId);
    if (actor?.email) {
      notifyCalendarUpdate({
        updatedByEmail: actor.email,
        activityTitle: event.title,
        eventDate: event.event_date,
        updateType: isAdding ? 'assigned' : 'unassigned',
        updateDetail: isAdding ? `Assigned ${admin?.name ?? 'someone'}` : `Removed ${admin?.name ?? 'someone'}`,
      }).catch((err) => console.error('[Slack] Calendar update notification failed:', err));
    }
  };

  const toggleDone = async () => {
    setTogglingDone(true);
    const { error } = await supabase
      .from('calendar_events')
      .update({ is_done: !done })
      .eq('id', event.id);
    setTogglingDone(false);
    if (error) {
      toast({ title: 'Could not update status', description: error.message, variant: 'destructive' });
      return;
    }
    onChanged();

    // Fire Slack notification (non-blocking)
    const actor = admins.find((a) => a.user_id === currentUserId);
    if (actor?.email) {
      notifyCalendarUpdate({
        updatedByEmail: actor.email,
        activityTitle: event.title,
        eventDate: event.event_date,
        updateType: done ? 'undo' : 'done',
      }).catch((err) => console.error('[Slack] Calendar update notification failed:', err));
    }
  };

  const deleteEvent = async () => {
    const { error } = await supabase.from('calendar_events').delete().eq('id', event.id);
    if (error) {
      toast({ title: 'Could not delete activity', description: error.message, variant: 'destructive' });
      return;
    }

    // Fire Slack notification (non-blocking) before closing
    const actor = admins.find((a) => a.user_id === currentUserId);
    if (actor?.email) {
      notifyCalendarUpdate({
        updatedByEmail: actor.email,
        activityTitle: event.title,
        eventDate: event.event_date,
        updateType: 'deleted',
      }).catch((err) => console.error('[Slack] Calendar update notification failed:', err));
    }

    onClose();
    onChanged();
  };

  const color = deadline ? DEADLINE_COLOR : owner?.color ?? colorForIndex(99);

  return (
    <Card
      className={`relative mt-4 p-4 border-[0.5px] ${className ?? ''}`}
      style={
        deadline
          ? { background: DEADLINE_COLOR.bg, borderLeft: `3px solid ${DEADLINE_COLOR.main}` }
          : undefined
      }
    >
      <div className="absolute right-2 top-2 flex items-center gap-1">
        {done && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditOpen(true)} title="Edit activity">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={deleteEvent} title="Delete activity">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <AddActivityModal
        open={editOpen}
        onOpenChange={setEditOpen}
        date={event.event_date}
        defaultStart={event.start_time}
        defaultEnd={event.end_time}
        admins={admins}
        currentUserId={currentUserId}
        editEvent={event}
        onSaved={() => {
          setEditOpen(false);
          onChanged();
        }}
      />

      <div className={`flex items-center gap-3 ${done ? 'opacity-60' : ''}`}>
        {deadline ? (
          <span
            className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full"
            style={{ background: DEADLINE_COLOR.bg, border: `1px solid ${DEADLINE_COLOR.main}` }}
          >
            <Flag className="h-4 w-4" style={{ color: DEADLINE_COLOR.main }} />
          </span>
        ) : (
          <Avatar admin={owner} size={34} />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{owner?.name ?? 'Unassigned'}</span>
            <Badge variant="secondary" style={{ background: color.bg, color: color.text }}>
              {eventTypeLabel(event.event_type)}
            </Badge>
            {event.is_recurring && <Badge variant="outline">{recurrenceLabel(event.recurrence_rule)}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatMinutes(event.start_time)} – {formatMinutes(event.end_time)} ET
          </p>
        </div>
      </div>

      <p className={`mt-3 text-sm font-medium ${done ? 'line-through opacity-60' : ''}`}>{event.title}</p>

      {link && linkStyle && (
        link.type === 'applicant' ? (
          <button
            type="button"
            onClick={() => setCandidateOpen(true)}
            className="mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs hover:opacity-80"
            style={{ background: linkStyle.bg, color: linkStyle.text, border: `1px solid ${linkStyle.border}55` }}
          >
            {linkStyle.label}: {link.name}
          </button>
        ) : (
          <a
            href={pipelineLinkHref(link)}
            className="mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs hover:opacity-80"
            style={{ background: linkStyle.bg, color: linkStyle.text, border: `1px solid ${linkStyle.border}55` }}
          >
            {linkStyle.label}: {link.name}
          </a>
        )
      )}

      {link?.type === 'applicant' && (
        <CandidateDetailDialog
          open={candidateOpen}
          onOpenChange={setCandidateOpen}
          applicantId={link.id}
        />
      )}

      {event.description && (
        <div className="mt-2 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground whitespace-pre-wrap">
          {event.description}
        </div>
      )}

      {event.meeting_notes && (
        <div
          className="mt-3 rounded-md p-3 text-sm whitespace-pre-wrap"
          style={{ background: '#FFFBEB', border: '1px solid #FCD34D', color: '#92400E' }}
        >
          <p className="text-xs font-medium mb-1">Meeting notes</p>
          {event.meeting_notes}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Owner</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5">
          <Avatar admin={owner} size={20} />
          <span className="text-xs">{owner?.name ?? 'Unassigned'}</span>
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Assigned to</span>
        {(event.assigned_to || []).length === 0 && (
          <span className="text-xs text-muted-foreground">No one assigned</span>
        )}
        {(event.assigned_to || []).map((id) => {
          const a = admins.find((x) => x.user_id === id);
          return (
            <span key={id} className="inline-flex items-center gap-1 rounded-full border pl-1 pr-1 py-0.5">
              <Avatar admin={a} size={20} />
              <span className="text-xs">{a?.name ?? 'Admin'}</span>
              <button
                type="button"
                onClick={() => toggleAssignee(id)}
                title={`Unassign ${a?.name ?? 'admin'}`}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 px-2 text-xs">
              <Plus className="h-3 w-3 mr-1" /> Assign
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-1" align="start">
            {admins.map((a) => (
              <button
                key={a.user_id}
                onClick={() => toggleAssignee(a.user_id)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Avatar admin={a} size={20} />
                <span className="flex-1 text-left">{a.name}</span>
                {(event.assigned_to || []).includes(a.user_id) && (
                  <span className="text-xs text-muted-foreground">✓</span>
                )}
              </button>
            ))}
          </PopoverContent>
        </Popover>
        <Button
          variant={done ? 'secondary' : 'outline'}
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={toggleDone}
          disabled={togglingDone}
        >
          {done ? (
            <>
              <Undo2 className="h-3 w-3 mr-1" /> Undo
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3 w-3 mr-1" /> Done
            </>
          )}
        </Button>
        {event.event_type === 'meeting' && (
          <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => setNotesOpen(true)}>
            <NotebookPen className="h-3 w-3 mr-1" /> {event.meeting_notes ? 'Edit notes' : 'Add notes'}
          </Button>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <span className="text-xs text-muted-foreground">Comments</span>
        {comments.map((c) => {
          const author = admins.find((a) => a.user_id === c.commented_by);
          return (
            <div key={c.id} className="flex items-start gap-2">
              <Avatar admin={author} size={20} />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  {author?.name ?? 'Admin'} ·{' '}
                  {new Intl.DateTimeFormat('en-US', {
                    timeZone: 'America/New_York',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  }).format(new Date(c.created_at))}{' '}
                  ET
                </p>
                <p className="text-sm whitespace-pre-wrap">{c.comment}</p>
              </div>
            </div>
          );
        })}
        {comments.length === 0 && <p className="text-xs text-muted-foreground">No comments yet.</p>}
        <div className="flex gap-2 pt-1">
          <Input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                postComment();
              }
            }}
            placeholder="Write a comment…"
            className="h-8 text-sm"
          />
          <Button size="sm" className="h-8" onClick={postComment} disabled={posting}>
            Post
          </Button>
        </div>
      </div>

      {event.event_type === 'meeting' && (
        <MeetingNotesDialog
          open={notesOpen}
          onOpenChange={setNotesOpen}
          event={event}
          adminName={owner?.name}
          currentUserEmail={admins.find((a) => a.user_id === currentUserId)?.email}
          onSaved={onChanged}
        />
      )}
    </Card>
  );
};

export default ActivityDetailPanel;
