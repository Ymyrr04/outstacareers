import { useState, useCallback, useEffect, useRef } from "react";
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

interface ThreadMessage extends FullMessage {
  messageIdHeader?: string;
  references?: string;
  internalDate?: number | null;
}

const AVATAR_COLORS = ["#0ABEDF", "#7C5CFF", "#F2994A", "#27AE60", "#EB5757", "#2D9CDB", "#BB6BD9"];
function avatarStyle(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return { backgroundColor: AVATAR_COLORS[h % AVATAR_COLORS.length] };
}
function initialsOf(name: string, email: string) {
  const src = (name || email || "?").trim();
  const parts = src.split(/[\s.@]+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
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
  const [polling, setPolling] = useState(false);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [thread, setThread] = useState<ThreadMessage[] | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const lastFetchedAtRef = useRef<Date>(new Date());
  const knownIdsRef = useRef<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement | null>(null);


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

  // ---------- Supabase email cache ----------
  const adminEmail = profile?.emailAddress?.toLowerCase() || "";

  const rowToMeta = (r: any): MessageMeta => ({
    id: r.id,
    threadId: r.thread_id || undefined,
    snippet: r.snippet || undefined,
    from: r.sender_name ? `${r.sender_name} <${r.sender_email || ""}>` : r.sender_email || undefined,
    to: r.recipient_email || undefined,
    subject: r.subject || undefined,
    date: r.internal_date || undefined,
    unread: !r.is_read,
    starred: (r.label_ids || []).includes("STARRED"),
    labelIds: r.label_ids || [],
  });

  const metaToRow = (m: MessageMeta) => {
    const { name, email } = parseFrom(m.from || "");
    return {
      id: m.id,
      admin_email: adminEmail,
      thread_id: m.threadId || null,
      subject: m.subject || null,
      sender_name: name || null,
      sender_email: email || null,
      recipient_email: m.to || null,
      snippet: m.snippet || null,
      is_read: !m.unread,
      is_starred: !!m.starred,
      is_archived: false,
      label_ids: m.labelIds || null,
      internal_date: m.date ? new Date(m.date).toISOString() : null,
      fetched_at: new Date().toISOString(),
    };
  };

  const cacheMessages = useCallback(async (list: MessageMeta[]) => {
    if (!adminEmail || !list.length) return;
    try {
      await supabase.from("cached_emails" as any).upsert(list.map(metaToRow), { onConflict: "admin_email,id" });
    } catch { /* cache is best-effort */ }
  }, [adminEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadCachedList = useCallback(async (): Promise<MessageMeta[]> => {
    if (!adminEmail) return [];
    try {
      const { data } = await supabase
        .from("cached_emails" as any)
        .select("*")
        .eq("admin_email", adminEmail)
        .eq("is_archived", false)
        .contains("label_ids", [folder])
        .order("internal_date", { ascending: false })
        .limit(25);
      return ((data as any[]) || []).map(rowToMeta);
    } catch {
      return [];
    }
  }, [adminEmail, folder]);

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
      cacheMessages(data.messages || []);
    } catch (err: any) {
      if (err?.context?.status === 401) {
        setConnected(false);
      }
      toast({ title: "Failed to load messages", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [connected, search, folder, pageToken, cacheMessages]);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    (async () => {
      // Instant load from cache, then refresh from Gmail in the background
      if (!search) {
        const cached = await loadCachedList();
        if (!cancelled && cached.length) setMessages(cached);
      }
      if (!cancelled) fetchMessages(true);
    })();
    return () => { cancelled = true; };
  }, [connected, folder, search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Daily cache refresh for the most recent 50 emails
  useEffect(() => {
    if (!connected || !adminEmail) return;
    const refresh = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("gmail-inbox", {
          body: { maxResults: 50, labelIds: "INBOX" },
        });
        if (error) throw error;
        await cacheMessages(data.messages || []);
      } catch { /* silent */ }
    };
    const key = `gmail-cache-refresh:${adminEmail}`;
    const last = Number(localStorage.getItem(key) || 0);
    if (Date.now() - last > 24 * 60 * 60 * 1000) {
      refresh().then(() => localStorage.setItem(key, String(Date.now())));
    }
    const interval = setInterval(() => {
      refresh().then(() => localStorage.setItem(key, String(Date.now())));
    }, 24 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [connected, adminEmail, cacheMessages]);


  // --- Background polling for new mail (does not touch existing fetch logic) ---
  const pollMessages = useCallback(async () => {
    if (!connected || folder !== "INBOX" || search) return;
    setPolling(true);
    try {
      const { data, error } = await supabase.functions.invoke("gmail-inbox", {
        body: { maxResults: 25, labelIds: "INBOX" },
      });
      if (error) throw error;
      const incoming: MessageMeta[] = data.messages || [];
      if (!incoming.length) return;
      setTokenExpired(false);

      const known = knownIdsRef.current;
      const fresh = incoming.filter((m) => !known.has(m.id));
      const lastAt = lastFetchedAtRef.current;
      const newerThanLastFetch = fresh.filter((m) => {
        if (!m.date) return true;
        const t = new Date(m.date).getTime();
        return isNaN(t) ? true : t >= lastAt.getTime() - 60000;
      });

      if (fresh.length) {
        setMessages((prev) => {
          const map = new Map(prev.map((m) => [m.id, m]));
          incoming.forEach((m) => map.set(m.id, { ...(map.get(m.id) || {}), ...m }));
          const merged = Array.from(map.values());
          const order = new Map(incoming.map((m, i) => [m.id, i]));
          merged.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
          return merged;
        });
        const count = newerThanLastFetch.length || fresh.length;
        toast({
          title: `${count} new email${count > 1 ? "s" : ""}`,
          className: "bg-[#0ABEDF] text-white border-0",
        });
        listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }
      incoming.forEach((m) => known.add(m.id));
      lastFetchedAtRef.current = new Date();
      cacheMessages(incoming);

    } catch (err: any) {
      // Silent failure — retry on next interval
      if (err?.context?.status === 401) setTokenExpired(true);
    } finally {
      setPolling(false);
    }
  }, [connected, folder, search, toast, cacheMessages]);

  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => { pollMessages(); }, 60000);
    return () => clearInterval(interval);
  }, [connected, pollMessages]);

  // Track known ids from any fetch so polling only flags genuinely new mail
  useEffect(() => {
    messages.forEach((m) => knownIdsRef.current.add(m.id));
  }, [messages]);

  // Publish unread count for the Inbox nav badge
  useEffect(() => {
    if (folder !== "INBOX") return;
    const count = messages.filter((m) => m.unread).length;
    window.dispatchEvent(new CustomEvent("gmail-unread-count", { detail: count }));
  }, [messages, folder]);


  const updateCache = useCallback(async (messageId: string, patch: Record<string, any>) => {
    if (!adminEmail) return;
    try {
      await supabase.from("cached_emails" as any).update(patch).eq("admin_email", adminEmail).eq("id", messageId);
    } catch { /* best-effort */ }
  }, [adminEmail]);

  const loadThread = useCallback(async (threadId?: string, anchorId?: string) => {
    if (!threadId) return;
    setThreadLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("gmail-thread", { body: { threadId } });
      if (error) throw error;
      const msgs: ThreadMessage[] = data?.messages || [];
      if (!msgs.length) return;
      setThread(msgs);
      const latest = msgs[msgs.length - 1];
      setExpandedIds(new Set([anchorId && msgs.some((m) => m.id === anchorId) ? anchorId : latest.id]));
    } catch {
      /* fall back to single-message view */
    } finally {
      setThreadLoading(false);
    }
  }, []);

  const openMessage = async (msg: MessageMeta) => {
    setMessageLoading(true);
    setSelectedMessage(null);
    setThread(null);
    setExpandedIds(new Set());
    setReplyState(null);
    setEmojiPickerOpen(false);
    loadThread(msg.threadId, msg.id);


    // Optimistic read state (don't wait for Gmail)
    if (msg.unread) {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, unread: false } : m)));
      updateCache(msg.id, { is_read: true });
      supabase.functions.invoke("gmail-action", { body: { action: "mark-read", messageId: msg.id } });
    }

    // Serve the body from cache instantly when available
    let servedFromCache = false;
    if (adminEmail) {
      try {
        const { data: cached } = await supabase
          .from("cached_emails" as any)
          .select("*")
          .eq("admin_email", adminEmail)
          .eq("id", msg.id)
          .maybeSingle();
        const row: any = cached;
        if (row && (row.body_html || row.body_text)) {
          setSelectedMessage({
            id: row.id,
            threadId: row.thread_id || "",
            snippet: row.snippet || "",
            from: row.sender_name ? `${row.sender_name} <${row.sender_email || ""}>` : row.sender_email || "",
            to: row.recipient_email || "",
            cc: "",
            subject: row.subject || "",
            date: row.internal_date || "",
            body: row.body_html || row.body_text || "",
            isHtml: !!row.body_html,
            attachments: [],
            unread: false,
            starred: !!row.is_starred,
            labelIds: row.label_ids || [],
          });
          setMessageLoading(false);
          servedFromCache = true;
          if (!msg.threadId && row.thread_id) loadThread(row.thread_id, row.id);
        }
      } catch { /* fall through to Gmail */ }
    }

    if (servedFromCache) return;

    try {
      const { data, error } = await supabase.functions.invoke("gmail-message", { body: { messageId: msg.id } });
      if (error) throw error;
      setSelectedMessage(data);
      if (!msg.threadId && data?.threadId) loadThread(data.threadId, data.id);

      if (adminEmail && data) {
        const { name, email } = parseFrom(data.from || "");
        supabase.from("cached_emails" as any).upsert({
          id: data.id,
          admin_email: adminEmail,
          thread_id: data.threadId || null,
          subject: data.subject || null,
          sender_name: name || null,
          sender_email: email || null,
          recipient_email: data.to || null,
          snippet: data.snippet || null,
          body_html: data.isHtml ? data.body : null,
          body_text: data.isHtml ? null : data.body,
          is_read: true,
          is_starred: !!data.starred,
          is_archived: false,
          label_ids: data.labelIds || null,
          internal_date: data.date ? new Date(data.date).toISOString() : null,
          fetched_at: new Date().toISOString(),
        }, { onConflict: "admin_email,id" }).then(() => {});
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
        setThread((prev) => {
          const next = (prev || []).filter((m) => m.id !== messageId);
          return prev ? (next.length ? next : null) : prev;
        });
        if (selectedMessage?.id === messageId) { setSelectedMessage(null); setThread(null); setReplyState(null); }
        if (action === "archive") updateCache(messageId, { is_archived: true });
        else if (adminEmail) {
          supabase.from("cached_emails" as any).delete().eq("admin_email", adminEmail).eq("id", messageId).then(() => {});
        }
        toast({ title: action === "archive" ? "Email archived" : "Moved to trash" });
        return;
      } else if (action === "mark-unread") {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, unread: true } : m)));
        if (selectedMessage?.id === messageId) setSelectedMessage({ ...selectedMessage, unread: true });
        setThread((prev) => prev?.map((m) => (m.id === messageId ? { ...m, unread: true } : m)) || prev);
        updateCache(messageId, { is_read: false });
        toast({ title: "Marked as unread" });
        return;
      } else if (action === "star" || action === "unstar") {
        const starred = action === "star";
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, starred } : m)));
        if (selectedMessage?.id === messageId) setSelectedMessage({ ...selectedMessage, starred });
        setThread((prev) => prev?.map((m) => (m.id === messageId ? { ...m, starred } : m)) || prev);
        updateCache(messageId, { is_starred: starred });
      }

      toast({ title: "Done" });
    } catch (err: any) {
      toast({ title: "Action failed", description: err?.message, variant: "destructive" });
    }
  };

  const handleSend = async (
    to: string,
    cc: string,
    subject: string,
    body: string,
    opts?: { threadId?: string; inReplyTo?: string; references?: string },
  ) => {
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("gmail-send", { body: { to, cc, subject, body, ...(opts || {}) } });
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

  const openReply = (mode: "reply" | "forward", source?: FullMessage) => {
    const src = source || selectedMessage;
    if (!src) return;
    const quoted = [
      "",
      "---------- Original message ----------",
      `From: ${src.from}`,
      `Date: ${src.date}`,
      `Subject: ${src.subject}`,
      `To: ${src.to}`,
      "",
      htmlToPlainText(src.body),
    ].join("\n");
    setReplyState({
      mode,
      to: mode === "reply" ? parseFrom(src.from).email : "",
      subject:
        mode === "reply"
          ? src.subject?.startsWith("Re:") ? src.subject : `Re: ${src.subject || ""}`
          : `Fwd: ${src.subject || ""}`,
      body: mode === "forward" ? quoted : "",
    });
    setEmojiPickerOpen(false);
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

  // --- Thread / conversation view ---
  if (selectedMessage) {
    const threadMessages: ThreadMessage[] = thread && thread.length ? thread : [selectedMessage as ThreadMessage];
    const latest = threadMessages[threadMessages.length - 1];
    const subject = threadMessages[0]?.subject || selectedMessage.subject || "(no subject)";

    const toggleExpanded = (id: string) => {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    };

    const isExpanded = (id: string) => (expandedIds.size ? expandedIds.has(id) : id === latest.id);

    const actionBar = (m: ThreadMessage) => (
      <div
        className="flex items-center gap-2 bg-white mt-4"
        style={{ borderTop: "0.5px solid #C8F0F8", padding: "10px 14px", marginLeft: -14, marginRight: -14 }}
      >
        <button
          onClick={() => openReply("reply", m)}
          data-variant="ghost"
          className="inline-flex items-center gap-1.5 rounded-full border-[0.5px] border-border bg-transparent hover:bg-muted"
          style={{ padding: "6px 14px", fontSize: "12px" }}
        >
          <Reply className="w-3.5 h-3.5" /> Reply
        </button>
        <button
          onClick={() => openReply("forward", m)}
          data-variant="ghost"
          className="inline-flex items-center gap-1.5 rounded-full border-[0.5px] border-border bg-transparent hover:bg-muted"
          style={{ padding: "6px 14px", fontSize: "12px" }}
        >
          <Forward className="w-3.5 h-3.5" /> Forward
        </button>
        <div className="relative">
          <button
            onClick={() => {
              const same = emojiPickerTarget.current === m.id;
              emojiPickerTarget.current = m.id;
              setEmojiPickerOpen(same ? !emojiPickerOpen : true);
            }}

            data-variant="ghost"
            title="Add reaction"
            className="inline-flex items-center rounded-full border-[0.5px] border-border bg-transparent hover:bg-muted"
            style={{ padding: "6px 10px" }}
          >
            <Smile className="w-3.5 h-3.5" />
          </button>
          {emojiPickerOpen && emojiPickerTarget.current === m.id && (
            <div className="absolute left-0 top-full mt-1 z-10 flex gap-1 rounded-full border border-cyan-100 bg-white px-2 py-1.5 shadow-md">
              {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    setReactions((prev) => ({ ...prev, [m.id]: e }));
                    setEmojiPickerOpen(false);
                  }}
                  className="text-base hover:scale-125 transition-transform"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => handleAction("mark-unread", m.id)}
          data-variant="ghost"
          title="Mark as unread"
          className="inline-flex items-center rounded-full border-[0.5px] border-border bg-transparent hover:bg-muted"
          style={{ padding: "6px 10px" }}
        >
          <MailOpen className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => handleAction("archive", m.id)}
          data-variant="ghost"
          title="Archive"
          className="inline-flex items-center rounded-full border-[0.5px] border-border bg-transparent hover:bg-muted"
          style={{ padding: "6px 10px" }}
        >
          <Archive className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => handleAction("trash", m.id)}
          data-variant="ghost"
          title="Delete"
          className="inline-flex items-center rounded-full border-[0.5px] border-border bg-transparent hover:bg-muted group"
          style={{ padding: "6px 10px" }}
        >
          <Trash2 className="w-3.5 h-3.5 group-hover:text-[#E24B4A]" />
        </button>
      </div>
    );

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setSelectedMessage(null); setThread(null); }}
            data-variant="ghost"
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs hover:bg-muted"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex-1" />
          {threadLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0ABEDF]" />}
          <button onClick={() => handleAction(latest.starred ? "unstar" : "star", latest.id)} data-variant="ghost" className="p-1.5 rounded-md hover:bg-muted">
            {latest.starred ? <Star className="w-4 h-4 text-amber-400 fill-amber-400" /> : <StarOff className="w-4 h-4 text-muted-foreground" />}
          </button>
          <button onClick={() => handleAction("archive", latest.id)} data-variant="ghost" className="p-1.5 rounded-md hover:bg-muted" title="Archive">
            <Archive className="w-4 h-4 text-muted-foreground" />
          </button>
          <button onClick={() => handleAction("trash", latest.id)} data-variant="ghost" className="p-1.5 rounded-md hover:bg-muted" title="Delete">
            <Trash2 className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="rounded-lg border border-cyan-100 bg-white">
          {/* Thread header */}
          <div className="px-5 pt-5 pb-3">
            <h2 style={{ fontSize: "18px", fontWeight: 600 }} className="leading-snug">{subject}</h2>
            <div className="text-xs text-muted-foreground mt-1">
              {threadMessages.length} message{threadMessages.length > 1 ? "s" : ""}
            </div>
          </div>

          {/* Messages */}
          <div className="divide-y divide-gray-100 border-t border-gray-100">
            {threadMessages.map((m) => {
              const { name, email } = parseFrom(m.from || "");
              const expanded = isExpanded(m.id);
              return (
                <div key={m.id} className="px-3.5">
                  {!expanded ? (
                    <button
                      onClick={() => toggleExpanded(m.id)}
                      className="w-full flex items-center gap-3 text-left hover:bg-cyan-50/30 transition-colors rounded-md px-1"
                      style={{ height: 44 }}
                    >
                      <span
                        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white"
                        style={avatarStyle(email || name)}
                      >
                        {initialsOf(name, email)}
                      </span>
                      <span className="text-xs font-medium flex-shrink-0 max-w-[140px] truncate">{name || email}</span>
                      <span className="text-xs text-muted-foreground truncate flex-1">{m.snippet}</span>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatDate(m.date || "")}</span>
                    </button>
                  ) : (
                    <div className="py-4 animate-in fade-in duration-200">
                      <div className="flex items-start gap-3">
                        <span
                          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold text-white"
                          style={avatarStyle(email || name)}
                        >
                          {initialsOf(name, email)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <button onClick={() => toggleExpanded(m.id)} className="text-left w-full">
                            <div className="text-sm font-medium">
                              {name || email}
                              {email && <span className="text-xs text-muted-foreground font-normal"> &lt;{email}&gt;</span>}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              to: {m.to}
                              {m.cc ? ` · cc: ${m.cc}` : ""}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {m.date && new Date(m.date).toLocaleString()}
                            </div>
                          </button>

                          <div className="mt-3 text-sm">
                            <MessageBody body={m.body} isHtml={m.isHtml} />
                          </div>

                          {m.attachments?.length > 0 && (
                            <div className="border-t mt-4 pt-3 flex flex-wrap gap-2">
                              {m.attachments.map((a) => (
                                <div key={a.attachmentId} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-muted text-xs">
                                  <Paperclip className="w-3.5 h-3.5" />
                                  <span className="font-medium">{a.filename}</span>
                                  <span className="text-muted-foreground">{(a.size / 1024).toFixed(0)}KB</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {reactions[m.id] && (
                            <div className="mt-3">
                              <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full border border-cyan-100 bg-cyan-50/40 text-base leading-none">
                                {reactions[m.id]}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      {actionBar(m)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Reply / Forward compose box — always at the bottom of the thread */}
        <InlineCompose
          key={`${replyState?.mode || "reply"}-${latest.id}`}
          mode={replyState?.mode || "reply"}
          initialTo={replyState ? replyState.to : parseFrom(latest.from).email}
          initialSubject={
            replyState
              ? replyState.subject
              : (subject.startsWith("Re:") ? subject : `Re: ${subject}`)
          }
          initialBody={
            replyState
              ? replyState.body
              : ["", "---------- Original message ----------", `From: ${latest.from}`, `Date: ${latest.date}`, "", htmlToPlainText(latest.body)].join("\n")
          }
          sending={sending}
          onClose={() => setReplyState(null)}
          onSend={async (to, cc, subj, body) => {
            const isForward = replyState?.mode === "forward";
            await handleSend(to, cc, subj, body, isForward ? undefined : {
              threadId: latest.threadId || selectedMessage.threadId,
              inReplyTo: latest.messageIdHeader,
              references: [latest.references, latest.messageIdHeader].filter(Boolean).join(" "),
            });
            setReplyState(null);
          }}
        />

        {composeOpen && (
          <ComposeDialog onClose={() => setComposeOpen(false)} onSend={handleSend} sending={sending} />
        )}
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

      {/* Token expired banner */}
      {tokenExpired && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-cyan-100 bg-cyan-50/50 px-3 py-2">
          <span className="text-xs text-foreground">Your Gmail connection needs to be renewed.</span>
          <button
            onClick={handleConnect}
            data-variant="primary"
            data-size="small"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#0ABEDF] text-white text-xs font-medium hover:opacity-90"
          >
            {connecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />} Reconnect Gmail
          </button>
        </div>
      )}

      {/* Connection badge */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{profile?.emailAddress ? `Connected as ${profile.emailAddress}` : "Connected"}</span>
        <div className="flex items-center gap-2">
          {polling && <Loader2 className="w-3 h-3 animate-spin text-[#0ABEDF]" />}
          <button onClick={handleDisconnect} data-variant="ghost" data-size="small" className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted">
            <Unlink className="w-3 h-3" /> Disconnect
          </button>
        </div>
      </div>

      {/* Message list */}
      <div ref={listRef} className="rounded-lg border border-cyan-100 bg-white divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">

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

function htmlToPlainText(html: string): string {
  const el = document.createElement("div");
  el.innerHTML = html;
  return (el.textContent || "").replace(/\u00a0/g, " ").trim();
}

function InlineCompose({
  mode,
  initialTo,
  initialSubject,
  initialBody,
  sending,
  onClose,
  onSend,
}: {
  mode: "reply" | "forward";
  initialTo: string;
  initialSubject: string;
  initialBody: string;
  sending: boolean;
  onClose: () => void;
  onSend: (to: string, cc: string, subject: string, body: string) => void;
}) {
  const [to, setTo] = useState(initialTo);
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);

  return (
    <div className="rounded-lg border border-cyan-100 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-cyan-50/40">
        <span className="text-xs font-medium text-muted-foreground">{mode === "reply" ? "Reply" : "Forward"}</span>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-muted"><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className="px-4 py-2 space-y-0">
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" className="w-full px-0 py-1.5 text-sm border-b border-gray-100 focus:outline-none focus:border-cyan-400" />
        <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Cc" className="w-full px-0 py-1.5 text-sm border-b border-gray-100 focus:outline-none focus:border-cyan-400" />
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full px-0 py-1.5 text-sm border-b border-gray-100 focus:outline-none focus:border-cyan-400" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message…" rows={mode === "forward" ? 12 : 6} className="w-full px-0 py-2 text-sm focus:outline-none resize-y" />
      </div>
      <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-gray-100">
        <button onClick={onClose} data-variant="ghost" className="px-3 py-1.5 text-xs rounded-md hover:bg-muted">Discard</button>
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
