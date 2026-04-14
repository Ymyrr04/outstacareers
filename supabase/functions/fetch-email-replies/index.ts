import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Minimal IMAP client for Gmail
class SimpleIMAPClient {
  private conn: Deno.TlsConn | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private tagCounter = 0;
  private buffer = "";
  private isConnected = false;

  async connect(host: string, port: number): Promise<void> {
    this.conn = await Deno.connectTls({ hostname: host, port });
    this.reader = this.conn.readable.getReader();
    this.writer = this.conn.writable.getWriter();
    this.isConnected = true;
    await this.readResponse();
  }

  isActive(): boolean {
    return this.isConnected && this.conn !== null && this.writer !== null;
  }

  private async readResponse(): Promise<string[]> {
    if (!this.isActive()) throw new Error("IMAP connection is not active");
    const lines: string[] = [];
    const decoder = new TextDecoder();
    while (true) {
      const newlineIndex = this.buffer.indexOf("\r\n");
      if (newlineIndex !== -1) {
        const line = this.buffer.substring(0, newlineIndex);
        this.buffer = this.buffer.substring(newlineIndex + 2);
        lines.push(line);
        if (line.match(/^A\d+ (OK|NO|BAD)/)) break;
        if (lines.length === 1 && line.startsWith("* OK")) break;
        continue;
      }
      try {
        const { value, done } = await this.reader!.read();
        if (done) { this.isConnected = false; break; }
        this.buffer += decoder.decode(value);
      } catch {
        this.isConnected = false;
        throw new Error("IMAP read error");
      }
    }
    return lines;
  }

  private async sendCommand(command: string): Promise<string[]> {
    if (!this.isActive()) throw new Error("IMAP connection is not active");
    this.tagCounter++;
    const tag = `A${this.tagCounter}`;
    const encoder = new TextEncoder();
    try {
      await this.writer!.write(encoder.encode(`${tag} ${command}\r\n`));
    } catch {
      this.isConnected = false;
      throw new Error("IMAP write error");
    }
    return await this.readResponse();
  }

  async login(user: string, pass: string): Promise<boolean> {
    const response = await this.sendCommand(`LOGIN "${user}" "${pass}"`);
    return response.some(line => line.includes("OK"));
  }

  async selectInbox(): Promise<number> {
    const response = await this.sendCommand("SELECT INBOX");
    let exists = 0;
    for (const line of response) {
      const match = line.match(/\* (\d+) EXISTS/);
      if (match) exists = parseInt(match[1]);
    }
    return exists;
  }

  async searchFrom(fromEmail: string, sinceDaysAgo: number): Promise<number[]> {
    const since = new Date();
    since.setDate(since.getDate() - sinceDaysAgo);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const sinceStr = `${since.getDate()}-${months[since.getMonth()]}-${since.getFullYear()}`;
    const response = await this.sendCommand(`SEARCH FROM "${fromEmail}" SINCE ${sinceStr}`);
    const uids: number[] = [];
    for (const line of response) {
      if (line.startsWith("* SEARCH")) {
        for (const part of line.replace("* SEARCH", "").trim().split(" ")) {
          const num = parseInt(part);
          if (!isNaN(num)) uids.push(num);
        }
      }
    }
    return uids;
  }

  decodeMimeWord(text: string): string {
    if (!text) return text;
    return text.replace(/=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g, (match, _charset, encoding, encodedText) => {
      try {
        if (encoding.toUpperCase() === 'Q') {
          return encodedText.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16)));
        } else if (encoding.toUpperCase() === 'B') {
          return atob(encodedText);
        }
      } catch { /* ignore */ }
      return match;
    });
  }

  async fetchMessage(msgNum: number): Promise<{ subject: string; date: string; messageId: string; inReplyTo: string; body: string; isRead: boolean } | null> {
    const response = await this.sendCommand(`FETCH ${msgNum} (FLAGS BODY[HEADER.FIELDS (SUBJECT DATE MESSAGE-ID IN-REPLY-TO)] BODY[TEXT])`);
    let subject = "", date = "", messageId = "", inReplyTo = "", body = "";
    let inBody = false, isRead = false;

    for (const line of response) {
      if (line.includes("FLAGS")) isRead = line.includes("\\Seen");
      if (line.includes("Subject:")) subject = this.decodeMimeWord(line.replace(/Subject:\s*/i, "").trim());
      if (line.includes("Date:")) date = line.replace(/Date:\s*/i, "").trim();
      if (line.includes("Message-ID:") || line.includes("Message-Id:")) messageId = line.replace(/Message-I[dD]:\s*/i, "").trim();
      if (line.includes("In-Reply-To:")) inReplyTo = line.replace(/In-Reply-To:\s*/i, "").trim();
      if (inBody && !line.match(/^A\d+ OK|^\)/)) body += line + "\n";
      if (line.includes("BODY[TEXT]")) inBody = true;
    }

    if (!messageId) return null;

    // Minimal body cleanup - truncate early to save memory
    body = body.substring(0, 5000);
    body = body.replace(/^--[a-zA-Z0-9]+.*$/gm, "");
    body = body.replace(/^Content-Type:.*$/gim, "");
    body = body.replace(/^Content-Transfer-Encoding:.*$/gim, "");
    body = body.replace(/=\r?\n/g, "");
    body = body.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    // Extract reply before quoted text
    const markers = [/^On .+ wrote:$/m, /^>.*$/m, /^-{2,}.*Original Message.*-{2,}$/im];
    for (const marker of markers) {
      const match = body.match(marker);
      if (match?.index && match.index > 20) { body = body.substring(0, match.index); break; }
    }
    body = body.replace(/^>\s*$/gm, "").replace(/\n{3,}/g, "\n\n").trim();

    return { subject, date, messageId, inReplyTo, body, isRead };
  }

  async logout(): Promise<void> {
    this.isConnected = false;
    try { if (this.writer) { this.tagCounter++; await this.writer.write(new TextEncoder().encode(`A${this.tagCounter} LOGOUT\r\n`)); } } catch { /* ignore */ }
    try { this.writer?.releaseLock(); } catch { /* ignore */ }
    try { this.reader?.releaseLock(); } catch { /* ignore */ }
    try { this.conn?.close(); } catch { /* ignore */ }
    this.writer = null; this.reader = null; this.conn = null;
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const MAX_RUNTIME_MS = 20000;
  const BATCH_SIZE = 20;

  try {
    let priorityEmail: string | null = null;
    try {
      const body = await req.json();
      if (body?.priorityEmail) priorityEmail = body.priorityEmail.toLowerCase();
    } catch { /* no body */ }

    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailAppPassword = Deno.env.get("GMAIL_APP_PASSWORD");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!gmailUser || !gmailAppPassword) throw new Error("Gmail credentials not configured");
    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Supabase credentials not configured");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Only fetch DISTINCT recipient emails (not full logs) to minimize memory
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: emailList, error: emailListError } = await supabase
      .from("email_logs")
      .select("recipient_email")
      .gte("sent_at", thirtyDaysAgo.toISOString());

    if (emailListError) throw new Error(`Failed to fetch email list: ${emailListError.message}`);

    // Build unique email set with minimal memory
    const uniqueEmails = [...new Set((emailList || []).map((e: { recipient_email: string }) => e.recipient_email.toLowerCase()))];
    const totalEmails = uniqueEmails.length;

    console.log(`Found ${totalEmails} unique emails from recent communications`);

    if (totalEmails === 0) {
      return new Response(JSON.stringify({ success: true, message: "No recent emails to check", repliesFound: 0 }), 
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    // Get rotation offset
    const { data: fetchState } = await supabase.from("email_fetch_state").select("current_offset").eq("id", 1).single();
    let currentOffset = fetchState?.current_offset || 0;
    if (currentOffset >= totalEmails) currentOffset = 0;

    // Build batch
    let emailsToProcess: string[];
    if (priorityEmail && uniqueEmails.includes(priorityEmail)) {
      const rest = uniqueEmails.filter(e => e !== priorityEmail);
      emailsToProcess = [priorityEmail, ...rest.slice(currentOffset, currentOffset + BATCH_SIZE - 1)];
    } else {
      emailsToProcess = [...uniqueEmails.slice(currentOffset), ...uniqueEmails.slice(0, currentOffset)].slice(0, BATCH_SIZE);
    }
    const nextOffset = (currentOffset + BATCH_SIZE) % totalEmails;

    console.log(`Processing ${emailsToProcess.length} emails (offset ${currentOffset}→${nextOffset})`);

    // Connect IMAP
    const client = new SimpleIMAPClient();
    await client.connect("imap.gmail.com", 993);
    const loggedIn = await client.login(gmailUser, gmailAppPassword);
    if (!loggedIn) throw new Error("Gmail login failed");
    await client.selectInbox();

    const newReplies: any[] = [];
    let processedCount = 0;

    for (const email of emailsToProcess) {
      if (Date.now() - startTime > MAX_RUNTIME_MS || !client.isActive()) break;

      try {
        const msgNums = await client.searchFrom(email, 30);

        for (const msgNum of msgNums) {
          if (Date.now() - startTime > MAX_RUNTIME_MS) break;

          const message = await client.fetchMessage(msgNum);
          if (!message?.messageId) continue;

          // Check duplicate inline (single query per message - only for messages we found)
          const { data: existing } = await supabase
            .from("email_replies")
            .select("id, is_read")
            .eq("gmail_message_id", message.messageId)
            .maybeSingle();

          if (existing) {
            // Sync read status if needed
            if (message.isRead && !existing.is_read) {
              await supabase.from("email_replies").update({ is_read: true }).eq("id", existing.id);
            }
            continue;
          }

          // Find applicant for this email - query only when needed
          let applicantId: string | null = null;

          if (message.inReplyTo) {
            const { data: logMatch } = await supabase
              .from("email_logs")
              .select("applicant_id")
              .eq("message_id", message.inReplyTo)
              .limit(1)
              .maybeSingle();
            if (logMatch) applicantId = logMatch.applicant_id;
          }

          if (!applicantId) {
            const { data: emailMatch } = await supabase
              .from("email_logs")
              .select("applicant_id")
              .ilike("recipient_email", email)
              .gte("sent_at", thirtyDaysAgo.toISOString())
              .limit(1)
              .maybeSingle();
            if (emailMatch) applicantId = emailMatch.applicant_id;
          }

          if (applicantId) {
            let receivedAt: string;
            try { receivedAt = new Date(message.date).toISOString(); } catch { receivedAt = new Date().toISOString(); }

            newReplies.push({
              applicant_id: applicantId,
              from_email: email,
              subject: message.subject || "(No Subject)",
              body_text: message.body.substring(0, 5000),
              in_reply_to: message.inReplyTo || null,
              received_at: receivedAt,
              gmail_message_id: message.messageId,
              is_read: message.isRead,
            });
          }
        }
        processedCount++;
      } catch (err: any) {
        console.error(`Error for ${email}:`, err.message);
        processedCount++;
      }
    }

    await client.logout();

    // Insert new replies
    if (newReplies.length > 0) {
      const { error: insertError } = await supabase
        .from("email_replies")
        .upsert(newReplies, { onConflict: 'gmail_message_id', ignoreDuplicates: true });
      if (insertError) console.error("Insert error:", insertError);
      else console.log(`Saved ${newReplies.length} new replies`);
    }

    // Update offset
    await supabase.from("email_fetch_state")
      .update({ current_offset: nextOffset, last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", 1);

    return new Response(JSON.stringify({
      success: true,
      repliesFound: newReplies.length,
      processedEmails: processedCount,
      totalEmails,
      currentOffset,
      nextOffset,
      runtimeMs: Date.now() - startTime,
    }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (error: any) {
    console.error("Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
};

serve(handler);
