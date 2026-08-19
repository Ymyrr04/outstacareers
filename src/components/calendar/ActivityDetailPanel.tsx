import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { X, Plus, Trash2 } from 'lucide-react';
import { CalendarAdmin } from '@/hooks/useCalendarAdmins';
import { CalendarEvent } from '@/hooks/useCalendarEvents';
import { formatMinutes, eventTypeLabel, colorForIndex } from '@/lib/calendarTime';
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

export const ActivityDetailPanel = ({ event, admins, currentUserId, onClose, onChanged }: Props) => {
  const { toast } = useToast();
  const owner = admins.find((a) => a.user_id === event.created_by);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);

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
  };

  const toggleAssignee = async (userId: string) => {
    const current = event.assigned_to || [];
    const next = current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId];
    const { error } = await supabase
      .from('calendar_events')
      .update({ assigned_to: next })
      .eq('id', event.id);
    if (error) {
      toast({ title: 'Could not update assignees', description: error.message, variant: 'destructive' });
      return;
    }
    onChanged();
  };

  const deleteEvent = async () => {
    const { error } = await supabase.from('calendar_events').delete().eq('id', event.id);
    if (error) {
      toast({ title: 'Could not delete activity', description: error.message, variant: 'destructive' });
      return;
    }
    onClose();
    onChanged();
  };

  const color = owner?.color ?? colorForIndex(99);

  return (
    <Card className="relative mt-4 p-4 border-[0.5px]">
      <div className="absolute right-2 top-2 flex gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={deleteEvent} title="Delete activity">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Avatar admin={owner} size={34} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{owner?.name ?? 'Unassigned'}</span>
            <Badge variant="secondary" style={{ background: color.bg, color: color.text }}>
              {eventTypeLabel(event.event_type)}
            </Badge>
            {event.is_recurring && <Badge variant="outline">Weekly</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatMinutes(event.start_time)} – {formatMinutes(event.end_time)} ET
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm font-medium">{event.title}</p>

      {event.description && (
        <div className="mt-2 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground whitespace-pre-wrap">
          {event.description}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Assigned to</span>
        {(event.assigned_to || []).map((id) => (
          <Avatar key={id} admin={admins.find((a) => a.user_id === id)} size={22} />
        ))}
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
    </Card>
  );
};

export default ActivityDetailPanel;
