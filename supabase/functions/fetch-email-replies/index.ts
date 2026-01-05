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

  private async sendCommand(command: string): Promise<string[]> {
    this.tagCounter++;
    const tag = `A${this.tagCounter}`;
    const fullCommand = `${tag} ${command}\r\n`;
    
    const encoder = new TextEncoder();
    const writer = this.conn!.writable.getWriter();
    await writer.write(encoder.encode(fullCommand));
    writer.releaseLock();
    
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

  async fetchMessage(msgNum: number): Promise<{ subject: string; date: string; messageId: string; inReplyTo: string; body: string } | null> {
    const response = await this.sendCommand(`FETCH ${msgNum} (BODY[HEADER.FIELDS (SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES)] BODY[TEXT])`);
    
    let subject = "";
    let date = "";
    let messageId = "";
    let inReplyTo = "";
    let body = "";
    let inBody = false;
    
    for (const line of response) {
      if (line.includes("Subject:")) {
        subject = line.replace(/Subject:\s*/i, "").trim();
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
    
    return { subject, date, messageId, inReplyTo, body: body.trim() };
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

    // Search for emails from each applicant
    for (const applicant of applicants as ApplicantEmail[]) {
      try {
        const msgNums = await client.searchFrom(applicant.email, 30);
        
        for (const msgNum of msgNums) {
          const message = await client.fetchMessage(msgNum);
          
          if (message && message.messageId && !existingMessageIds.has(message.messageId)) {
            console.log(`Found reply from: ${applicant.email} - ${message.subject}`);
            
            let receivedAt: string;
            try {
              receivedAt = new Date(message.date).toISOString();
            } catch {
              receivedAt = new Date().toISOString();
            }
            
            newReplies.push({
              applicant_id: applicant.id,
              from_email: applicant.email,
              subject: message.subject || "(No Subject)",
              body_text: message.body.substring(0, 50000),
              in_reply_to: message.inReplyTo || null,
              received_at: receivedAt,
              gmail_message_id: message.messageId,
            });
            
            existingMessageIds.add(message.messageId);
          }
        }
      } catch (err) {
        console.error(`Error searching for ${applicant.email}:`, err);
      }
    }

    await client.logout();
    console.log(`Disconnected from IMAP. Found ${newReplies.length} new replies`);

    // Insert new replies
    if (newReplies.length > 0) {
      const { error: insertError } = await supabase
        .from("email_replies")
        .insert(newReplies);

      if (insertError) {
        console.error("Failed to insert replies:", insertError);
        throw new Error(`Failed to save replies: ${insertError.message}`);
      }
      console.log(`Saved ${newReplies.length} new replies`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Found and saved ${newReplies.length} new replies`,
        repliesFound: newReplies.length 
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
