import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApplicantEmail {
  id: string;
  email: string;
}

// Simple IMAP client for Gmail
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
    // Read greeting
    await this.readResponse();
  }

  isActive(): boolean {
    return this.isConnected && this.conn !== null && this.writer !== null;
  }

  private async readResponse(): Promise<string[]> {
    if (!this.isActive()) {
      throw new Error("IMAP connection is not active");
    }
    
    const lines: string[] = [];
    const decoder = new TextDecoder();
    
    while (true) {
      // Check buffer first
      const newlineIndex = this.buffer.indexOf("\r\n");
      if (newlineIndex !== -1) {
        const line = this.buffer.substring(0, newlineIndex);
        this.buffer = this.buffer.substring(newlineIndex + 2);
        lines.push(line);
        
        // Check if this is a tagged response (end of command response)
        if (line.match(/^A\d+ (OK|NO|BAD)/)) {
          break;
        }
        // Check for untagged OK at start (greeting)
        if (lines.length === 1 && line.startsWith("* OK")) {
          break;
        }
        continue;
      }
      
      // Read more data
      try {
        const { value, done } = await this.reader!.read();
        if (done) {
          this.isConnected = false;
          break;
        }
        this.buffer += decoder.decode(value);
      } catch (err) {
        this.isConnected = false;
        throw err;
      }
    }
    
    return lines;
  }
  
  private async sendCommand(command: string): Promise<string[]> {
    if (!this.isActive()) {
      throw new Error("IMAP connection is not active");
    }
    
    this.tagCounter++;
    const tag = `A${this.tagCounter}`;
    const fullCommand = `${tag} ${command}\r\n`;
    
    const encoder = new TextEncoder();
    
    try {
      await this.writer!.write(encoder.encode(fullCommand));
    } catch (err) {
      this.isConnected = false;
      throw err;
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
      if (match) {
        exists = parseInt(match[1]);
      }
    }
    return exists;
  }

  async searchFrom(fromEmail: string, sinceDaysAgo: number): Promise<number[]> {
    const since = new Date();
    since.setDate(since.getDate() - sinceDaysAgo);
    // IMAP date format: DD-Mon-YYYY (e.g., 01-Jan-2026)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const sinceStr = `${since.getDate()}-${months[since.getMonth()]}-${since.getFullYear()}`;
    
    const searchCmd = `SEARCH FROM "${fromEmail}" SINCE ${sinceStr}`;
    console.log(`IMAP Search: ${searchCmd}`);
    
    const response = await this.sendCommand(searchCmd);
    console.log(`IMAP Response for ${fromEmail}:`, response.join(' | '));
    
    const uids: number[] = [];
    
    for (const line of response) {
      if (line.startsWith("* SEARCH")) {
        const parts = line.replace("* SEARCH", "").trim().split(" ");
        for (const part of parts) {
          const num = parseInt(part);
          if (!isNaN(num)) {
            uids.push(num);
          }
        }
      }
    }
    
    console.log(`Found ${uids.length} emails from ${fromEmail}`);
    return uids;
  }

  // Decode MIME encoded words (RFC 2047)
  decodeMimeWord(text: string): string {
    if (!text) return text;
    
    // Match =?charset?encoding?encoded_text?= patterns
    const mimePattern = /=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g;
    
    return text.replace(mimePattern, (match, charset, encoding, encodedText) => {
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
  }

  async fetchMessage(msgNum: number): Promise<{ subject: string; date: string; messageId: string; inReplyTo: string; body: string; isRead: boolean } | null> {
    // Fetch message with FLAGS to get read status
    const response = await this.sendCommand(`FETCH ${msgNum} (FLAGS BODY[HEADER.FIELDS (SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES)] BODY[TEXT])`);
    
    let subject = "";
    let date = "";
    let messageId = "";
    let inReplyTo = "";
    let body = "";
    let inBody = false;
    let isRead = false;
    
    for (const line of response) {
      // Check for FLAGS with \Seen flag (indicates email is read in Gmail)
      if (line.includes("FLAGS")) {
        isRead = line.includes("\\Seen");
      }
      if (line.includes("Subject:")) {
        const rawSubject = line.replace(/Subject:\s*/i, "").trim();
        subject = this.decodeMimeWord(rawSubject);
      }
      if (line.includes("Date:")) {
        date = line.replace(/Date:\s*/i, "").trim();
      }
      if (line.includes("Message-ID:") || line.includes("Message-Id:")) {
        messageId = line.replace(/Message-I[dD]:\s*/i, "").trim();
      }
      if (line.includes("In-Reply-To:")) {
        inReplyTo = line.replace(/In-Reply-To:\s*/i, "").trim();
      }
      // Capture body content
      if (inBody && !line.match(/^A\d+ OK|^\)/)) {
        body += line + "\n";
      }
      if (line.includes("BODY[TEXT]")) {
        inBody = true;
      }
    }
    
    if (!messageId) return null;
    
    // Clean up the body
    body = this.cleanEmailBody(body);
    
    return { subject, date, messageId, inReplyTo, body: body.trim(), isRead };
  }

  private cleanEmailBody(rawBody: string): string {
    let body = rawBody;
    
    // Remove MIME boundaries (lines starting with --)
    body = body.replace(/^--[a-zA-Z0-9]+.*$/gm, "");
    
    // Remove Content-Type and Content-Transfer-Encoding headers
    body = body.replace(/^Content-Type:.*$/gim, "");
    body = body.replace(/^Content-Transfer-Encoding:.*$/gim, "");
    
    // Decode quoted-printable encoding
    body = body.replace(/=\r?\n/g, ""); // Remove soft line breaks
    body = body.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });
    
    // Try to extract just the reply (before quoted original)
    // Look for common reply markers
    const replyMarkers = [
      /^On .+ wrote:$/m,                    // "On [date] [person] wrote:"
      /^>.*$/m,                              // Quoted text starting with >
      /^-{2,}.*Original Message.*-{2,}$/im, // "--- Original Message ---"
      /^From:.*Sent:.*To:.*Subject:/im,     // Outlook style quote header
    ];
    
    for (const marker of replyMarkers) {
      const match = body.match(marker);
      if (match && match.index !== undefined && match.index > 20) {
        // Only take content before the quote marker
        body = body.substring(0, match.index);
        break;
      }
    }
    
    // Remove lines that are just ">" (empty quoted lines)
    body = body.replace(/^>\s*$/gm, "");
    
    // Clean up excessive whitespace
    body = body.replace(/\n{3,}/g, "\n\n");
    body = body.trim();
    
    return body;
  }

  async logout(): Promise<void> {
    this.isConnected = false;
    try {
      if (this.writer) {
        const encoder = new TextEncoder();
        this.tagCounter++;
        const tag = `A${this.tagCounter}`;
        await this.writer.write(encoder.encode(`${tag} LOGOUT\r\n`));
      }
    } catch {
      // Ignore logout errors
    }
    // Release the writer lock before closing
    if (this.writer) {
      try {
        this.writer.releaseLock();
      } catch {
        // Ignore release errors
      }
      this.writer = null;
    }
    // Release reader lock
    if (this.reader) {
      try {
        this.reader.releaseLock();
      } catch {
        // Ignore release errors
      }
      this.reader = null;
    }
    try {
      this.conn?.close();
    } catch {
      // Ignore close errors
    }
    this.conn = null;
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const MAX_RUNTIME_MS = 45000; // 45 seconds max to leave buffer for cleanup
  const BATCH_SIZE = 100; // Process 100 emails per run
  const MAX_RETRIES = 3; // Max reconnection attempts

  try {
    // Parse optional request body for priority email
    let priorityEmail: string | null = null;
    try {
      const body = await req.json();
      if (body?.priorityEmail) {
        priorityEmail = body.priorityEmail.toLowerCase();
      }
    } catch {
      // No body or invalid JSON — that's fine
    }

    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailAppPassword = Deno.env.get("GMAIL_APP_PASSWORD");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!gmailUser || !gmailAppPassword) {
      throw new Error("Gmail credentials not configured");
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get applicants with recent activity (sent emails in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data: recentEmailLogs, error: emailLogsError } = await supabase
      .from("email_logs")
      .select("applicant_id, message_id, recipient_email")
      .gte("sent_at", thirtyDaysAgo.toISOString());

    if (emailLogsError) {
      throw new Error(`Failed to fetch email logs: ${emailLogsError.message}`);
    }

    // Build maps for efficient lookups
    const messageIdToApplicantMap = new Map<string, string>();
    const emailToApplicantMap = new Map<string, string[]>();
    const uniqueEmails = new Set<string>();

    if (recentEmailLogs) {
      for (const log of recentEmailLogs) {
        if (log.message_id) {
          messageIdToApplicantMap.set(log.message_id, log.applicant_id);
        }
        const email = log.recipient_email.toLowerCase();
        uniqueEmails.add(email);
        if (!emailToApplicantMap.has(email)) {
          emailToApplicantMap.set(email, []);
        }
        if (!emailToApplicantMap.get(email)!.includes(log.applicant_id)) {
          emailToApplicantMap.get(email)!.push(log.applicant_id);
        }
      }
    }

    console.log(`Found ${uniqueEmails.size} unique emails from recent communications`);
    console.log(`Loaded ${messageIdToApplicantMap.size} message IDs for thread matching`);

    if (uniqueEmails.size === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No recent emails to check", repliesFound: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get existing message IDs to avoid duplicates
    const { data: existingReplies } = await supabase
      .from("email_replies")
      .select("gmail_message_id");
    
    const existingMessageIds = new Set(
      existingReplies?.map((r: { gmail_message_id: string }) => r.gmail_message_id) || []
    );

    // Build processing list: put priority email first, then the rest
    const allEmails = [...uniqueEmails];
    let emailsToProcess: string[];
    if (priorityEmail && uniqueEmails.has(priorityEmail)) {
      // Move priority email to front
      emailsToProcess = [priorityEmail, ...allEmails.filter(e => e !== priorityEmail)].slice(0, BATCH_SIZE);
      console.log(`Priority email ${priorityEmail} will be processed first`);
    } else {
      emailsToProcess = allEmails.slice(0, BATCH_SIZE);
    }
    console.log(`Processing batch of ${emailsToProcess.length} emails (out of ${uniqueEmails.size} total)`);

    // Connect to Gmail via IMAP with retry support
    let client = new SimpleIMAPClient();
    let retryCount = 0;

    const connectAndLogin = async (imapClient: SimpleIMAPClient): Promise<boolean> => {
      try {
        await imapClient.connect("imap.gmail.com", 993);
        console.log("Connected to Gmail IMAP");
        const loggedIn = await imapClient.login(gmailUser, gmailAppPassword);
        if (!loggedIn) {
          throw new Error("Failed to login to Gmail");
        }
        console.log("Logged in to Gmail");
        const messageCount = await imapClient.selectInbox();
        console.log(`Mailbox has ${messageCount} messages`);
        return true;
      } catch (err) {
        console.error("IMAP connect/login error:", err);
        return false;
      }
    };

    if (!await connectAndLogin(client)) {
      throw new Error("Failed to connect to Gmail IMAP");
    }

    const newReplies: any[] = [];
    const readInGmailMessageIds: string[] = [];
    let processedCount = 0;

    // Search for emails from each unique applicant email
    for (const email of emailsToProcess) {
      // Check if we're running out of time
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        console.log(`Stopping early due to time limit. Processed ${processedCount}/${emailsToProcess.length} emails`);
        break;
      }
      
      // If connection is lost, try to reconnect
      if (!client.isActive()) {
        if (retryCount >= MAX_RETRIES) {
          console.log(`Max retries (${MAX_RETRIES}) reached. Stopping. Processed ${processedCount}/${emailsToProcess.length}`);
          break;
        }
        retryCount++;
        console.log(`IMAP connection lost. Reconnecting (attempt ${retryCount}/${MAX_RETRIES})...`);
        
        // Clean up old connection
        try { await client.logout(); } catch { /* ignore */ }
        
        // Wait briefly before reconnecting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        client = new SimpleIMAPClient();
        if (!await connectAndLogin(client)) {
          console.log("Reconnection failed. Stopping processing.");
          break;
        }
        console.log("Reconnected successfully. Resuming processing...");
      }

      try {
        const msgNums = await client.searchFrom(email, 30);
        
        for (const msgNum of msgNums) {
          // Check time and connection again before fetching each message
          if (Date.now() - startTime > MAX_RUNTIME_MS || !client.isActive()) break;
          
          const message = await client.fetchMessage(msgNum);
          
          if (message && message.messageId) {
            // Check if this email already exists
            if (existingMessageIds.has(message.messageId)) {
              // If email exists and is now read in Gmail, update our database
              if (message.isRead) {
                readInGmailMessageIds.push(message.messageId);
              }
              continue;
            }
            
            // THREAD MATCHING: Try to match via in_reply_to header first
            let matchedApplicantId: string | null = null;
            
            if (message.inReplyTo) {
              matchedApplicantId = messageIdToApplicantMap.get(message.inReplyTo) || null;
              if (matchedApplicantId) {
                console.log(`Thread match: Reply "${message.subject}" matched to applicant ${matchedApplicantId} via in_reply_to`);
              }
            }
            
            // FALLBACK: If no thread match, use the first applicant with this email
            if (!matchedApplicantId) {
              const applicantIds = emailToApplicantMap.get(email.toLowerCase());
              if (applicantIds && applicantIds.length > 0) {
                matchedApplicantId = applicantIds[0];
                if (applicantIds.length > 1) {
                  console.log(`Warning: ${applicantIds.length} applicants share email ${email}, using first one (no thread match available)`);
                }
              }
            }
            
            if (matchedApplicantId) {
              console.log(`Found reply from: ${email} - ${message.subject} (read: ${message.isRead})`);
              
              let receivedAt: string;
              try {
                receivedAt = new Date(message.date).toISOString();
              } catch {
                receivedAt = new Date().toISOString();
              }
              
              newReplies.push({
                applicant_id: matchedApplicantId,
                from_email: email,
                subject: message.subject || "(No Subject)",
                body_text: message.body.substring(0, 50000),
                in_reply_to: message.inReplyTo || null,
                received_at: receivedAt,
                gmail_message_id: message.messageId,
                is_read: message.isRead,
              });
              
              existingMessageIds.add(message.messageId);
            }
          }
        }
        processedCount++;
      } catch (err: any) {
        console.error(`Error searching for ${email}:`, err);
        processedCount++;
        
        // If connection error, mark as disconnected so retry logic kicks in on next iteration
        if (err.name === 'BadResource' || err.name === 'UnexpectedEof' || err.message?.includes('connection') || err.message?.includes('peer closed') || !client.isActive()) {
          console.log(`Connection error detected. Will attempt reconnection on next email.`);
          // Don't break — let the retry logic at the top of the loop handle it
        }
      }
    }

    await client.logout();
    console.log(`Disconnected from IMAP. Found ${newReplies.length} new replies, ${readInGmailMessageIds.length} emails marked as read in Gmail`);

    // Insert new replies using upsert to handle duplicates gracefully
    if (newReplies.length > 0) {
      const { error: insertError } = await supabase
        .from("email_replies")
        .upsert(newReplies, { 
          onConflict: 'gmail_message_id',
          ignoreDuplicates: true 
        });

      if (insertError) {
        console.error("Failed to insert replies:", insertError);
        throw new Error(`Failed to save replies: ${insertError.message}`);
      }
      console.log(`Saved ${newReplies.length} new replies`);
    }

    // Update existing unread emails that are now marked as read in Gmail
    let readSyncCount = 0;
    if (readInGmailMessageIds.length > 0) {
      const { data: updatedData, error: updateError } = await supabase
        .from("email_replies")
        .update({ is_read: true })
        .in('gmail_message_id', readInGmailMessageIds)
        .eq('is_read', false)
        .select('id');

      if (updateError) {
        console.error("Failed to sync read status:", updateError);
      } else {
        readSyncCount = updatedData?.length || 0;
        if (readSyncCount > 0) {
          console.log(`Synced read status for ${readSyncCount} emails from Gmail`);
        }
      }
    }

    const runtime = Date.now() - startTime;
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Processed ${processedCount}/${emailsToProcess.length} emails. Found ${newReplies.length} new replies, synced ${readSyncCount} read statuses`,
        repliesFound: newReplies.length,
        readStatusSynced: readSyncCount,
        processedEmails: processedCount,
        totalEmails: uniqueEmails.size,
        runtimeMs: runtime
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error fetching email replies:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
