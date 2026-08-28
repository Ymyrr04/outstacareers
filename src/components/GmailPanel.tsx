import { useState, useCallback, useEffect } from "react";
import DOMPurify from "dompurify";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Mail, MailOpen, Star, Archive, Trash2, RefreshCw, Send, Inbox, Search, Loader2, StarOff, Link2, Unlink, Paperclip, ArrowLeft, X, Reply, Forward, Smile } from "lucide-react";

interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
}

interface MessageMeta {
  id: string;
  threadId?: string;
  snippet?: string;
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  unread?: boolean;
  starred?: boolean;
  labelIds?: string[];
}

interface FullMessage {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  body: string;
  isHtml: boolean;
  attachments: { filename: string; mimeType: string; size: number; attachmentId: string }[];
  unread: boolean;
  starred: boolean;
  labelIds: string[];
}

type Folder = "INBOX" | "SENT" | "DRAFT" | "STARRED" | "TRASH";

const FOLDERS: { value: Folder; label: string; icon: typeof Inbox }[] = [
  { value: "INBOX", label: "Inbox", icon: Inbox },
  { value: "STARRED", label: "Starred", icon: Star },
  { value: "SENT", label: "Sent", icon: Send },
  { value: "DRAFT", label: "Drafts", icon: Mail },
  { value: "TRASH", label: "Trash", icon: Trash2 },
];

function parseFrom(from: string): { name: string; email: string } {
  const match = from.match(/^(.*?)\s*<(.+)>$/);
  if (match) return { name: match[1].trim().replace(/"/g, ""), email: match[2] };
  return { name: "", email: from };
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const isThisYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(isThisYear ? {} : { year: "numeric" }) });
}

export default function GmailPanel() {
  const { toast } = useToast();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<GmailProfile | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [messages, setMessages] = useState<MessageMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [folder, setFolder] = useState<Folder>("INBOX");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [pageToken, setPageToken] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<FullMessage | null>(null);
  const [messageLoading, setMessageLoading] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyState, setReplyState] = useState<null | { mode: "reply" | "forward"; to: string; subject: string; body: string }>(null);
  const [reactions, setReactions] = useState<Record<string, string>>({});
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("gmail-status", {
        body: { action: "status" },
      });
      if (error) throw error;
      setConnected(data.connected);
      setProfile(data.profile || null);
      if (data.connected && data.error) {
        toast({ title: "Gmail unavailable", description: data.error, variant: "destructive" });
      }
    } catch (err: any) {
      setConnected(false);
    }
  }, [toast]);


  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const popup = window.open("", "lovable-gmail-oauth", "width=600,height=720");
      if (!popup) throw new Error("Popup blocked. Allow popups and try again.");
      const { data, error } = await supabase.functions.invoke("gmail-oauth-start", {
        body: { origin: window.location.origin },
      });
      if (error) throw await getFunctionError(error, "Could not start Gmail connection.");
      const completion = waitForOAuthCode(popup);
      popup.location.href = data.authorizationUrl;
      const code = await completion;
      const { error: completeError } = await supabase.functions.invoke("gmail-oauth-complete", {
        body: { code },
      });
      if (completeError) throw await getFunctionError(completeError, "Could not finish Gmail connection.");
      await checkStatus();

      toast({ title: "Gmail connected", description: "Your inbox is now available." });
    } catch (err: any) {
      toast({ title: "Connection failed", description: err?.message ?? "Could not connect Gmail.", variant: "destructive" });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await supabase.functions.invoke("gmail-status", { body: { action: "disconnect" } });
      setConnected(false);
      setProfile(null);
      setMessages([]);
      setSelectedMessage(null);
      toast({ title: "Gmail disconnected" });
    } catch (err: any) {
      toast({ title: "Disconnect failed", description: err?.message, variant: "destructive" });
    }
  };

  const fetchMessages = useCallback(async (reset = true) => {
    if (!connected) return;
    setLoading(true);
    try {
      const params: any = { maxResults: 25 };
      if (search) params.q = search;
      if (folder === "INBOX") params.labelIds = "INBOX";
      else if (folder === "STARRED") params.labelIds = "STARRED";
      else if (folder === "SENT") params.labelIds = "SENT";
      else if (folder === "DRAFT") params.labelIds = "DRAFT";
      else if (folder === "TRASH") params.labelIds = "TRASH";
      if (!reset && pageToken) params.pageToken = pageToken;

      const { data, error } = await supabase.functions.invoke("gmail-inbox", { body: params });
      if (error) throw error;
      if (reset) {
        setMessages(data.messages || []);
      } else {
        setMessages((prev) => [...prev, ...(data.messages || [])]);
      }
      setPageToken(data.nextPageToken || null);
    } catch (err: any) {
      if (err?.context?.status === 401) {
        setConnected(false);
      }
      toast({ title: "Failed to load messages", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [connected, search, folder, pageToken]);

  useEffect(() => {
    if (connected) fetchMessages(true);
  }, [connected, folder, search]); // eslint-disable-line react-hooks/exhaustive-deps

  const openMessage = async (msg: MessageMeta) => {
    setMessageLoading(true);
    setSelectedMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke("gmail-message", { body: { messageId: msg.id } });
      if (error) throw error;
      setSelectedMessage(data);
      // Mark as read if it was unread
      if (msg.unread) {
        await supabase.functions.invoke("gmail-action", { body: { action: "mark-read", messageId: msg.id } });
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, unread: false } : m)));
      }
    } catch (err: any) {
      toast({ title: "Failed to load message", description: err?.message, variant: "destructive" });
    } finally {
      setMessageLoading(false);
    }
  };

  const handleAction = async (action: string, messageId: string) => {
    try {
      await supabase.functions.invoke("gmail-action", { body: { action, messageId } });
      if (action === "archive" || action === "trash") {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        if (selectedMessage?.id === messageId) setSelectedMessage(null);
      } else if (action === "star" || action === "unstar") {
        const starred = action === "star";
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, starred } : m)));
        if (selectedMessage?.id === messageId) setSelectedMessage({ ...selectedMessage, starred });
      }
      toast({ title: "Done" });
    } catch (err: any) {
      toast({ title: "Action failed", description: err?.message, variant: "destructive" });
    }
  };

  const handleSend = async (to: string, cc: string, subject: string, body: string) => {
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("gmail-send", { body: { to, cc, subject, body } });
      if (error) throw error;
      toast({ title: "Email sent" });
      setComposeOpen(false);
    } catch (err: any) {
      toast({ title: "Send failed", description: err?.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  // --- Not connected state ---
  if (connected === null) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-16 h-16 rounded-full bg-cyan-50 flex items-center justify-center">
          <Mail className="w-8 h-8 text-cyan-600" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-semibold">Connect your Gmail</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Each admin connects their own Google account to read and send email directly from here.
          </p>
        </div>
        <button
          onClick={handleConnect}
          disabled={connecting}
          data-variant="primary"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-cyan-600 text-white text-xs font-medium hover:bg-cyan-700 disabled:opacity-50"
        >
          {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          {connecting ? "Connecting…" : "Connect Gmail"}
        </button>
      </div>
    );
  }

  // --- Message detail view ---
  if (selectedMessage) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedMessage(null)}
            data-variant="ghost"
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs hover:bg-muted"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex-1" />
          <button onClick={() => handleAction(selectedMessage.starred ? "unstar" : "star", selectedMessage.id)} data-variant="ghost" className="p-1.5 rounded-md hover:bg-muted">
            {selectedMessage.starred ? <Star className="w-4 h-4 text-amber-400 fill-amber-400" /> : <StarOff className="w-4 h-4 text-muted-foreground" />}
          </button>
          <button onClick={() => handleAction("archive", selectedMessage.id)} data-variant="ghost" className="p-1.5 rounded-md hover:bg-muted" title="Archive">
            <Archive className="w-4 h-4 text-muted-foreground" />
          </button>
          <button onClick={() => handleAction("trash", selectedMessage.id)} data-variant="ghost" className="p-1.5 rounded-md hover:bg-muted" title="Delete">
            <Trash2 className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="rounded-lg border border-cyan-100 bg-white p-5">
          <h2 className="text-base font-semibold mb-2">{selectedMessage.subject || "(no subject)"}</h2>
          <div className="text-xs text-muted-foreground space-y-0.5 mb-4">
            <div><span className="font-medium text-foreground">{parseFrom(selectedMessage.from).name || selectedMessage.from}</span> {parseFrom(selectedMessage.from).email && ` <${parseFrom(selectedMessage.from).email}>`}</div>
            <div>to: {selectedMessage.to}</div>
            {selectedMessage.cc && <div>cc: {selectedMessage.cc}</div>}
            <div>{selectedMessage.date && new Date(selectedMessage.date).toLocaleString()}</div>
          </div>
          <div className="border-t pt-4 text-sm">
            <MessageBody body={selectedMessage.body} isHtml={selectedMessage.isHtml} />
          </div>

          {selectedMessage.attachments.length > 0 && (
            <div className="border-t mt-4 pt-4 flex flex-wrap gap-2">
              {selectedMessage.attachments.map((a) => (
                <div key={a.attachmentId} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-muted text-xs">
                  <Paperclip className="w-3.5 h-3.5" />
                  <span className="font-medium">{a.filename}</span>
                  <span className="text-muted-foreground">{(a.size / 1024).toFixed(0)}KB</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Inbox list view ---
  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          {FOLDERS.map((f) => {
            const Icon = f.icon;
            return (
              <button
                key={f.value}
                onClick={() => setFolder(f.value)}
                data-variant={folder === f.value ? "primary" : "ghost"}
                data-size="small"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs ${folder === f.value ? "bg-cyan-600 text-white" : "hover:bg-muted text-muted-foreground"}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {f.label}
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search mail…"
            className="pl-8 pr-3 h-8 text-xs rounded-md border border-cyan-100 bg-white w-48 focus:outline-none focus:ring-2 focus:ring-cyan-50"
          />
        </form>
        <button
          onClick={() => setComposeOpen(true)}
          data-variant="primary"
          data-size="small"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-600 text-white text-xs font-medium hover:bg-cyan-700"
        >
          <Send className="w-3.5 h-3.5" /> Compose
        </button>
        <button
          onClick={() => fetchMessages(true)}
          data-variant="ghost"
          data-size="small"
          className="p-1.5 rounded-md hover:bg-muted"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Connection badge */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{profile?.emailAddress ? `Connected as ${profile.emailAddress}` : "Connected"}</span>
        <button onClick={handleDisconnect} data-variant="ghost" data-size="small" className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted">
          <Unlink className="w-3 h-3" /> Disconnect
        </button>
      </div>

      {/* Message list */}
      <div className="rounded-lg border border-cyan-100 bg-white divide-y divide-gray-50">
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <MailOpen className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">No messages</p>
          </div>
        ) : (
          messages.map((msg) => {
            const { name, email } = parseFrom(msg.from || "");
            const displayName = name || email;
            return (
              <div
                key={msg.id}
                onClick={() => openMessage(msg)}
                className={`flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-cyan-50/30 transition-colors ${msg.unread ? "font-medium" : ""}`}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); handleAction(msg.starred ? "unstar" : "star", msg.id); }}
                  className="mt-0.5 flex-shrink-0"
                >
                  {msg.starred ? <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> : <Star className="w-3.5 h-3.5 text-gray-300" />}
                </button>
                <div className="flex-shrink-0 w-32">
                  <div className={`text-xs truncate ${msg.unread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                    {folder === "SENT" ? msg.to?.split(",")[0] : displayName}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate">
                    <span className={msg.unread ? "text-foreground" : "text-muted-foreground"}>
                      {msg.subject || "(no subject)"}
                    </span>
                    <span className="text-muted-foreground/60 ml-1.5">— {msg.snippet}</span>
                  </div>
                </div>
                <div className="flex-shrink-0 text-[10px] text-muted-foreground">
                  {formatDate(msg.date || "")}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Load more */}
      {pageToken && !loading && (
        <button
          onClick={() => fetchMessages(false)}
          data-variant="ghost"
          className="w-full py-2 text-xs text-muted-foreground hover:bg-muted rounded-md"
        >
          Load more
        </button>
      )}

      {/* Compose dialog */}
      {composeOpen && (
        <ComposeDialog onClose={() => setComposeOpen(false)} onSend={handleSend} sending={sending} />
      )}
    </div>
  );
}

async function getFunctionError(error: any, fallback: string) {
  try {
    const response = error?.context;
    if (response && typeof response.clone === "function") {
      const body = await response.clone().json();
      const rawMessage = body?.error ?? body?.message;
      if (typeof rawMessage === "string" && rawMessage.trim()) {
        const gatewayMessage = rawMessage.match(/"message":"([^"]+)"/)?.[1];
        return new Error(gatewayMessage ?? rawMessage);
      }
    }
  } catch {
    // Fall through to the SDK message when the response is not JSON.
  }
  return new Error(error?.message ?? fallback);
}

function waitForOAuthCode(popup: Window) {
  return new Promise<string>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (
        event.origin !== window.location.origin ||
        event.data?.connectorId !== "google_mail" ||
        (type !== "appUserConnectorOAuthCode" && type !== "appUserConnectorOAuthFailed")
      ) return;
      cleanup();
      if (type === "appUserConnectorOAuthCode" && event.data?.code) {
        resolve(event.data.code as string);
        return;
      }
      popup.close();
      reject(new Error(event.data?.reason ?? "OAuth connection failed."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("OAuth window closed before completion."));
    }, 500);
  });
}


function ComposeDialog({ onClose, onSend, sending }: { onClose: () => void; onSend: (to: string, cc: string, subject: string, body: string) => void; sending: boolean }) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold">New message</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-2">
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" className="w-full px-3 py-1.5 text-sm border-b border-gray-100 focus:outline-none focus:border-cyan-400" />
          <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Cc" className="w-full px-3 py-1.5 text-sm border-b border-gray-100 focus:outline-none focus:border-cyan-400" />
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full px-3 py-1.5 text-sm border-b border-gray-100 focus:outline-none focus:border-cyan-400" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message…" rows={10} className="w-full px-3 py-1.5 text-sm border border-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-50 resize-none" />
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t">
          <button onClick={onClose} data-variant="ghost" className="px-3 py-1.5 text-xs rounded-md hover:bg-muted">Cancel</button>
          <button
            onClick={() => onSend(to, cc, subject, body)}
            disabled={sending || !to || !subject}
            data-variant="primary"
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-cyan-600 text-white text-xs font-medium hover:bg-cyan-700 disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBody({ body, isHtml }: { body: string; isHtml: boolean }) {
  const [showQuoted, setShowQuoted] = useState(false);

  if (isHtml) {
    const clean = DOMPurify.sanitize(body, { USE_PROFILES: { html: true }, ADD_ATTR: ["target"] });
    return (
      <div
        className="gmail-body text-sm leading-relaxed break-words [&_a]:text-cyan-600 [&_a]:underline [&_img]:max-w-full [&_img]:h-auto [&_blockquote]:border-l-2 [&_blockquote]:border-gray-200 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_table]:max-w-full [&_p]:my-2"
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    );
  }

  // Plain text: split off the quoted reply chain like Gmail does.
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  let splitAt = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (
      /^>/.test(l) ||
      /^On .+wrote:$/.test(l) ||
      /^-{2,}\s*Forwarded message/i.test(l) ||
      /^_{5,}$/.test(l)
    ) {
      splitAt = i;
      break;
    }
  }
  const main = lines.slice(0, splitAt).join("\n").trimEnd();
  const quoted = lines.slice(splitAt).join("\n").trim();

  return (
    <div className="text-sm leading-relaxed">
      <pre className="whitespace-pre-wrap break-words font-sans">{main || body}</pre>
      {quoted && (
        <div className="mt-2">
          <button
            onClick={() => setShowQuoted((v) => !v)}
            className="px-2 py-0.5 rounded bg-muted text-muted-foreground hover:bg-gray-200 text-xs leading-none"
            title={showQuoted ? "Hide quoted text" : "Show quoted text"}
          >
            •••
          </button>
          {showQuoted && (
            <pre className="mt-2 whitespace-pre-wrap break-words font-sans border-l-2 border-gray-200 pl-3 text-muted-foreground">
              {quoted.replace(/^> ?/gm, "")}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
