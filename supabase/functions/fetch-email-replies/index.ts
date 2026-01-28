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
  private tagCounter = 0;
  private buffer = "";

  async connect(host: string, port: number): Promise<void> {
    this.conn = await Deno.connectTls({ hostname: host, port });
    this.reader = this.conn.readable.getReader();
    // Read greeting
    await this.readResponse();
  }

  private async readResponse(): Promise<string[]> {
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
      const { value, done } = await this.reader!.read();
      if (done) break;
      this.buffer += decoder.decode(value);
    }
    
    return lines;
  }

  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  
  private async sendCommand(command: string): Promise<string[]> {
    this.tagCounter++;
    const tag = `A${this.tagCounter}`;
    const fullCommand = `${tag} ${command}\r\n`;
    
    const encoder = new TextEncoder();
    
    // Reuse the writer or create one if needed
    if (!this.writer) {
      this.writer = this.conn!.writable.getWriter();
    }
    
    await this.writer.write(encoder.encode(fullCommand));
    
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
    try {
      await this.sendCommand("LOGOUT");
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
    this.conn?.close();
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    // Get all applicant emails to search for
    const { data: applicants, error: applicantsError } = await supabase
      .from("applicants_prescreen")
      .select("id, email");

    if (applicantsError) {
      throw new Error(`Failed to fetch applicants: ${applicantsError.message}`);
    }

    if (!applicants || applicants.length === 0) {
      console.log("No applicants found to check replies for");
      return new Response(
        JSON.stringify({ success: true, message: "No applicants to check", repliesFound: 0 }),
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

    // Get all email_logs with message_id for thread matching
    const { data: emailLogs } = await supabase
      .from("email_logs")
      .select("message_id, applicant_id")
      .not("message_id", "is", null);
    
    // Create a map of message_id -> applicant_id for fast lookups
    const messageIdToApplicantMap = new Map<string, string>();
    if (emailLogs) {
      for (const log of emailLogs) {
        if (log.message_id) {
          messageIdToApplicantMap.set(log.message_id, log.applicant_id);
        }
      }
    }
    console.log(`Loaded ${messageIdToApplicantMap.size} message IDs for thread matching`);

    console.log(`Checking replies from ${applicants.length} applicants`);

    // Connect to Gmail via IMAP
    const client = new SimpleIMAPClient();
    await client.connect("imap.gmail.com", 993);
    console.log("Connected to Gmail IMAP");

    const loggedIn = await client.login(gmailUser, gmailAppPassword);
    if (!loggedIn) {
      throw new Error("Failed to login to Gmail");
    }
    console.log("Logged in to Gmail");

    const messageCount = await client.selectInbox();
    console.log(`Mailbox has ${messageCount} messages`);

    const newReplies: any[] = [];
    const readInGmailMessageIds: string[] = []; // Track emails read in Gmail to sync status

    // Create a map of email -> applicant ids for fallback matching
    const emailToApplicantsMap = new Map<string, string[]>();
    for (const applicant of applicants as ApplicantEmail[]) {
      const email = applicant.email.toLowerCase();
      if (!emailToApplicantsMap.has(email)) {
        emailToApplicantsMap.set(email, []);
      }
      emailToApplicantsMap.get(email)!.push(applicant.id);
    }

    // Get unique emails to search
    const uniqueEmails = [...emailToApplicantsMap.keys()];
    console.log(`Searching for replies from ${uniqueEmails.length} unique email addresses`);

    // Search for emails from each unique applicant email
    for (const email of uniqueEmails) {
      try {
        const msgNums = await client.searchFrom(email, 30);
        
        for (const msgNum of msgNums) {
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
              // Look up the original email's applicant_id using the in_reply_to header
              matchedApplicantId = messageIdToApplicantMap.get(message.inReplyTo) || null;
              if (matchedApplicantId) {
                console.log(`Thread match: Reply "${message.subject}" matched to applicant ${matchedApplicantId} via in_reply_to`);
              }
            }
            
            // FALLBACK: If no thread match, use the first applicant with this email
            if (!matchedApplicantId) {
              const applicantIds = emailToApplicantsMap.get(email.toLowerCase());
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
                is_read: message.isRead, // Sync read status from Gmail
              });
              
              existingMessageIds.add(message.messageId);
            }
          }
        }
      } catch (err) {
        console.error(`Error searching for ${email}:`, err);
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
        .eq('is_read', false) // Only update those that are unread in our system
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

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Found ${newReplies.length} new replies, synced ${readSyncCount} read statuses`,
        repliesFound: newReplies.length,
        readStatusSynced: readSyncCount
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
