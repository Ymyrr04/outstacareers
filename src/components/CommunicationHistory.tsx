import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEmailLogs, useScheduledEmails, useEmailReplies, EmailLog, EmailReply } from '@/hooks/useEmailTemplates';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow, format } from 'date-fns';
import { sanitizeHtml, sanitizeEmailReply } from '@/lib/sanitize';
import { formatDateTime } from "@/lib/dateFormat";
import { 
  Mail, Clock, CheckCircle, XCircle, AlertTriangle, 
  Loader2, Send, Ban, ChevronDown, ChevronUp,
  Reply, RefreshCw, Inbox, MessageSquare, CornerUpLeft, Eye
} from 'lucide-react';

interface CommunicationHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicantId: string;
  applicantName: string;
  applicantEmail: string;
  onMarkAsRead?: (applicantId: string) => void;
}

interface EmailThread {
  sentEmail: EmailLog;
  replies: EmailReply[];
}

interface ReplyContext {
  subject: string;
  originalBody: string;
  fromEmail: string;
  receivedAt: string;
  inReplyTo?: string; // Message-ID for threading
  isFollowUp?: boolean; // Indicates this is a follow-up to our own sent email
}

// Decode MIME encoded words (RFC 2047) for display
const decodeMimeWord = (text: string): string => {
  if (!text) return text;
  
  // Match =?charset?encoding?encoded_text?= patterns
  const mimePattern = /=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g;
  
  return text.replace(mimePattern, (match, _charset, encoding, encodedText) => {
    try {
      if (encoding.toUpperCase() === 'Q') {
        // Quoted-Printable decoding
        let decoded = encodedText
          .replace(/_/g, ' ') // Underscores are spaces in Q encoding
          .replace(/=([0-9A-Fa-f]{2})/g, (_: string, hex: string) => 
            String.fromCharCode(parseInt(hex, 16))
          );
        return decoded;
      } else if (encoding.toUpperCase() === 'B') {
        // Base64 decoding
        const decoded = atob(encodedText);
        return decoded;
      }
    } catch (e) {
      console.log('MIME decode error:', e);
    }
    return match; // Return original if decode fails
  });
};

// Helper to normalize subjects for matching
const normalizeSubject = (subject: string): string => {
  // First decode any MIME encoding
  const decoded = decodeMimeWord(subject);
  return decoded
    .replace(/^(Re:\s*)+/gi, '') // Remove Re: prefixes
    .replace(/^(Fwd:\s*)+/gi, '') // Remove Fwd: prefixes
    .trim()
    .toLowerCase();
};

// Extract and normalize Message-ID tokens for reliable threading
const extractMessageIds = (value?: string | null): string[] => {
  if (!value) return [];

  const tokens = value.match(/<[^>]+>/g) ?? value.split(/\s+/);

  return tokens
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
    .map((token) => (token.startsWith('<') && token.endsWith('>') ? token : `<${token.replace(/[<>]/g, '')}>`));
};

// Convert plain text to simple HTML
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

export function CommunicationHistory({ 
  open, 
  onOpenChange, 
  applicantId,
  applicantName,
  applicantEmail,
  onMarkAsRead
}: CommunicationHistoryProps) {
  // Only pass applicantId when dialog is open to defer loading
  const effectiveApplicantId = open ? applicantId : undefined;
  
  const { logs, loading: logsLoading, fetchLogs } = useEmailLogs(effectiveApplicantId);
  const { scheduledEmails, loading: scheduledLoading, cancelScheduledEmail, fetchScheduledEmails } = useScheduledEmails(effectiveApplicantId);
  const { replies, loading: repliesLoading, fetching, fetchNewReplies } = useEmailReplies(effectiveApplicantId, applicantEmail);
  const { toast } = useToast();
  
  // Mark messages as read when dialog opens
  useEffect(() => {
    if (open && applicantId && onMarkAsRead) {
      onMarkAsRead(applicantId);
    }
  }, [open, applicantId, onMarkAsRead]);

  // Auto-sync replies in the background while this applicant is being viewed
  useEffect(() => {
    if (!open || !applicantId) return;

    const syncReplies = () => {
      void fetchNewReplies({ silent: true, priorityEmail: applicantEmail || undefined });
    };

    syncReplies();
    const intervalId = window.setInterval(syncReplies, 90000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [open, applicantId, applicantEmail, fetchNewReplies]);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  // Track which threads show just replies vs full thread
  const [showRepliesOnly, setShowRepliesOnly] = useState<Set<string>>(new Set());
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [sendingNowId, setSendingNowId] = useState<string | null>(null);
  const [previewEmail, setPreviewEmail] = useState<{ subject: string; recipient_email: string; body_html: string; scheduled_for: string } | null>(null);
  
  // Reply compose state
  const [showReplyComposer, setShowReplyComposer] = useState(false);
  const [replyContext, setReplyContext] = useState<ReplyContext | null>(null);
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const toggleThread = (id: string) => {
    setExpandedThreads(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // Also reset replies-only mode when collapsing
        setShowRepliesOnly(prev => {
          const nextReplies = new Set(prev);
          nextReplies.delete(id);
          return nextReplies;
        });
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle to show just replies (default when clicking reply badge)
  const toggleRepliesView = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedThreads(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setShowRepliesOnly(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    // Auto-expand the first reply
    const thread = threads.find(t => t.sentEmail.id === id);
    if (thread && thread.replies.length > 0) {
      setExpandedReplies(prev => {
        const next = new Set(prev);
        next.add(thread.replies[0].id);
        return next;
      });
    }
  };

  // Show full thread (toggle off replies-only mode)
  const showFullThread = (id: string) => {
    setShowRepliesOnly(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleReply = (id: string) => {
    setExpandedReplies(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Group replies under their parent sent emails as threads
  const { threads, orphanReplies, otherLogs } = useMemo(() => {
    const threadMap = new Map<string, EmailThread>();
    const threadMessageIdMap = new Map<string, string>();
    const matchedReplyIds = new Set<string>();

    // Initialize threads with sent emails only
    const sentLogs = logs.filter(log => log.status === 'sent');
    sentLogs.forEach(log => {
      threadMap.set(log.id, { sentEmail: log, replies: [] });

      extractMessageIds(log.message_id).forEach((messageId) => {
        threadMessageIdMap.set(messageId, log.id);
      });
    });

    // Match replies to sent emails by message-id first, then subject fallback
    replies.forEach(reply => {
      let matchedThread: EmailThread | undefined;

      for (const replyMessageId of extractMessageIds(reply.in_reply_to)) {
        const threadId = threadMessageIdMap.get(replyMessageId);
        if (threadId) {
          matchedThread = threadMap.get(threadId);
          break;
        }
      }

      if (!matchedThread) {
        const replySubjectNorm = normalizeSubject(reply.subject);

        for (const thread of threadMap.values()) {
          const sentSubjectNorm = normalizeSubject(thread.sentEmail.subject);

          if (
            replySubjectNorm &&
            sentSubjectNorm &&
            (replySubjectNorm === sentSubjectNorm ||
              replySubjectNorm.includes(sentSubjectNorm) ||
              sentSubjectNorm.includes(replySubjectNorm))
          ) {
            matchedThread = thread;
            break;
          }
        }
      }

      if (matchedThread) {
        matchedThread.replies.push(reply);
        matchedReplyIds.add(reply.id);
      }
    });

    // Orphan replies that couldn't be matched
    const orphanReplies = replies.filter(r => !matchedReplyIds.has(r.id));

    // Convert to array and sort by most recent activity
    const threadsArray = Array.from(threadMap.values())
      .map(thread => ({
        ...thread,
        replies: thread.replies.sort((a, b) => 
          new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
        )
      }))
      .sort((a, b) => {
        const aLatest = a.replies.length > 0 
          ? new Date(a.replies[a.replies.length - 1].received_at).getTime()
          : new Date(a.sentEmail.sent_at || a.sentEmail.created_at).getTime();
        const bLatest = b.replies.length > 0 
          ? new Date(b.replies[b.replies.length - 1].received_at).getTime()
          : new Date(b.sentEmail.sent_at || b.sentEmail.created_at).getTime();
        return bLatest - aLatest;
      });

    // Get non-sent logs
    const otherLogs = logs.filter(log => log.status !== 'sent');

    return { threads: threadsArray, orphanReplies, otherLogs };
  }, [logs, replies]);

  const handleCancel = async (id: string) => {
    setCancelingId(id);
    await cancelScheduledEmail(id);
    setCancelingId(null);
    fetchLogs();
    fetchScheduledEmails();
  };

  const handleSendNow = async (email: { id: string; subject: string; body_html: string; recipient_email: string }) => {
    setSendingNowId(email.id);
    try {
      // Send the email immediately
      const { error: sendError } = await supabase.functions.invoke('send-applicant-email', {
        body: {
          applicantId,
          subject: email.subject,
          bodyHtml: email.body_html,
          recipientEmail: email.recipient_email,
          applicantStatusAtSend: null,
          isAutomated: false,
        },
      });

      if (sendError) throw sendError;

      // Cancel the scheduled email since we've sent it
      await cancelScheduledEmail(email.id);

      toast({
        title: 'Email sent',
        description: `Email sent to ${email.recipient_email}`,
      });

      fetchLogs();
      fetchScheduledEmails();
    } catch (error: any) {
      console.error('Error sending email now:', error);
      toast({
        title: 'Failed to send',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setSendingNowId(null);
    }
  };

  const handleFetchReplies = async () => {
    await fetchNewReplies();
  };

  // Open reply composer with context from a received email
  const handleReplyToEmail = (reply: EmailReply) => {
    const subject = reply.subject.startsWith('Re:') ? reply.subject : `Re: ${reply.subject}`;
    setReplyContext({
      subject: reply.subject,
      originalBody: reply.body_text || '',
      fromEmail: reply.from_email,
      receivedAt: reply.received_at,
      inReplyTo: reply.in_reply_to || undefined,
    });
    setReplySubject(subject);
    setReplyBody('');
    setShowReplyComposer(true);
  };

  // Open reply composer for follow-up to our own sent email
  const handleFollowUp = (sentEmail: EmailLog) => {
    const subject = sentEmail.subject.startsWith('Re:') ? sentEmail.subject : `Re: ${sentEmail.subject}`;
    setReplyContext({
      subject: sentEmail.subject,
      originalBody: '',
      fromEmail: sentEmail.recipient_email,
      receivedAt: sentEmail.sent_at || sentEmail.created_at,
      inReplyTo: sentEmail.message_id || undefined,
      isFollowUp: true,
    });
    setReplySubject(subject);
    setReplyBody('');
    setShowReplyComposer(true);
  };

  // Send the reply
  const handleSendReply = async () => {
    if (!replySubject.trim() || !replyBody.trim()) {
      toast({
        title: 'Missing information',
        description: 'Please fill in subject and message',
        variant: 'destructive',
      });
      return;
    }

    setSendingReply(true);

    try {
      const { error } = await supabase.functions.invoke('send-applicant-email', {
        body: {
          applicantId,
          subject: replySubject,
          bodyHtml: plainTextToHtml(replyBody),
          recipientEmail: applicantEmail,
          applicantStatusAtSend: null,
          isAutomated: false,
          inReplyTo: replyContext?.inReplyTo || undefined, // For proper email threading
        },
      });

      if (error) throw error;

      toast({
        title: 'Reply sent',
        description: `Sent to ${applicantEmail}`,
      });

      setShowReplyComposer(false);
      setReplyContext(null);
      setReplySubject('');
      setReplyBody('');
      fetchLogs();
    } catch (error: any) {
      console.error('Error sending reply:', error);
      toast({
        title: 'Failed to send',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setSendingReply(false);
    }
  };

  const cancelReplyComposer = () => {
    setShowReplyComposer(false);
    setReplyContext(null);
    setReplySubject('');
    setReplyBody('');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'canceled':
        return <Ban className="h-4 w-4 text-muted-foreground" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-amber-500" />;
      default:
        return <Mail className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Sent</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'canceled':
        return <Badge variant="secondary">Canceled</Badge>;
      case 'pending':
        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Scheduled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const loading = logsLoading || scheduledLoading || repliesLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[88vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Communication History
          </DialogTitle>
          <DialogDescription>
            Email history for {applicantName}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
              {/* Fetch Replies Button */}
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFetchReplies}
                  disabled={fetching}
                >
                  {fetching ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Check for Replies
                </Button>
              </div>

              {/* Scheduled Emails Section */}
              {scheduledEmails.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-medium flex items-center gap-2 text-amber-600">
                    <Clock className="h-4 w-4" />
                    Pending Scheduled Emails
                  </h3>
                  {scheduledEmails.map((email) => (
                    <div 
                      key={email.id}
                      className="border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                            <span className="font-medium truncate">{email.subject}</span>
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            To: {email.recipient_email}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Scheduled on: {formatDateTime(email.created_at)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Send at: {formatDateTime(email.scheduled_for)}
                          </p>
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                            ({formatDistanceToNow(new Date(email.scheduled_for), { addSuffix: true })})
                          </p>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPreviewEmail(email as any)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Preview
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSendNow(email)}
                            disabled={sendingNowId === email.id || cancelingId === email.id}
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                          >
                            {sendingNowId === email.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Send className="h-4 w-4 mr-1" />
                                Send Now
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCancel(email.id)}
                            disabled={cancelingId === email.id || sendingNowId === email.id}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            {cancelingId === email.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Ban className="h-4 w-4 mr-1" />
                                Cancel
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <Separator />
                </div>
              )}

              {/* Conversation Threads */}
              <div className="space-y-3">
                <h3 className="font-medium flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Conversations
                </h3>

                {threads.length === 0 && orphanReplies.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Mail className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p>No conversations yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Orphan Replies - shown first and prominently */}
                    {orphanReplies.length > 0 && (
                      <div className="space-y-3 mb-4">
                        <h4 className="font-medium text-sm flex items-center gap-2 text-blue-600">
                          <Inbox className="h-4 w-4" />
                          Incoming Replies ({orphanReplies.length})
                        </h4>
                        {orphanReplies.map((reply) => {
                          const isReplyExpanded = expandedReplies.has(reply.id);
                          
                          return (
                            <div 
                              key={reply.id}
                              className="border border-blue-200 dark:border-blue-900 rounded-lg overflow-hidden"
                            >
                              <button
                                onClick={() => toggleReply(reply.id)}
                                className="w-full text-left p-4 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors"
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex items-start gap-3">
                                    <Reply className="h-4 w-4 text-blue-500 mt-1" />
                                    <div>
                                      <p className="font-medium">{decodeMimeWord(reply.subject)}</p>
                                      <p className="text-sm text-muted-foreground">
                                        From: {reply.from_email}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                                      Reply
                                    </Badge>
                                    {isReplyExpanded ? (
                                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    )}
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                  {formatDateTime(reply.received_at)}
                                  <span className="ml-2">
                                    ({formatDistanceToNow(new Date(reply.received_at), { addSuffix: true })})
                                  </span>
                                </p>
                              </button>

                              {isReplyExpanded && (
                                <div className="border-t bg-blue-50/30 dark:bg-blue-950/10 p-4">
                                  <div className="prose prose-sm max-w-none dark:prose-invert break-words overflow-hidden">
                                    {reply.body_html ? (
                                      <div 
                                        dangerouslySetInnerHTML={{ __html: sanitizeEmailReply(reply.body_html) }} 
                                        className="break-words overflow-hidden [&>*]:max-w-full [&_a]:break-all"
                                      />
                                    ) : (
                                      <p className="whitespace-pre-wrap break-words">{sanitizeEmailReply(reply.body_text || '') || '(No content)'}</p>
                                    )}
                                  </div>
                                  <div className="mt-3 pt-3 border-t flex justify-end">
                                    <Button
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleReplyToEmail(reply);
                                      }}
                                    >
                                      <CornerUpLeft className="h-4 w-4 mr-1.5" />
                                      Reply
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {threads.length > 0 && <Separator />}
                      </div>
                    )}

                    {/* Sent Email Threads */}
                    {threads.map((thread) => {
                      const isExpanded = expandedThreads.has(thread.sentEmail.id);
                      const hasReplies = thread.replies.length > 0;
                      const isRepliesOnly = showRepliesOnly.has(thread.sentEmail.id);
                      
                      return (
                        <div 
                          key={thread.sentEmail.id}
                          className="border rounded-lg overflow-hidden"
                        >
                          {/* Thread Header - Sent Email */}
                          <button
                            onClick={() => toggleThread(thread.sentEmail.id)}
                            className="w-full text-left p-4 hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-3 min-w-0 flex-1">
                                <Send className="h-4 w-4 text-green-500 mt-1 shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium truncate">{thread.sentEmail.subject}</p>
                                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
                                    <span className="truncate">To: {thread.sentEmail.recipient_email}</span>
                                    {thread.sentEmail.is_automated && (
                                      <Badge variant="outline" className="text-xs shrink-0">Auto</Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {hasReplies && (
                                  <Badge 
                                    className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                                    onClick={(e) => toggleRepliesView(thread.sentEmail.id, e)}
                                  >
                                    {thread.replies.length} {thread.replies.length === 1 ? 'reply' : 'replies'}
                                  </Badge>
                                )}
                                {getStatusBadge(thread.sentEmail.status)}
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              {thread.sentEmail.sent_at 
                                ? formatDateTime(thread.sentEmail.sent_at)
                                : formatDateTime(thread.sentEmail.created_at)
                              }
                            </p>
                          </button>

                          {/* Expanded Thread Content */}
                          {isExpanded && (
                            <div className="border-t">
                              {/* Show "View full thread" button when in replies-only mode */}
                              {isRepliesOnly && (
                                <div className="bg-muted/20 px-4 py-2 border-b flex items-center justify-between">
                                  <span className="text-sm text-muted-foreground">
                                    Showing {thread.replies.length} {thread.replies.length === 1 ? 'reply' : 'replies'}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => showFullThread(thread.sentEmail.id)}
                                  >
                                    <Mail className="h-4 w-4 mr-1.5" />
                                    View full thread
                                  </Button>
                                </div>
                              )}

                              {/* Original Sent Email - only show when not in replies-only mode */}
                              {!isRepliesOnly && (
                                <div className="bg-muted/30 p-4">
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                      <Send className="h-3 w-3" />
                                      <span>Sent message</span>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleFollowUp(thread.sentEmail);
                                      }}
                                    >
                                      <CornerUpLeft className="h-4 w-4 mr-1.5" />
                                      Follow up
                                    </Button>
                                  </div>
                                  <div className="prose prose-sm max-w-none dark:prose-invert break-words overflow-hidden">
                                    <div 
                                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(thread.sentEmail.body_html) }} 
                                      className="break-words overflow-hidden [&>*]:max-w-full [&_a]:break-all"
                                    />
                                  </div>
                                </div>
                              )}

                              {/* Replies in Thread */}
                              {thread.replies.map((reply) => {
                                const isReplyExpanded = expandedReplies.has(reply.id);
                                
                                return (
                                  <div 
                                    key={reply.id}
                                    className="border-t bg-blue-50/30 dark:bg-blue-950/10"
                                  >
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleReply(reply.id);
                                      }}
                                      className="w-full text-left p-4 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors"
                                    >
                                      <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-start gap-3">
                                          <Reply className="h-4 w-4 text-blue-500 mt-0.5" />
                                          <div>
                                            <div className="flex items-center gap-2">
                                              <span className="font-medium text-sm">Reply from applicant</span>
                                              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-xs">
                                                Reply
                                              </Badge>
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">
                                              {formatDateTime(reply.received_at)}
                                              <span className="ml-2">
                                                ({formatDistanceToNow(new Date(reply.received_at), { addSuffix: true })})
                                              </span>
                                            </p>
                                          </div>
                                        </div>
                                        {isReplyExpanded ? (
                                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                        ) : (
                                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                        )}
                                      </div>
                                    </button>

                                    {isReplyExpanded && (
                                      <div className="border-t bg-blue-50/50 dark:bg-blue-950/20 p-4">
                                        <div className="prose prose-sm max-w-none dark:prose-invert break-words overflow-hidden">
                                          {reply.body_html ? (
                                            <div 
                                              dangerouslySetInnerHTML={{ __html: sanitizeEmailReply(reply.body_html) }} 
                                              className="break-words overflow-hidden [&>*]:max-w-full [&_a]:break-all"
                                            />
                                          ) : (
                                            <p className="whitespace-pre-wrap break-words">{sanitizeEmailReply(reply.body_text || '') || '(No content)'}</p>
                                          )}
                                        </div>
                                        <div className="mt-3 pt-3 border-t flex justify-end">
                                          <Button
                                            size="sm"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleReplyToEmail(reply);
                                            }}
                                          >
                                            <CornerUpLeft className="h-4 w-4 mr-1.5" />
                                            Reply
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Failed/Canceled Emails */}
              {otherLogs.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="font-medium flex items-center gap-2 text-muted-foreground">
                      <AlertTriangle className="h-4 w-4" />
                      Failed / Canceled Emails
                    </h3>
                    <div className="space-y-2">
                      {otherLogs.map((log) => (
                        <div 
                          key={log.id}
                          className="border rounded-lg overflow-hidden opacity-75 p-4"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                              {getStatusIcon(log.status)}
                              <div>
                                <p className="font-medium">{log.subject}</p>
                                <p className="text-sm text-muted-foreground">To: {log.recipient_email}</p>
                              </div>
                            </div>
                            {getStatusBadge(log.status)}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            {formatDateTime(log.created_at)}
                          </p>
                          {log.error_message && (
                            <div className="mt-2 flex items-start gap-2 text-sm text-red-600">
                              <AlertTriangle className="h-4 w-4 mt-0.5" />
                              <span>Error: {log.error_message}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>

      {/* Reply Composer Dialog */}
      <Dialog open={showReplyComposer} onOpenChange={(open) => !open && cancelReplyComposer()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CornerUpLeft className="h-5 w-5" />
              {replyContext?.isFollowUp ? 'Follow up' : 'Reply to'} {applicantName}
            </DialogTitle>
            <DialogDescription>
              {replyContext?.isFollowUp ? 'Following up on' : 'Replying to'}: {applicantEmail}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Original context */}
            {replyContext && (
              <div className="p-3 bg-muted/50 rounded-md text-sm space-y-1">
                <p className="text-muted-foreground">
                  <span className="font-medium">Original subject:</span> {replyContext.subject}
                </p>
                <p className="text-muted-foreground text-xs">
                  {replyContext.isFollowUp ? 'Sent' : 'Received'} {formatDateTime(replyContext.receivedAt)}
                </p>
              </div>
            )}

            {/* Subject */}
            <div className="space-y-1.5">
              <Label className="text-sm">Subject</Label>
              <Input
                value={replySubject}
                onChange={(e) => setReplySubject(e.target.value)}
                placeholder="Email subject..."
              />
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <Label className="text-sm">Message</Label>
              <Textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Write your reply...&#10;&#10;URLs will automatically become clickable links."
                className="min-h-[150px] resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Links will be clickable in the sent email.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button variant="outline" size="sm" onClick={cancelReplyComposer}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSendReply} disabled={sendingReply}>
              {sendingReply ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-4 w-4" />
              )}
              Send Reply
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Scheduled Email Preview */}
      <Dialog open={!!previewEmail} onOpenChange={(o) => !o && setPreviewEmail(null)}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              {previewEmail?.subject}
            </DialogTitle>
            <DialogDescription>
              To: {previewEmail?.recipient_email}
              {previewEmail?.scheduled_for && (
                <> · Sends {formatDateTime(previewEmail.scheduled_for)}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 max-h-[65vh]">
            <div
              className="prose prose-sm dark:prose-invert max-w-none rounded-md border p-4 bg-background"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewEmail?.body_html || '<p>No content</p>') }}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </Dialog>

  );
}
