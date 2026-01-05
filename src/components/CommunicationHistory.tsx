import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useEmailLogs, useScheduledEmails, EmailLog, ScheduledEmail } from '@/hooks/useEmailTemplates';
import { formatDistanceToNow, format } from 'date-fns';
import { 
  Mail, Clock, CheckCircle, XCircle, AlertTriangle, 
  Loader2, Send, Ban, Calendar, ChevronDown, ChevronUp 
} from 'lucide-react';

interface CommunicationHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicantId: string;
  applicantName: string;
}

export function CommunicationHistory({ 
  open, 
  onOpenChange, 
  applicantId,
  applicantName 
}: CommunicationHistoryProps) {
  const { logs, loading: logsLoading, fetchLogs } = useEmailLogs(applicantId);
  const { scheduledEmails, loading: scheduledLoading, cancelScheduledEmail, fetchScheduledEmails } = useScheduledEmails(applicantId);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const handleCancel = async (id: string) => {
    setCancelingId(id);
    await cancelScheduledEmail(id);
    setCancelingId(null);
    fetchLogs();
    fetchScheduledEmails();
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

  const loading = logsLoading || scheduledLoading;

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

              {/* Email History */}
              <div className="space-y-3">
                <h3 className="font-medium flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email History
                </h3>

                {logs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Mail className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p>No emails sent yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {logs.map((log) => (
                      <div 
                        key={log.id}
                        className="border rounded-lg overflow-hidden"
                      >
                        <button
                          onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                          className="w-full text-left p-4 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                              {getStatusIcon(log.status)}
                              <div>
                                <p className="font-medium">{log.subject}</p>
                                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                                  <span>To: {log.recipient_email}</span>
                                  {log.is_automated && (
                                    <Badge variant="outline" className="text-xs">Auto</Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {getStatusBadge(log.status)}
                              {expandedLog === log.id ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            {log.sent_at 
                              ? format(new Date(log.sent_at), 'PPP p')
                              : format(new Date(log.created_at), 'PPP p')
                            }
                            {log.applicant_status_at_send && (
                              <span> • Status: {log.applicant_status_at_send}</span>
                            )}
                          </p>
                        </button>

                        {expandedLog === log.id && (
                          <div className="border-t bg-muted/30 p-4">
                            <div className="prose prose-sm max-w-none dark:prose-invert">
                              <div dangerouslySetInnerHTML={{ __html: log.body_html }} />
                            </div>
                            {log.error_message && (
                              <div className="mt-3 flex items-start gap-2 text-sm text-red-600">
                                <AlertTriangle className="h-4 w-4 mt-0.5" />
                                <span>Error: {log.error_message}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
