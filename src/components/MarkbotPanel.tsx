import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sparkles, Plus, X, Send, Lock, ThumbsUp, ThumbsDown, Loader2, Clock, ArrowLeft, Trash2, Square, Pencil } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CandidateProfileDialog } from '@/components/CandidateProfileDialog';
import type { TabId } from '@/hooks/useTabPermissions';
import { cn } from '@/lib/utils';

// Renders assistant markdown in the narrow panel: tight spacing, small headings, one-line list items.
function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em>{children}</em>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer" className="underline text-[hsl(var(--markbot))]">{children}</a>
        ),
        ul: ({ children }) => <ul className="my-1.5 pl-4 list-disc space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="my-1.5 pl-4 list-decimal space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="my-0.5">{children}</li>,
        h1: ({ children }) => <div className="font-semibold text-[13.5px] mt-3 mb-1 first:mt-0">{children}</div>,
        h2: ({ children }) => <div className="font-semibold text-[13.5px] mt-3 mb-1 first:mt-0">{children}</div>,
        h3: ({ children }) => <div className="font-semibold text-[13px] mt-3 mb-1 first:mt-0">{children}</div>,
        h4: ({ children }) => <div className="font-semibold text-[12.5px] mt-3 mb-1 first:mt-0">{children}</div>,
        hr: () => <hr className="my-2 border-border" />,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-border pl-2 my-1.5 text-muted-foreground">{children}</blockquote>
        ),
        code: ({ children }) => <code className="bg-muted px-1 py-0.5 rounded text-[11.5px]">{children}</code>,
        table: ({ children }) => (
          <div className="overflow-x-auto my-1.5">
            <table className="text-[11.5px]">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="text-left font-semibold px-2 py-1 border-b border-border">{children}</th>,
        td: ({ children }) => <td className="px-2 py-1 border-b border-border/50 align-top">{children}</td>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

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
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<{ id: string; name: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<{ id: string; title: string | null; updated_at: string | null }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string | null } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const loadedOnce = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestRef = useRef<{ id: number; abort: AbortController; question: string; msgId: string } | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open && !loading) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, loading]);

  const toastError = (title: string, e: unknown) =>
    toast({ title, description: e instanceof Error ? e.message : (e as any)?.message ?? 'Something went wrong', variant: 'destructive' });

  const loadConversation = async (id: string) => {
    setRestoring(true);
    try {
      const [{ data: conv, error: cErr }, { data: rows, error: mErr }] = await Promise.all([
        supabase.from('markbot_conversations').select('id, context').eq('id', id).maybeSingle(),
        supabase.from('markbot_messages').select('id, role, content, sources, blocked, log_id, rating')
          .eq('conversation_id', id).order('created_at', { ascending: true }),
      ]);
      if (cErr) throw cErr;
      if (mErr) throw mErr;
      if (!conv) throw new Error('Conversation not found');
      setConversationId(conv.id);
      setContext((conv.context as Record<string, unknown>) ?? null);
      setMessages((rows ?? []).map((r: any) => ({
        id: r.id, role: r.role, content: r.content,
        sources: (r.sources as MarkbotSource[]) ?? [], blocked: !!r.blocked,
        logId: r.log_id, rating: r.rating === 1 || r.rating === -1 ? r.rating : null,
      })));
      setShowHistory(false);
    } catch (e) {
      toastError('Could not open conversation', e);
    } finally {
      setRestoring(false);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('markbot_conversations').select('id, title, updated_at')
      .eq('admin_user_id', user?.id ?? '').order('updated_at', { ascending: false }).limit(100);
    setHistoryLoading(false);
    if (error) { toastError('Could not load history', error); return []; }
    setConversations(data ?? []);
    return data ?? [];
  };

  // On first open, restore the most recent conversation
  useEffect(() => {
    if (!open || loadedOnce.current) return;
    loadedOnce.current = true;
    loadHistory().then((list) => { if (list[0] && messages.length === 0) loadConversation(list[0].id); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const startNewChat = () => {
    setMessages([]); setContext(null); setConversationId(null); setInput(''); setShowHistory(false);
    inputRef.current?.focus();
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    const { error } = await supabase.from('markbot_conversations').delete().eq('id', id);
    if (error) { toastError('Could not delete conversation', error); return; }
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === conversationId) { setMessages([]); setContext(null); setConversationId(null); }
  };

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || loading) return;
    const msgId = newId();
    const history = [...messages, { id: msgId, role: 'user' as const, content: question }];
    setMessages(history);
    setInput('');
    setLoading(true);
    const req = { id: Date.now(), abort: new AbortController(), question, msgId };
    requestRef.current = req;
    const isCurrent = () => requestRef.current?.id === req.id;
    try {
      const { data, error } = await supabase.functions.invoke('markbot-chat', {
        body: { messages: history.map((m) => ({ role: m.role, content: m.content })), context, conversation_id: conversationId },
        signal: req.abort.signal,
      } as any);
      if (!isCurrent()) return;
      if (error) {
        let msg = error.message;
        try {
          const body = await (error as any).context?.json?.();
          if (body?.error) msg = typeof body.error === 'string' ? body.error : msg;
        } catch { /* keep default */ }
        throw new Error(msg);
      }
      if (data?.context) setContext(data.context);
      if (data?.conversation_id) setConversationId(data.conversation_id);
      loadedOnce.current = true;
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
      if (!isCurrent()) return;
      toast({ title: 'Markbot AI', description: e instanceof Error ? e.message : 'Something went wrong', variant: 'destructive' });
    } finally {
      if (isCurrent()) { requestRef.current = null; setLoading(false); }
    }
  };

  // Stop: drop the pending answer and put the question back in the box for editing.
  const stop = () => {
    const req = requestRef.current;
    if (!req) return;
    requestRef.current = null;
    req.abort.abort();
    setMessages((prev) => prev.filter((m) => m.id !== req.msgId));
    setInput(req.question);
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Edit: load a previous question into the box and drop it and everything after it from view.
  const editMessage = (id: string) => {
    if (loading) return;
    const idx = messages.findIndex((m) => m.id === id);
    if (idx < 0) return;
    setInput(messages[idx].content);
    setMessages(messages.slice(0, idx));
    setTimeout(() => inputRef.current?.focus(), 50);
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
                onClick={startNewChat} disabled={loading}>
                <Plus className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className={cn('h-7 w-7', showHistory && 'bg-muted')} title="History" aria-label="History"
                onClick={() => { if (!showHistory) loadHistory(); setShowHistory((v) => !v); }} disabled={loading}>
                <Clock className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Close" aria-label="Close" onClick={() => onOpenChange(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {showHistory ? (
            <div className="flex-1 overflow-y-auto">
              <div className="flex items-center gap-2 px-3 py-2 border-b">
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Back to chat" title="Back to chat" onClick={() => setShowHistory(false)}>
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <span className="text-[12.5px] font-medium">Conversation history</span>
              </div>
              {historyLoading ? (
                <div className="flex items-center gap-2 px-4 py-4 text-[12.5px] text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                </div>
              ) : conversations.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">No saved conversations yet.</p>
              ) : (
                <ul className="divide-y">
                  {conversations.map((c) => (
                    <li key={c.id} className={cn('flex items-center gap-2 px-3 py-2 hover:bg-muted/60', c.id === conversationId && 'bg-muted/40')}>
                      <button type="button" className="flex-1 min-w-0 text-left" onClick={() => loadConversation(c.id)} disabled={restoring}>
                        <div className="truncate text-[12.5px]">{c.title || 'Untitled conversation'}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {c.updated_at ? formatDistanceToNow(new Date(c.updated_at), { addSuffix: true }) : ''}
                        </div>
                      </button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label="Delete conversation" title="Delete" onClick={() => setPendingDelete(c)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {restoring && messages.length === 0 && (
              <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading conversation…
              </div>
            )}
            {messages.length === 0 && !restoring && (
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
                <div key={m.id} className="group flex justify-end items-center gap-1">
                  {!loading && (
                    <Button variant="ghost" size="icon" aria-label="Edit question" title="Edit question"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => editMessage(m.id)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                  )}
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
                    <div className="max-w-[95%] text-[12.5px] leading-relaxed">
                      <MarkdownContent content={m.content} />
                    </div>
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
          )}

          <div className="border-t px-4 pt-3 pb-2">
            <div className="flex items-end gap-2">
              <Textarea ref={inputRef} value={input} rows={1} placeholder="Ask Markbot AI…" disabled={loading}
                className="min-h-[38px] max-h-32 resize-none text-[12.5px]"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
                }} />
              {loading ? (
              <Button size="icon" aria-label="Stop" title="Stop and edit" onClick={stop}
                className="h-[38px] w-[38px] shrink-0 bg-destructive text-destructive-foreground hover:bg-destructive/90">
                <Square className="w-3.5 h-3.5 fill-current" />
              </Button>
              ) : (
              <Button size="icon" aria-label="Send" disabled={!input.trim()} onClick={() => send(input)}
                className="h-[38px] w-[38px] shrink-0 bg-[hsl(var(--markbot))] text-[hsl(var(--markbot-foreground))] hover:bg-[hsl(var(--markbot))]/90">
                <Send className="w-4 h-4" />
              </Button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">Questions are logged to improve answers.</p>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDelete?.title || 'Untitled conversation'}" will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {profile && (
        <CandidateProfileDialog open={!!profile} onOpenChange={(o) => !o && setProfile(null)}
          applicantId={profile.id} applicantName={profile.name} />
      )}
    </>
  );
}
