import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Template { id: string; name: string; }
interface AdminField { id: string; label: string | null; field_key: string | null; }

export const SendEnvelopeDialog = ({ open, onOpenChange, onSent }: { open: boolean; onOpenChange: (o: boolean) => void; onSent: () => void; }) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [adminFields, setAdminFields] = useState<AdminField[]>([]);
  const [prefill, setPrefill] = useState<Record<string, string>>({});
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(14);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.from("contract_templates").select("id, name").eq("is_active", true).order("name").then(({ data }) => {
      setTemplates((data || []) as Template[]);
    });
  }, [open]);

  useEffect(() => {
    if (!templateId) { setAdminFields([]); setPrefill({}); return; }
    supabase.from("contract_template_fields").select("id, label, field_key").eq("template_id", templateId).eq("assigned_to", "admin").then(({ data }) => {
      setAdminFields((data || []) as AdminField[]);
    });
  }, [templateId]);

  const send = async () => {
    if (!templateId || !recipientEmail || !recipientName) return toast.error("Template, name and email are required.");
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/send-contract-envelope`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          templateId, recipientName, recipientEmail,
          adminPrefill: prefill, message, expiresInDays,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      toast.success(`Contract sent to ${recipientEmail}`);
      onOpenChange(false);
      setTemplateId(""); setRecipientName(""); setRecipientEmail(""); setMessage(""); setPrefill({});
      onSent();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Send Contract for Signature</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Template</label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
              <SelectContent>
                {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Recipient name</label>
              <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Recipient email</label>
              <Input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} />
            </div>
          </div>
          {adminFields.length > 0 && (
            <div className="border rounded p-3 space-y-2 bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground">Admin pre-fill</p>
              {adminFields.map(f => {
                const key = f.field_key || f.label || f.id;
                return (
                  <div key={f.id}>
                    <label className="text-xs">{f.label || key}</label>
                    <Input value={prefill[key] ?? ""} onChange={(e) => setPrefill(p => ({ ...p, [key]: e.target.value }))} />
                  </div>
                );
              })}
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Message (optional)</label>
            <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Hi — please review and sign the attached agreement." />
          </div>
          <div>
            <label className="text-sm font-medium">Link expires in (days)</label>
            <Input type="number" value={expiresInDays} onChange={(e) => setExpiresInDays(+e.target.value)} className="w-24" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={send} disabled={sending}>
            {sending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</> : "Send Contract"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
