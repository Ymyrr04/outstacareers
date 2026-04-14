import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Minimal IMAP client
class IMAPClient {
  private conn: Deno.TlsConn | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private tag = 0;
  private buf = "";
  private ok = false;

  async connect(host: string, port: number) {
    this.conn = await Deno.connectTls({ hostname: host, port });
    this.reader = this.conn.readable.getReader();
    this.writer = this.conn.writable.getWriter();
    this.ok = true;
    await this.read();
  }

  active() { return this.ok && this.conn !== null; }

  private async read(): Promise<string[]> {
    if (!this.active()) throw new Error("disconnected");
    const dec = new TextDecoder();
    const lines: string[] = [];
    while (true) {
      const i = this.buf.indexOf("\r\n");
      if (i !== -1) {
        const line = this.buf.substring(0, i);
        this.buf = this.buf.substring(i + 2);
        lines.push(line);
        if (line.match(/^A\d+ (OK|NO|BAD)/)) break;
        if (lines.length === 1 && line.startsWith("* OK")) break;
        continue;
      }
      try {
        const { value, done } = await this.reader!.read();
        if (done) { this.ok = false; break; }
        this.buf += dec.decode(value);
      } catch { this.ok = false; throw new Error("read error"); }
    }
    return lines;
  }

  private async cmd(c: string) {
    if (!this.active()) throw new Error("disconnected");
    this.tag++;
    const t = `A${this.tag}`;
    try { await this.writer!.write(new TextEncoder().encode(`${t} ${c}\r\n`)); }
    catch { this.ok = false; throw new Error("write error"); }
    return this.read();
  }

  async login(u: string, p: string) { return (await this.cmd(`LOGIN "${u}" "${p}"`)).some(l => l.includes("OK")); }

  async selectInbox() { await this.cmd("SELECT INBOX"); }

  async searchFrom(email: string, days: number): Promise<number[]> {
    const d = new Date(); d.setDate(d.getDate() - days);
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const r = await this.cmd(`SEARCH FROM "${email}" SINCE ${d.getDate()}-${m[d.getMonth()]}-${d.getFullYear()}`);
    const ids: number[] = [];
    for (const l of r) if (l.startsWith("* SEARCH")) for (const p of l.replace("* SEARCH","").trim().split(" ")) { const n=parseInt(p); if(!isNaN(n)) ids.push(n); }
    return ids;
  }

  async fetchHeaders(msgNum: number): Promise<{subject:string,date:string,messageId:string,inReplyTo:string,isRead:boolean}|null> {
    // Only fetch headers and flags - NOT body - to save memory
    const r = await this.cmd(`FETCH ${msgNum} (FLAGS BODY[HEADER.FIELDS (SUBJECT DATE MESSAGE-ID IN-REPLY-TO)])`);
    let subject="",date="",messageId="",inReplyTo="",isRead=false;
    for (const l of r) {
      if (l.includes("FLAGS")) isRead = l.includes("\\Seen");
      if (l.match(/^Subject:/i)) subject = l.replace(/Subject:\s*/i,"").trim().replace(/=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g, (m,_c,e,t)=>{try{return e.toUpperCase()==='B'?atob(t):t.replace(/_/g,' ').replace(/=([0-9A-Fa-f]{2})/g,(_:string,h:string)=>String.fromCharCode(parseInt(h,16)))}catch{return m}});
      if (l.match(/^Date:/i)) date = l.replace(/Date:\s*/i,"").trim();
      if (l.match(/^Message-I[dD]:/i)) messageId = l.replace(/Message-I[dD]:\s*/i,"").trim();
      if (l.match(/^In-Reply-To:/i)) inReplyTo = l.replace(/In-Reply-To:\s*/i,"").trim();
    }
    return messageId ? {subject,date,messageId,inReplyTo,isRead} : null;
  }

  async fetchBody(msgNum: number): Promise<string> {
    const r = await this.cmd(`FETCH ${msgNum} (BODY[TEXT]<0.3000>)`);
    let body="", inBody=false;
    for (const l of r) {
      if (inBody && !l.match(/^A\d+ OK|^\)/)) body += l + "\n";
      if (l.includes("BODY[TEXT]")) inBody = true;
    }
    body = body.replace(/^--[a-zA-Z0-9]+.*$/gm,"").replace(/^Content-.*$/gim,"").replace(/=\r?\n/g,"").replace(/=([0-9A-Fa-f]{2})/g,(_,h)=>String.fromCharCode(parseInt(h,16)));
    const markers = [/^On .+ wrote:$/m, /^>.*$/m];
    for (const mk of markers) { const mt=body.match(mk); if(mt?.index&&mt.index>20){body=body.substring(0,mt.index);break;} }
    return body.replace(/^>\s*$/gm,"").replace(/\n{3,}/g,"\n\n").trim().substring(0,3000);
  }

  async logout() {
    this.ok = false;
    try { if(this.writer){this.tag++;await this.writer.write(new TextEncoder().encode(`A${this.tag} LOGOUT\r\n`));} } catch{}
    try{this.writer?.releaseLock()}catch{}
    try{this.reader?.releaseLock()}catch{}
    try{this.conn?.close()}catch{}
    this.writer=null;this.reader=null;this.conn=null;
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();
  const BATCH_SIZE = 10; // Very small batch to stay within memory

  try {
    let priorityEmail: string | null = null;
    try { const b = await req.json(); if (b?.priorityEmail) priorityEmail = b.priorityEmail.toLowerCase(); } catch {}

    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailAppPassword = Deno.env.get("GMAIL_APP_PASSWORD");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!gmailUser || !gmailAppPassword) throw new Error("Gmail credentials not configured");
    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Supabase credentials not configured");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get rotation state
    const { data: fetchState } = await supabase.from("email_fetch_state").select("current_offset").eq("id", 1).single();
    let currentOffset = fetchState?.current_offset || 0;

    // Fetch only the batch we need using pagination on email_logs
    // Use a smaller select to get unique emails
    const { data: batchLogs } = await supabase
      .from("email_logs")
      .select("recipient_email")
      .gte("sent_at", thirtyDaysAgo.toISOString())
      .order("recipient_email");

    if (!batchLogs || batchLogs.length === 0) {
      return new Response(JSON.stringify({ success: true, repliesFound: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    // Deduplicate in a memory-efficient way
    const seen = new Set<string>();
    const allEmails: string[] = [];
    for (const log of batchLogs) {
      const e = log.recipient_email.toLowerCase();
      if (!seen.has(e)) { seen.add(e); allEmails.push(e); }
    }
    seen.clear(); // Free memory
    const totalEmails = allEmails.length;
    if (currentOffset >= totalEmails) currentOffset = 0;

    // Build small batch
    let emailsToProcess: string[];
    if (priorityEmail) {
      // Just process the priority email
      emailsToProcess = [priorityEmail];
    } else {
      emailsToProcess = allEmails.slice(currentOffset, currentOffset + BATCH_SIZE);
    }
    const nextOffset = priorityEmail ? currentOffset : ((currentOffset + BATCH_SIZE) % totalEmails);

    // Free the large array
    allEmails.length = 0;

    console.log(`Processing ${emailsToProcess.length} emails (offset ${currentOffset}→${nextOffset}, total ${totalEmails})`);

    // Connect IMAP
    const client = new IMAPClient();
    await client.connect("imap.gmail.com", 993);
    if (!await client.login(gmailUser, gmailAppPassword)) throw new Error("Gmail login failed");
    await client.selectInbox();

    const newReplies: any[] = [];
    let processedCount = 0;

    for (const email of emailsToProcess) {
      if (Date.now() - startTime > 15000 || !client.active()) break;
      try {
        const msgNums = await client.searchFrom(email, 30);
        for (const msgNum of msgNums) {
          if (Date.now() - startTime > 15000) break;
          const hdr = await client.fetchHeaders(msgNum);
          if (!hdr?.messageId) continue;

          // Check if already stored
          const { count } = await supabase.from("email_replies").select("id", { count: "exact", head: true }).eq("gmail_message_id", hdr.messageId);
          if (count && count > 0) {
            if (hdr.isRead) {
              await supabase.from("email_replies").update({ is_read: true }).eq("gmail_message_id", hdr.messageId).eq("is_read", false);
            }
            continue;
          }

          // Find applicant
          let applicantId: string | null = null;
          if (hdr.inReplyTo) {
            const { data: m } = await supabase.from("email_logs").select("applicant_id").eq("message_id", hdr.inReplyTo).limit(1).maybeSingle();
            if (m) applicantId = m.applicant_id;
          }
          if (!applicantId) {
            const { data: m } = await supabase.from("email_logs").select("applicant_id").ilike("recipient_email", email).gte("sent_at", thirtyDaysAgo.toISOString()).limit(1).maybeSingle();
            if (m) applicantId = m.applicant_id;
          }

          if (applicantId) {
            // Only fetch body for new replies we'll save
            const body = await client.fetchBody(msgNum);
            let receivedAt: string;
            try { receivedAt = new Date(hdr.date).toISOString(); } catch { receivedAt = new Date().toISOString(); }
            newReplies.push({
              applicant_id: applicantId, from_email: email,
              subject: hdr.subject || "(No Subject)", body_text: body,
              in_reply_to: hdr.inReplyTo || null, received_at: receivedAt,
              gmail_message_id: hdr.messageId, is_read: hdr.isRead,
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

    if (newReplies.length > 0) {
      const { error } = await supabase.from("email_replies").upsert(newReplies, { onConflict: 'gmail_message_id', ignoreDuplicates: true });
      if (error) console.error("Insert error:", error);
      else console.log(`Saved ${newReplies.length} replies`);
    }

    if (!priorityEmail) {
      await supabase.from("email_fetch_state").update({ current_offset: nextOffset, last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", 1);
    }

    return new Response(JSON.stringify({
      success: true, repliesFound: newReplies.length, processedEmails: processedCount,
      totalEmails, currentOffset, nextOffset, runtimeMs: Date.now() - startTime,
    }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (error: any) {
    console.error("Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
};

serve(handler);
