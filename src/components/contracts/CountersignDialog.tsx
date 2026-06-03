import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, X, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { renderPdfPages, RenderedPage } from "@/lib/pdfRender";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  envelopeId: string;
  signedPdfPath: string;
  recipientName: string;
  defaultRecipientName?: string;
  defaultRecipientEmail?: string;
  onDone: () => void;
}

interface Placement { page: number; x_pct: number; y_pct: number; w_pct: number; h_pct: number; }
interface MsgTemplate { id: string; name: string; message: string; }

type Step = 1 | 2;

export const CountersignDialog = ({ open, onOpenChange, envelopeId, signedPdfPath, recipientName, defaultRecipientName, defaultRecipientEmail, onDone }: Props) => {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const dragRef = useRef<{ mode: "move" | "resize"; startX: number; startY: number; pageEl: HTMLDivElement } | null>(null);

  const [managerName, setManagerName] = useState("");
  const [managerEmail, setManagerEmail] = useState("");
  const [message, setMessage] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(14);
  const [sending, setSending] = useState(false);

  const [msgTemplates, setMsgTemplates] = useState<MsgTemplate[]>([]);
  const [msgTemplateId, setMsgTemplateId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setPlacement(null);
    setManagerName(defaultRecipientName || "");
    setManagerEmail(defaultRecipientEmail || "");
    setMessage("");
    setMsgTemplateId("");
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.storage.from("contract-signed").download(signedPdfPath);
        if (error || !data) throw new Error(error?.message || "Failed to load PDF");
        const url = URL.createObjectURL(data);
        const rendered = await renderPdfPages(url, 800);
        setPages(rendered);
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        const { data: tpl } = await supabase
          .from("contract_countersign_message_templates")
          .select("id, name, message")
          .order("name");
        setMsgTemplates((tpl || []) as MsgTemplate[]);
      } catch (e) {
        toast.error((e as Error).message);
        onOpenChange(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, signedPdfPath]);

  const onPdfClick = (pageIndex: number) => (e: React.MouseEvent<HTMLDivElement>) => {
    if (placement) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const w = 0.25;
    const h = 0.08;
    setPlacement({ page: pageIndex, x_pct: Math.max(0, Math.min(1 - w, x - w / 2)), y_pct: Math.max(0, Math.min(1 - h, y - h / 2)), w_pct: w, h_pct: h });
  };

  const startInteraction = (mode: "move" | "resize", e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!placement) return;
    const pageEl = pageRefs.current.get(placement.page);
    if (!pageEl) return;
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, pageEl };
    const move = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const rect = d.pageEl.getBoundingClientRect();
      const dx = (ev.clientX - d.startX) / rect.width;
      const dy = (ev.clientY - d.startY) / rect.height;
      d.startX = ev.clientX;
      d.startY = ev.clientY;
      setPlacement(p => {
        if (!p) return p;
        if (d.mode === "move") {
          return {
            ...p,
            x_pct: Math.max(0, Math.min(1 - p.w_pct, p.x_pct + dx)),
            y_pct: Math.max(0, Math.min(1 - p.h_pct, p.y_pct + dy)),
          };
        }
        return {
          ...p,
          w_pct: Math.max(0.05, Math.min(1 - p.x_pct, p.w_pct + dx)),
          h_pct: Math.max(0.03, Math.min(1 - p.y_pct, p.h_pct + dy)),
        };
      });
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

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
      .from("contract_countersign_message_templates")
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
    const { error } = await supabase.from("contract_countersign_message_templates").delete().eq("id", msgTemplateId);
    if (error) return toast.error(error.message);
    setMsgTemplates(prev => prev.filter(m => m.id !== msgTemplateId));
    setMsgTemplateId("");
    toast.success("Template deleted");
  };

  const send = async () => {
    if (!placement) return toast.error("Place the signature box first.");
    if (!managerName.trim() || !managerEmail.trim()) return toast.error("Manager name and email are required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail.trim())) return toast.error("Please enter a valid email address.");
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-countersign-request", {
        body: {
          envelopeId,
          recipientName: managerName.trim(),
          recipientEmail: managerEmail.trim(),
          message,
          placement,
          expiresInDays,
        },
      });
      if (error) throw error;
      const signUrl = (data as any)?.signUrl;
      if (signUrl) {
        try { await navigator.clipboard.writeText(signUrl); } catch {}
        toast.success("Countersignature request sent — link copied to clipboard");
      } else {
        toast.success("Countersignature request sent");
      }
      onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const tryClose = (v: boolean) => {
    if (!v && (placement || message || managerEmail)) {
      if (!confirm("Discard this countersignature request?")) return;
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={tryClose}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send for Countersignature — {recipientName}</DialogTitle>
          <DialogDescription>
            Step {step} of 2 — {step === 1 ? "Place where the manager should sign" : "Email details & message"}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
        )}

        {!loading && step === 1 && pages.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Click anywhere on the document to drop the signature box. Drag to reposition, drag the bottom-right corner to resize. Scroll to navigate.</p>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{pages.length} {pages.length === 1 ? "page" : "pages"}</span>
              {placement && <span>Signature placed on page {placement.page + 1}</span>}
            </div>
            <div className="border rounded bg-muted/30 overflow-y-auto space-y-3 p-3" style={{ height: "70vh" }}>
              {pages.map((pg) => (
                <div
                  key={pg.index}
                  ref={(el) => { if (el) pageRefs.current.set(pg.index, el); else pageRefs.current.delete(pg.index); }}
                  className="relative w-full bg-white shadow-sm"
                  onClick={onPdfClick(pg.index)}
                  style={{ cursor: placement ? "default" : "crosshair" }}
                >
                  <img src={pg.dataUrl} alt={`Page ${pg.index + 1}`} className="w-full block select-none pointer-events-none" />
                  {placement && placement.page === pg.index && (
                    <div
                      className="absolute border-2 border-primary bg-primary/10 flex items-center justify-center text-[10px] font-medium text-primary cursor-move select-none"
                      style={{
                        left: `${placement.x_pct * 100}%`,
                        top: `${placement.y_pct * 100}%`,
                        width: `${placement.w_pct * 100}%`,
                        height: `${placement.h_pct * 100}%`,
                      }}
                      onMouseDown={(e) => startInteraction("move", e)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="truncate px-1 pointer-events-none opacity-70">Signature</span>
                      <div
                        className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-primary border border-background rounded-sm cursor-nwse-resize"
                        onMouseDown={(e) => startInteraction("resize", e)}
                        title="Drag to resize"
                      />
                      <button
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center shadow"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setPlacement(null); }}
                      ><X className="w-3 h-3" /></button>
                    </div>
                  )}
                  <div className="absolute bottom-1 right-2 text-[10px] text-muted-foreground bg-white/70 px-1 rounded">{pg.index + 1}/{pages.length}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => tryClose(false)}>Cancel</Button>
              <Button onClick={() => setStep(2)} disabled={!placement}>Next →</Button>
            </div>
          </div>
        )}

        {!loading && step === 2 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Manager name</label>
                <Input value={managerName} onChange={(e) => setManagerName(e.target.value)} placeholder="e.g. Mark Chua" />
              </div>
              <div>
                <label className="text-sm font-medium">Manager email</label>
                <Input type="email" value={managerEmail} onChange={(e) => setManagerEmail(e.target.value)} placeholder="manager@company.com" />
              </div>
            </div>

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
              <Textarea rows={8} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={`Hi — please add your countersignature to the contract signed by ${recipientName}.`} />
              <p className="text-[11px] text-muted-foreground mt-1">Markdown: **bold** *italic* ==highlight== - bullet</p>
            </div>

            <div>
              <label className="text-sm font-medium">Link expires in (days)</label>
              <Input type="number" value={expiresInDays} onChange={(e) => setExpiresInDays(+e.target.value)} className="w-24" />
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>← Back</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => tryClose(false)}>Cancel</Button>
                <Button onClick={send} disabled={sending}>
                  {sending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</> : "Send for Countersignature"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
