import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Send, Copy, Download, Ban, FileSignature, Trash2, RefreshCw, FolderOpen, FolderCheck } from "lucide-react";
import { toast } from "sonner";
import { SendEnvelopeDialog } from "./SendEnvelopeDialog";

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
  signing_token: string;
  signed_pdf_path: string | null;
  audit_pdf_path: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  viewed: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  signed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  voided: "bg-red-500/15 text-red-700 dark:text-red-300",
  expired: "bg-muted text-muted-foreground",
};

export const PrePitchPanel = () => {
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendOpen, setSendOpen] = useState(false);
  const [folder, setFolder] = useState<"active" | "completed">("active");
  const [resendingId, setResendingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: tpl } = await supabase
      .from("contract_templates")
      .select("id")
      .eq("name", PRE_PITCH_TEMPLATE_NAME)
      .maybeSingle();
    if (!tpl) {
      setTemplateId(null);
      setEnvelopes([]);
      setLoading(false);
      return;
    }
    setTemplateId(tpl.id);
    const { data, error } = await supabase
      .from("contract_envelopes")
      .select("id, template_id, recipient_name, recipient_email, status, sent_at, viewed_at, signed_at, signing_token, signed_pdf_path, audit_pdf_path, created_at")
      .eq("template_id", tpl.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    else setEnvelopes((data || []) as Envelope[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/sign/${token}`);
    toast.success("Signing link copied");
  };

  const resendEnvelope = async (env: Envelope) => {
    if (!confirm(`Send a new Pre-Pitch Agreement link to ${env.recipient_name} (${env.recipient_email})?`)) return;
    setResendingId(env.id);
    try {
      const { data: full, error: fe } = await supabase
        .from("contract_envelopes")
        .select("template_id, recipient_name, recipient_email, applicant_id, contractor_assignment_id, admin_prefill, message")
        .eq("id", env.id).single();
      if (fe) throw fe;
      const { data, error } = await supabase.functions.invoke("send-contract-envelope", {
        body: {
          templateId: full.template_id,
          recipientName: full.recipient_name,
          recipientEmail: full.recipient_email,
          applicantId: full.applicant_id,
          contractorAssignmentId: full.contractor_assignment_id,
          adminPrefill: full.admin_prefill || {},
          message: full.message,
          category: "prepitch",
        },
      });
      if (error) throw error;
      const signUrl = (data as any)?.signUrl;
      if (signUrl) { try { await navigator.clipboard.writeText(signUrl); } catch {} }
      toast.success("New Pre-Pitch Agreement sent");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setResendingId(null);
    }
  };

  const voidEnvelope = async (id: string) => {
    const reason = prompt("Reason for voiding?") || null;
    try {
      const { error } = await supabase.functions.invoke("void-contract-envelope", { body: { envelopeId: id, reason } });
      if (error) throw error;
      toast.success("Voided");
      load();
    } catch (e) { toast.error((e as Error).message); }
  };

  const downloadPdf = async (path: string, name: string) => {
    try {
      const { data, error } = await supabase.storage.from("contract-signed").download(path);
      if (error || !data) throw new Error(error?.message || "Failed");
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast.error((e as Error).message); }
  };

  const deleteEnvelope = async (e: Envelope) => {
    if (!confirm(`Delete pre-pitch agreement for ${e.recipient_name}?`)) return;
    try {
      const paths = [e.signed_pdf_path, e.audit_pdf_path].filter(Boolean) as string[];
      if (paths.length) await supabase.storage.from("contract-signed").remove(paths);
      await supabase.from("contract_envelope_field_values").delete().eq("envelope_id", e.id);
      await supabase.from("contract_audit_events").delete().eq("envelope_id", e.id);
      const { error } = await supabase.from("contract_envelopes").delete().eq("id", e.id);
      if (error) throw error;
      toast.success("Deleted");
      setEnvelopes(prev => prev.filter(x => x.id !== e.id));
    } catch (err) { toast.error((err as Error).message); }
  };

  const filtered = useMemo(() => envelopes.filter(e =>
    folder === "completed" ? e.status === "signed" : e.status !== "signed"
  ), [envelopes, folder]);

  const activeCount = envelopes.filter(e => e.status !== "signed").length;
  const completedCount = envelopes.filter(e => e.status === "signed").length;

  if (!loading && !templateId) {
    return (
      <Card className="p-12 text-center text-muted-foreground">
        <FileSignature className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p>Pre-Pitch Agreement template not found. Please create a template named "{PRE_PITCH_TEMPLATE_NAME}".</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <Tabs value={folder} onValueChange={(v) => setFolder(v as any)}>
          <TabsList>
            <TabsTrigger value="active" className="gap-2"><FolderOpen className="w-4 h-4" /> Active ({activeCount})</TabsTrigger>
            <TabsTrigger value="completed" className="gap-2"><FolderCheck className="w-4 h-4" /> Signed ({completedCount})</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button onClick={() => setSendOpen(true)} className="gap-2"><Send className="w-4 h-4" /> Send Pre-Pitch Agreement</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <FileSignature className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>{folder === "completed" ? "No signed pre-pitch agreements yet." : "No active pre-pitch agreements."}</p>
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
                  <p className="list-row-title">Pre-Pitch Agreement — {e.recipient_name}</p>
                  <Badge className={STATUS_COLORS[e.status] || ""} variant="outline">{e.status}</Badge>
                </div>
                <p className="list-row-meta">{e.recipient_email}</p>
                <p className="list-row-dates">
                  Sent {e.sent_at ? new Date(e.sent_at).toLocaleString() : "—"}
                  {e.viewed_at && ` • Last viewed ${new Date(e.viewed_at).toLocaleString()}`}
                  {e.signed_at && ` • Signed ${new Date(e.signed_at).toLocaleString()}`}
                </p>
              </div>
              <div className="list-row-right gap-1">
                <Button size="sm" variant="outline" onClick={() => copyLink(e.signing_token)} className="gap-1"><Copy className="w-3 h-3" /> Link</Button>
                <Button size="sm" variant="outline" onClick={() => resendEnvelope(e)} disabled={resendingId === e.id} className="gap-1">
                  {resendingId === e.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Resend
                </Button>
                {["sent", "viewed", "draft"].includes(e.status) && (
                  <Button size="sm" variant="ghost" onClick={() => voidEnvelope(e.id)} title="Void"><Ban className="w-4 h-4 text-destructive" /></Button>
                )}
                {e.signed_pdf_path && (
                  <Button size="sm" variant="outline" onClick={() => downloadPdf(e.signed_pdf_path!, `pre-pitch-${e.recipient_name}.pdf`)} className="gap-1"><Download className="w-3 h-3" /> Signed</Button>
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

      {templateId && (
        <SendEnvelopeDialog
          open={sendOpen}
          onOpenChange={setSendOpen}
          onSent={load}
          lockedTemplateId={templateId}
          title="Send Pre-Pitch Agreement"
          messageCategory="prepitch"
        />
      )}
    </div>
  );
};

export default PrePitchPanel;
