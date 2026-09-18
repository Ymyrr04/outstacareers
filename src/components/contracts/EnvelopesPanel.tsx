import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Send, Copy, Download, Ban, FileSignature, Trash2, RefreshCw, PenLine, FolderOpen, FolderCheck, BellRing } from "lucide-react";
import { toast } from "sonner";
import { SendEnvelopeDialog } from "./SendEnvelopeDialog";
import { CountersignDialog } from "./CountersignDialog";
import { formatDateTime } from "@/lib/dateFormat";

const PRE_PITCH_TEMPLATE_NAME = "OutSta Pre-Pitch Agreement";

interface Envelope {
  id: string;
  template_id: string;
  recipient_name: string;
  recipient_email: string;
  status: string;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  expires_at: string;
  signing_token: string;
  signed_pdf_path: string | null;
  audit_pdf_path: string | null;
  countersigned_file_url: string | null;
  countersigned_at: string | null;
  countersign_token: string | null;
  countersign_sent_at: string | null;
  countersign_recipient_name: string | null;
  countersign_recipient_email: string | null;
  countersign_expires_at: string | null;
  created_at: string;
  contract_templates?: { name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  viewed: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  signed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  voided: "bg-red-500/15 text-red-700 dark:text-red-300",
  expired: "bg-muted text-muted-foreground",
};

export const EnvelopesPanel = () => {
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendOpen, setSendOpen] = useState(false);
  const [countersignFor, setCountersignFor] = useState<Envelope | null>(null);
  const [folder, setFolder] = useState<"active" | "completed">("active");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("contract_envelopes")
      .select("*, contract_templates(name)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    else setEnvelopes((data || []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const [resendingId, setResendingId] = useState<string | null>(null);

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/sign/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Signing link copied");
  };

  const resendEnvelope = async (env: Envelope) => {
    if (!confirm(`Send a new signing link to ${env.recipient_name} (${env.recipient_email})? This creates a fresh envelope with a unique link so they can re-fill the contract.`)) return;
    setResendingId(env.id);
    try {
      // Fetch full envelope row to preserve applicant/contractor links, admin prefill, and message
      const { data: full, error: fetchErr } = await supabase
        .from("contract_envelopes")
        .select("template_id, recipient_name, recipient_email, applicant_id, contractor_assignment_id, admin_prefill, message")
        .eq("id", env.id)
        .single();
      if (fetchErr) throw fetchErr;

      const { data, error } = await supabase.functions.invoke("send-contract-envelope", {
        body: {
          templateId: full.template_id,
          recipientName: full.recipient_name,
          recipientEmail: full.recipient_email,
          applicantId: full.applicant_id,
          contractorAssignmentId: full.contractor_assignment_id,
          adminPrefill: full.admin_prefill || {},
          message: full.message,
        },
      });
      if (error) throw error;
      const signUrl = (data as any)?.signUrl;
      if (signUrl) {
        try { await navigator.clipboard.writeText(signUrl); } catch {}
        toast.success("New contract sent — link copied to clipboard");
      } else {
        toast.success("New contract sent");
      }
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setResendingId(null);
    }
  };

  const voidEnvelope = async (id: string) => {
    const reason = prompt("Reason for voiding?") || null;
    if (reason === null && !confirm("Void without a reason?")) return;
    try {
      const { error } = await supabase.functions.invoke("void-contract-envelope", {
        body: { envelopeId: id, reason },
      });
      if (error) throw error;

      toast.success("Voided");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const downloadPdf = async (path: string, name: string) => {
    try {
      const { data, error } = await supabase.storage.from("contract-signed").download(path);
      if (error || !data) throw new Error(error?.message || "Failed");
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const deleteEnvelope = async (e: Envelope) => {
    if (!confirm(`Delete contract for ${e.recipient_name}? This permanently removes the envelope and any signed PDFs.`)) return;
    try {
      const paths = [e.signed_pdf_path, e.audit_pdf_path].filter(Boolean) as string[];
      if (paths.length) {
        await supabase.storage.from("contract-signed").remove(paths);
      }
      await supabase.from("contract_envelope_field_values").delete().eq("envelope_id", e.id);
      await supabase.from("contract_audit_events").delete().eq("envelope_id", e.id);
      const { error } = await supabase.from("contract_envelopes").delete().eq("id", e.id);
      if (error) throw error;
      toast.success("Deleted");
      setEnvelopes(prev => prev.filter(x => x.id !== e.id));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const nonPitchEnvelopes = useMemo(() => envelopes.filter(e => e.contract_templates?.name !== PRE_PITCH_TEMPLATE_NAME), [envelopes]);

  const filtered = useMemo(() => {
    return nonPitchEnvelopes.filter(e => folder === "completed" ? !!e.countersigned_at : !e.countersigned_at);
  }, [nonPitchEnvelopes, folder]);

  const activeCount = nonPitchEnvelopes.filter(e => !e.countersigned_at).length;
  const completedCount = nonPitchEnvelopes.filter(e => !!e.countersigned_at).length;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <Tabs value={folder} onValueChange={(v) => setFolder(v as any)}>
          <TabsList>
            <TabsTrigger value="active" className="gap-2"><FolderOpen className="w-4 h-4" /> Active ({activeCount})</TabsTrigger>
            <TabsTrigger value="completed" className="gap-2"><FolderCheck className="w-4 h-4" /> Completed Contracts ({completedCount})</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button onClick={() => setSendOpen(true)} className="gap-2"><Send className="w-4 h-4" /> Send New Contract</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <FileSignature className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>{folder === "completed" ? "No fully signed contracts yet." : "No active contracts."}</p>
        </Card>
      ) : (
        <div className="grid gap-2">
          {filtered.map(e => (
            <Card key={e.id} className="list-row-card is-row">
              <div className="list-row-icon tint-green">
                <FileSignature />
              </div>
              <div className="list-row-main">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="list-row-title">OutSta Agreement - {e.recipient_name}</p>
                  <Badge className={STATUS_COLORS[e.status] || ""} variant="outline">{e.status}</Badge>
                  {e.countersigned_at && (
                    <Badge className="bg-teal-600/20 text-teal-700 dark:text-teal-300" variant="outline">fully signed</Badge>
                  )}
                  {!e.countersigned_at && e.countersign_sent_at && (
                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300" variant="outline">signature sent</Badge>
                  )}
                </div>
                <p className="list-row-meta">{e.recipient_email} • {e.contract_templates?.name || "—"}</p>
                <p className="list-row-dates">
                  Sent {e.sent_at ? formatDateTime(e.sent_at) : "—"}
                  {e.viewed_at && ` • Last viewed ${formatDateTime(e.viewed_at)}`}
                  {e.signed_at && ` • Signed ${formatDateTime(e.signed_at)}`}
                </p>
                {e.countersign_sent_at && !e.countersigned_at && (
                  <p className="list-row-dates">Signature request sent to {e.countersign_recipient_email} on {formatDateTime(e.countersign_sent_at)}</p>
                )}
                {e.countersigned_at && (
                  <p className="list-row-dates">Signed {formatDateTime(e.countersigned_at)}</p>
                )}
              </div>
              <div className="list-row-right gap-1">
                <Button size="sm" variant="outline" onClick={() => copyLink(e.signing_token)} className="gap-1" title="Copy signing link"><Copy className="w-3 h-3" /> Link</Button>
                <Button size="sm" variant="outline" onClick={() => resendEnvelope(e)} disabled={resendingId === e.id} className="gap-1" title="Resend with a new unique link">
                  {resendingId === e.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Resend
                </Button>
                {["sent", "viewed", "draft"].includes(e.status) && (
                  <Button size="sm" variant="ghost" onClick={() => voidEnvelope(e.id)} title="Void"><Ban className="w-4 h-4 text-destructive" /></Button>
                )}
                {e.signed_pdf_path && (
                  <Button size="sm" variant="outline" onClick={() => downloadPdf(e.signed_pdf_path!, `signed-${e.recipient_name}.pdf`)} className="gap-1"><Download className="w-3 h-3" /> Signed</Button>
                )}
                {e.status === "signed" && e.signed_pdf_path && !e.countersigned_file_url && (
                  <Button size="sm" variant="outline" onClick={() => setCountersignFor(e)} className="gap-1" title={e.countersign_sent_at ? "Resend countersign request" : "Send for countersign"}>
                    <PenLine className="w-3 h-3" /> {e.countersign_sent_at ? "Resend Countersign" : "Send for Countersign"}
                  </Button>
                )}
                {e.countersign_token && !e.countersigned_at && (
                  <Button size="sm" variant="ghost" onClick={() => { const url = `${window.location.origin}/countersign/${e.countersign_token}`; navigator.clipboard.writeText(url); toast.success("Signature link copied"); }} className="gap-1" title="Copy signature link"><Copy className="w-3 h-3" /> Sig Link</Button>
                )}
                {e.countersigned_file_url && (
                  <Button size="sm" variant="outline" onClick={() => downloadPdf(e.countersigned_file_url!, `countersigned-${e.recipient_name}.pdf`)} className="gap-1"><Download className="w-3 h-3" /> Download Signed</Button>
                )}
                {e.audit_pdf_path && (
                  <Button size="sm" variant="ghost" onClick={() => downloadPdf(e.audit_pdf_path!, `audit-${e.recipient_name}.pdf`)} className="gap-1"><Download className="w-3 h-3" /> Audit</Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => deleteEnvelope(e)} title="Delete"><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SendEnvelopeDialog open={sendOpen} onOpenChange={setSendOpen} onSent={load} />
      {countersignFor && (
        <CountersignDialog
          open={!!countersignFor}
          onOpenChange={(v) => { if (!v) setCountersignFor(null); }}
          envelopeId={countersignFor.id}
          signedPdfPath={countersignFor.signed_pdf_path!}
          recipientName={countersignFor.recipient_name}
          defaultRecipientName={countersignFor.countersign_recipient_name || undefined}
          defaultRecipientEmail={countersignFor.countersign_recipient_email || undefined}
          onDone={load}
        />
      )}
    </div>
  );
};
