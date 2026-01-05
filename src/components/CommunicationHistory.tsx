import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useEmailLogs, useScheduledEmails, useEmailReplies, EmailLog, ScheduledEmail, EmailReply } from '@/hooks/useEmailTemplates';
import { formatDistanceToNow, format } from 'date-fns';
import { 
  Mail, Clock, CheckCircle, XCircle, AlertTriangle, 
  Loader2, Send, Ban, Calendar, ChevronDown, ChevronUp,
  Reply, RefreshCw, Inbox, MessageSquare
} from 'lucide-react';

interface CommunicationHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicantId: string;
  applicantName: string;
}

interface EmailThread {
  sentEmail: EmailLog;
  replies: EmailReply[];
}

export function CommunicationHistory({ 
  open, 
  onOpenChange, 
  applicantId,
  applicantName 
}: CommunicationHistoryProps) {
  const { logs, loading: logsLoading, fetchLogs } = useEmailLogs(applicantId);
  const { scheduledEmails, loading: scheduledLoading, cancelScheduledEmail, fetchScheduledEmails } = useScheduledEmails(applicantId);
  const { replies, loading: repliesLoading, fetching, fetchReplies, fetchNewReplies } = useEmailReplies(applicantId);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [expandedReply, setExpandedReply] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  // Group replies under their parent sent emails as threads
  const { threads, orphanReplies } = useMemo(() => {
    const threadMap = new Map<string, EmailThread>();
    const matchedReplyIds = new Set<string>();

    // Initialize threads with sent emails (only successful ones)
    logs
      .filter(log => log.status === 'sent')
      .forEach(log => {
        threadMap.set(log.id, { sentEmail: log, replies: [] });
      });

    // Match replies to sent emails by subject (Re: matching)
    replies.forEach(reply => {
      // Try to match by subject - strip "Re: " prefix and compare
      const replySubjectClean = reply.subject.replace(/^(Re:\s*)+/i, '').trim().toLowerCase();
      
      // Find the matching sent email
      for (const [logId, thread] of threadMap) {
        const sentSubjectClean = thread.sentEmail.subject.trim().toLowerCase();
        if (replySubjectClean === sentSubjectClean) {
          thread.replies.push(reply);
          matchedReplyIds.add(reply.id);
          break;
        }
      }
    });

    // Orphan replies that couldn't be matched to any sent email
    const orphanReplies = replies.filter(r => !matchedReplyIds.has(r.id));

    // Convert to array and sort threads by most recent activity
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

    return { threads: threadsArray, orphanReplies };
  }, [logs, replies]);

  // Get non-sent logs (failed, canceled)
  const otherLogs = useMemo(() => 
    logs.filter(log => log.status !== 'sent'),
  [logs]);

  const handleCancel = async (id: string) => {
    setCancelingId(id);
    await cancelScheduledEmail(id);
    setCancelingId(null);
    fetchLogs();
    fetchScheduledEmails();
  };

  const handleFetchReplies = async () => {
    await fetchNewReplies();
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
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0">
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
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Clock className="h-4 w-4 text-amber-500" />
                            <span className="font-medium">{email.subject}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Scheduled for: {format(new Date(email.scheduled_for), 'PPP p')}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            ({formatDistanceToNow(new Date(email.scheduled_for), { addSuffix: true })})
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCancel(email.id)}
                          disabled={cancelingId === email.id}
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
                  ))}
                  <Separator />
                </div>
              )}

              {/* Conversation Threads Section */}
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
                  <div className="space-y-4">
                    {/* Threaded Conversations */}
                    {threads.map((thread) => (
                      <div 
                        key={thread.sentEmail.id}
                        className="border rounded-lg overflow-hidden"
                      >
                        {/* Sent Email (Thread Header) */}
                        <button
                          onClick={() => setExpandedLog(expandedLog === thread.sentEmail.id ? null : thread.sentEmail.id)}
                          className="w-full text-left p-4 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                              {getStatusIcon(thread.sentEmail.status)}
                              <div>
                                <p className="font-medium">{thread.sentEmail.subject}</p>
                                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                                  <span>To: {thread.sentEmail.recipient_email}</span>
                                  {thread.sentEmail.is_automated && (
                                    <Badge variant="outline" className="text-xs">Auto</Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {thread.replies.length > 0 && (
                                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                                  {thread.replies.length} {thread.replies.length === 1 ? 'reply' : 'replies'}
                                </Badge>
                              )}
                              {getStatusBadge(thread.sentEmail.status)}
                              {expandedLog === thread.sentEmail.id ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            {thread.sentEmail.sent_at 
                              ? format(new Date(thread.sentEmail.sent_at), 'PPP p')
                              : format(new Date(thread.sentEmail.created_at), 'PPP p')
                            }
                            {thread.sentEmail.applicant_status_at_send && (
                              <span> • Status: {thread.sentEmail.applicant_status_at_send}</span>
                            )}
                          </p>
                        </button>

                        {/* Expanded Thread Content */}
                        {expandedLog === thread.sentEmail.id && (
                          <div className="border-t">
                            {/* Original Sent Email Content */}
                            <div className="bg-muted/30 p-4">
                              <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                                <Send className="h-3 w-3" />
                                <span>Sent message</span>
                              </div>
                              <div className="prose prose-sm max-w-none dark:prose-invert break-words overflow-hidden">
                                <div 
                                  dangerouslySetInnerHTML={{ __html: thread.sentEmail.body_html }} 
                                  className="break-words overflow-hidden [&>*]:max-w-full [&_a]:break-all"
                                />
                              </div>
                              {thread.sentEmail.error_message && (
                                <div className="mt-3 flex items-start gap-2 text-sm text-red-600">
                                  <AlertTriangle className="h-4 w-4 mt-0.5" />
                                  <span>Error: {thread.sentEmail.error_message}</span>
                                </div>
                              )}
                            </div>

                            {/* Thread Replies */}
                            {thread.replies.map((reply, index) => (
                              <div 
                                key={reply.id}
                                className="border-t bg-blue-50/30 dark:bg-blue-950/10"
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedReply(expandedReply === reply.id ? null : reply.id);
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
                                          {format(new Date(reply.received_at), 'PPP p')}
                                          <span className="ml-2">
                                            ({formatDistanceToNow(new Date(reply.received_at), { addSuffix: true })})
                                          </span>
                                        </p>
                                      </div>
                                    </div>
                                    {expandedReply === reply.id ? (
                                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    )}
                                  </div>
                                </button>

                                {expandedReply === reply.id && (
                                  <div className="border-t bg-blue-50/50 dark:bg-blue-950/20 p-4">
                                    <div className="prose prose-sm max-w-none dark:prose-invert break-words overflow-hidden">
                                      {reply.body_html ? (
                                        <div 
                                          dangerouslySetInnerHTML={{ __html: reply.body_html }} 
                                          className="break-words overflow-hidden [&>*]:max-w-full [&_a]:break-all"
                                        />
                                      ) : (
                                        <p className="whitespace-pre-wrap break-words">{reply.body_text || '(No content)'}</p>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Orphan Replies (replies without matching sent email) */}
                    {orphanReplies.length > 0 && (
                      <>
                        <Separator />
                        <h4 className="font-medium text-sm flex items-center gap-2 text-muted-foreground">
                          <Inbox className="h-4 w-4" />
                          Other Replies ({orphanReplies.length})
                        </h4>
                        {orphanReplies.map((reply) => (
                          <div 
                            key={reply.id}
                            className="border border-blue-200 dark:border-blue-900 rounded-lg overflow-hidden"
                          >
                            <button
                              onClick={() => setExpandedReply(expandedReply === reply.id ? null : reply.id)}
                              className="w-full text-left p-4 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3">
                                  <Reply className="h-4 w-4 text-blue-500 mt-1" />
                                  <div>
                                    <p className="font-medium">{reply.subject}</p>
                                    <p className="text-sm text-muted-foreground">
                                      From: {reply.from_email}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                                    Reply
                                  </Badge>
                                  {expandedReply === reply.id ? (
                                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground mt-2">
                                {format(new Date(reply.received_at), 'PPP p')}
                                <span className="ml-2">
                                  ({formatDistanceToNow(new Date(reply.received_at), { addSuffix: true })})
                                </span>
                              </p>
                            </button>

                            {expandedReply === reply.id && (
                              <div className="border-t bg-blue-50/30 dark:bg-blue-950/10 p-4">
                                <div className="prose prose-sm max-w-none dark:prose-invert break-words overflow-hidden">
                                  {reply.body_html ? (
                                    <div 
                                      dangerouslySetInnerHTML={{ __html: reply.body_html }} 
                                      className="break-words overflow-hidden [&>*]:max-w-full [&_a]:break-all"
                                    />
                                  ) : (
                                    <p className="whitespace-pre-wrap break-words">{reply.body_text || '(No content)'}</p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Failed/Canceled Emails Section */}
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
                          className="border rounded-lg overflow-hidden opacity-75"
                        >
                          <div className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-3">
                                {getStatusIcon(log.status)}
                                <div>
                                  <p className="font-medium">{log.subject}</p>
                                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                                    <span>To: {log.recipient_email}</span>
                                  </div>
                                </div>
                              </div>
                              {getStatusBadge(log.status)}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              {format(new Date(log.created_at), 'PPP p')}
                            </p>
                            {log.error_message && (
                              <div className="mt-2 flex items-start gap-2 text-sm text-red-600">
                                <AlertTriangle className="h-4 w-4 mt-0.5" />
                                <span>Error: {log.error_message}</span>
                              </div>
                            )}
                          </div>
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
    </Dialog>
  );
}
