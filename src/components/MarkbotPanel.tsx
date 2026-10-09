import { useEffect, useRef, useState } from 'react';
import { Sparkles, Plus, X, Send, Lock, ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CandidateProfileDialog } from '@/components/CandidateProfileDialog';
import type { TabId } from '@/hooks/useTabPermissions';
import { cn } from '@/lib/utils';

interface MarkbotSource {
  source_type: string;
  source_id: string;
  entity_type: string | null;
  entity_id: string | null;
  label: string | null;
  written_at: string | null;
  author_name?: string | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: MarkbotSource[];
  blocked?: boolean;
  logId?: string | null;
  rating?: 1 | -1 | null;
}

const TYPE_LABELS: Record<string, string> = {
  cv: 'CV',
  applicant_note: 'Note',
  additional_profile: 'Profile',
  interview_answer: 'Interview',
  hiring_comment: 'Hiring comment',
  calendar_comment: 'Calendar comment',
};

const STARTERS: { tab: TabId; text: string }[] = [
  { tab: 'pipeline', text: "What's new in the pipeline this week?" },
  { tab: 'applicants', text: 'Who mentioned QuickBooks cleanup?' },
];

const formatDate = (d: string | null) => {
  if (!d) return null;
  const date = new Date(d);
  return isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const newId = () => Math.random().toString(36).slice(2);

interface MarkbotPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canViewTab: (tab: TabId) => boolean;
  onOpenTab: (tab: string) => void;
}

export function MarkbotPanel({ open, onOpenChange, canViewTab, onOpenTab }: MarkbotPanelProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [context, setContext] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<{ id: string; name: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open && !loading) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, loading]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || loading) return;
    const history = [...messages, { id: newId(), role: 'user' as const, content: question }];
    setMessages(history);
    setInput('');
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('markbot-chat', {
        body: { messages: history.map((m) => ({ role: m.role, content: m.content })), context },
      });
      if (error) {
        let msg = error.message;
        try {
          const body = await (error as any).context?.json?.();
          if (body?.error) msg = typeof body.error === 'string' ? body.error : msg;
        } catch { /* keep default */ }
        throw new Error(msg);
      }
      if (data?.context) setContext(data.context);
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: 'assistant',
          content: data.answer,
          sources: data.sources ?? [],
          blocked: !!data.blocked,
          logId: data.log_id,
          rating: null,
        },
      ]);
    } catch (e) {
      toast({ title: 'Markbot AI', description: e instanceof Error ? e.message : 'Something went wrong', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const rate = async (msg: ChatMessage, rating: 1 | -1) => {
    if (!msg.logId) return;
    const next = msg.rating === rating ? null : rating;
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, rating: next } : m)));
    const { error } = await supabase.functions.invoke('markbot-chat', {
      body: { action: 'rate', log_id: msg.logId, rating: next },
    });
    if (error) {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, rating: msg.rating ?? null } : m)));
      toast({ title: 'Could not save rating', variant: 'destructive' });
    }
  };

  const openSource = (s: MarkbotSource) => {
    if (s.entity_type === 'applicant' && s.entity_id) {
      setProfile({ id: s.entity_id, name: s.label || 'Candidate' });
    } else if (s.entity_type === 'hiring_request') {
      onOpenTab('pipeline');
      onOpenChange(false);
    }
  };

  const starters = STARTERS.filter((s) => canViewTab(s.tab));

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-[400px] sm:max-w-[400px] p-0 flex flex-col gap-0 [&>button]:hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[hsl(var(--markbot))]" />
              <SheetTitle className="text-sm font-semibold">Markbot AI</SheetTitle>
              <SheetDescription className="sr-only">Ask questions about your recruitment data</SheetDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" title="New chat" aria-label="New chat"
                onClick={() => { setMessages([]); setContext(null); setInput(''); inputRef.current?.focus(); }} disabled={loading}>
                <Plus className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Close" aria-label="Close" onClick={() => onOpenChange(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center pt-8 space-y-4">
                <p className="text-[12.5px] text-muted-foreground">Ask about candidates, notes, interviews and comments.</p>
                {starters.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-2">
                    {starters.map((s) => (
                      <button key={s.text} onClick={() => send(s.text)}
                        className="text-[11px] px-3 py-1 rounded-full border hover:bg-muted transition-colors">
                        {s.text}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3 py-2 text-[12.5px] whitespace-pre-wrap">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex flex-col items-start gap-1.5">
                  {m.blocked ? (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px] text-foreground">
                      <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-destructive" />
                      <span>{m.content}</span>
                    </div>
                  ) : (
                    <div className="max-w-[95%] text-[12.5px] leading-relaxed whitespace-pre-wrap">{m.content}</div>
                  )}
                  {!m.blocked && !!m.sources?.length && (
                    <div className="flex flex-wrap gap-1">
                      {m.sources.map((s, i) => {
                        const clickable = (s.entity_type === 'applicant' && s.entity_id) || s.entity_type === 'hiring_request';
                        const parts = [TYPE_LABELS[s.source_type] ?? s.source_type, s.author_name, formatDate(s.written_at)].filter(Boolean);
                        return (
                          <button key={`${s.source_id}-${i}`} type="button" disabled={!clickable} onClick={() => openSource(s)}
                            title={s.label ?? undefined}
                            className={cn('text-[11px] px-2 py-0.5 rounded bg-accent text-accent-foreground', clickable ? 'hover:opacity-80' : 'cursor-default')}>
                            {parts.join(' · ')}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {m.logId && (
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="icon" className={cn('h-6 w-6', m.rating === 1 && 'text-[hsl(var(--markbot))]')}
                        aria-label="Helpful" onClick={() => rate(m, 1)}>
                        <ThumbsUp className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className={cn('h-6 w-6', m.rating === -1 && 'text-destructive')}
                        aria-label="Not helpful" onClick={() => rate(m, -1)}>
                        <ThumbsDown className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>
              ),
            )}

            {loading && (
              <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Markbot is thinking…
              </div>
            )}
          </div>

          <div className="border-t px-4 pt-3 pb-2">
            <div className="flex items-end gap-2">
              <Textarea ref={inputRef} value={input} rows={1} placeholder="Ask Markbot AI…" disabled={loading}
                className="min-h-[38px] max-h-32 resize-none text-[12.5px]"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
                }} />
              <Button size="icon" aria-label="Send" disabled={loading || !input.trim()} onClick={() => send(input)}
                className="h-[38px] w-[38px] shrink-0 bg-[hsl(var(--markbot))] text-[hsl(var(--markbot-foreground))] hover:bg-[hsl(var(--markbot))]/90">
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">Questions are logged to improve answers.</p>
          </div>
        </SheetContent>
      </Sheet>

      {profile && (
        <CandidateProfileDialog open={!!profile} onOpenChange={(o) => !o && setProfile(null)}
          applicantId={profile.id} applicantName={profile.name} />
      )}
    </>
  );
}
