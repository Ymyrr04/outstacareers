import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Trash2, Plus } from "lucide-react";

import { toast } from "sonner";

interface Template { id: string; name: string; }
interface AdminField { id: string; label: string | null; field_key: string | null; }
interface MsgTemplate { id: string; name: string; message: string; }

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
  const [msgTemplates, setMsgTemplates] = useState<MsgTemplate[]>([]);
  const [msgTemplateId, setMsgTemplateId] = useState<string>("");
  const [rate, setRate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const formatStartDate = (iso: string) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    return `${months[m - 1]} ${d}, ${y}`;
  };
  const formatStartTime = (t: string) => {
    if (!t) return "";
    const [hStr, mStr] = t.split(":");
    let h = parseInt(hStr, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${mStr} ${ampm}`;
  };
  const insertAtCursor = (text: string) => {
    if (!text) return;
    const ta = messageRef.current;
    if (!ta) { setMessage(m => m + text); return; }
    const start = ta.selectionStart ?? message.length;
    const end = ta.selectionEnd ?? message.length;
    const next = message.slice(0, start) + text + message.slice(end);
    setMessage(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + text.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const loadMsgTemplates = async () => {
    const { data } = await supabase.from("contract_message_templates").select("id, name, message").order("name");
    setMsgTemplates((data || []) as MsgTemplate[]);
  };

  useEffect(() => {
    if (!open) return;
    supabase.from("contract_templates").select("id, name").eq("is_active", true).order("name").then(({ data }) => {
      setTemplates((data || []) as Template[]);
    });
    loadMsgTemplates();
  }, [open]);

  useEffect(() => {
    if (!templateId) { setAdminFields([]); setPrefill({}); return; }
    supabase.from("contract_template_fields").select("id, label, field_key").eq("template_id", templateId).eq("assigned_to", "admin").then(({ data }) => {
      setAdminFields((data || []) as AdminField[]);
    });
  }, [templateId]);

  const applyMsgTemplate = (id: string) => {
    setMsgTemplateId(id);
    const t = msgTemplates.find(m => m.id === id);
    if (t) setMessage(t.message);
  };

  const saveAsTemplate = async () => {
    const trimmed = message.trim();
    if (!trimmed) return toast.error("Message is empty.");
    const name = window.prompt("Template name?")?.trim();
    if (!name) return;
    const { data, error } = await supabase
      .from("contract_message_templates")
      .insert({ name, message: trimmed })
      .select("id, name, message")
      .single();
    if (error) return toast.error(error.message);
    toast.success("Template saved");
    setMsgTemplates(prev => [...prev, data as MsgTemplate].sort((a, b) => a.name.localeCompare(b.name)));
    setMsgTemplateId((data as MsgTemplate).id);
  };

  const deleteTemplate = async () => {
    if (!msgTemplateId) return;
    const t = msgTemplates.find(m => m.id === msgTemplateId);
    if (!t) return;
    if (!confirm(`Delete template "${t.name}"?`)) return;
    const { error } = await supabase.from("contract_message_templates").delete().eq("id", msgTemplateId);
    if (error) return toast.error(error.message);
    setMsgTemplates(prev => prev.filter(m => m.id !== msgTemplateId));
    setMsgTemplateId("");
    toast.success("Template deleted");
  };

  const send = async () => {
    if (!templateId || !recipientEmail || !recipientName) return toast.error("Template, name and email are required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())) return toast.error("Please enter a valid email address.");
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-contract-envelope", {
        body: {
          templateId, recipientName: recipientName.trim(), recipientEmail: recipientEmail.trim(),
          adminPrefill: prefill, message, expiresInDays,
        },
      });
      if (error) throw error;

      toast.success(`Contract sent to ${recipientEmail}`);
      onOpenChange(false);
      setTemplateId(""); setRecipientName(""); setRecipientEmail(""); setMessage(""); setPrefill({}); setMsgTemplateId("");
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
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="text-sm font-medium">Message (optional)</label>
              <div className="flex items-center gap-1">
                <Select value={msgTemplateId} onValueChange={applyMsgTemplate}>
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue placeholder={msgTemplates.length ? "Use template…" : "No templates yet"} />
                  </SelectTrigger>
                  <SelectContent>
                    {msgTemplates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {msgTemplateId && (
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={deleteTemplate} title="Delete template">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                )}
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={saveAsTemplate} title="Save as template">
                  <Save className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
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
