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
interface AdminField { id: string; label: string | null; field_key: string | null; field_type: string | null; }
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
    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const dow = days[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    return `${dow} , ${months[m - 1]} ${d}, ${y}`;
  };
  const formatStartTime = (t: string) => {
    if (!t) return "";
    const [hStr, mStr] = t.split(":");
    let h = parseInt(hStr, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${mStr} ${ampm} EST`;
  };
  const formatRate = (r: string) => {
    const trimmed = r.trim();
    if (!trimmed) return "";
    if (/per\s*hour|\/\s*hr|\/\s*hour|hourly/i.test(trimmed)) return trimmed;
    return `${trimmed} per hour`;
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
    supabase.from("contract_template_fields").select("id, label, field_key, field_type").eq("template_id", templateId).eq("assigned_to", "admin").then(({ data }) => {
      setAdminFields((data || []) as AdminField[]);
    });
  }, [templateId]);

  // Auto-sync Start date / Start time / Rate inputs into matching admin prefill keys
  useEffect(() => {
    if (!adminFields.length) return;
    setPrefill(prev => {
      const next = { ...prev };
      for (const f of adminFields) {
        const key = (f.field_key || f.label || f.id).toString();
        if (key === "start_date") {
          const v = formatStartDate(startDate);
          if (v) next[key] = v;
        } else if (key === "start_time") {
          const v = formatStartTime(startTime);
          if (v) next[key] = v;
        } else if (key === "hourly_rate" || key === "monthly_rate" || key === "rate") {
          if (rate) next[key] = formatRate(rate);
        }
      }
      return next;
    });
  }, [adminFields, startDate, startTime, rate]);

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
          adminPrefill: prefill,
          message: message
            .replace(/\{\{rate\}\}/g, rate || "{{rate}}")
            .replace(/\{\{start_date\}\}/g, formatStartDate(startDate) || "{{start_date}}")
            .replace(/\{\{start_time\}\}/g, formatStartTime(startTime) || "{{start_time}}"),
          expiresInDays,
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                const isDate = f.field_type === "date";
                const current = prefill[key] ?? "";
                // For date fields, mirror an ISO yyyy-mm-dd value but store the formatted display string in prefill
                const isoForDate = (() => {
                  if (!isDate || !current) return "";
                  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
                  const m = current.match(/^([A-Za-z]+) (\d{1,2}), (\d{4})$/);
                  if (!m) return "";
                  const mi = months.indexOf(m[1]);
                  if (mi < 0) return "";
                  return `${m[3]}-${String(mi + 1).padStart(2, "0")}-${String(parseInt(m[2], 10)).padStart(2, "0")}`;
                })();
                return (
                  <div key={f.id}>
                    <label className="text-xs">{f.label || key}</label>
                    {isDate ? (
                      <Input
                        type="date"
                        value={isoForDate}
                        onChange={(e) => {
                          const iso = e.target.value;
                          if (!iso) { setPrefill(p => ({ ...p, [key]: "" })); return; }
                          const [y, mo, d] = iso.split("-").map(Number);
                          const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
                          const formatted = `${months[mo - 1]} ${d}, ${y}`;
                          setPrefill(p => ({ ...p, [key]: formatted }));
                        }}
                      />
                    ) : (
                      <Input value={current} onChange={(e) => setPrefill(p => ({ ...p, [key]: e.target.value }))} />
                    )}
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
            <Textarea ref={messageRef} rows={6} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Hi — please review and sign the attached agreement." />
            <div className="mt-2 rounded border bg-muted/30 p-2 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Insert:</span>
                <button type="button" onClick={() => insertAtCursor("{{rate}}")} className="px-2 py-0.5 rounded border bg-background text-xs font-mono hover:bg-accent transition-colors">{`{{rate}}`}</button>
                <button type="button" onClick={() => insertAtCursor("{{start_date}}")} className="px-2 py-0.5 rounded border bg-background text-xs font-mono hover:bg-accent transition-colors">{`{{start_date}}`}</button>
                <button type="button" onClick={() => insertAtCursor("{{start_time}}")} className="px-2 py-0.5 rounded border bg-background text-xs font-mono hover:bg-accent transition-colors">{`{{start_time}}`}</button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground">Rate</label>
                  <Input className="h-8 text-sm" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="$25/hr" />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Start date</label>
                  <Input type="date" className="h-8 text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Start time</label>
                  <Select value={startTime} onValueChange={setStartTime}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select time" /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      {Array.from({ length: 48 }, (_, i) => {
                        const h24 = Math.floor(i / 2);
                        const m = i % 2 === 0 ? "00" : "30";
                        const val = `${String(h24).padStart(2, "0")}:${m}`;
                        const ampm = h24 >= 12 ? "PM" : "AM";
                        const h12 = h24 % 12 || 12;
                        return <SelectItem key={val} value={val}>{`${h12}:${m} ${ampm}`}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
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
