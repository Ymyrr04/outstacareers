import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, ChevronLeft, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { renderPdfPages, RenderedPage } from "@/lib/pdfRender";
import { PDFDocument } from "pdf-lib";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  envelopeId: string;
  signedPdfPath: string;
  recipientName: string;
  onDone: () => void;
}

interface Placement {
  page: number; // 0-based
  x_pct: number;
  y_pct: number;
  w_pct: number;
  h_pct: number;
}

type Step = 1 | 2 | 3;

export const CountersignDialog = ({ open, onOpenChange, envelopeId, signedPdfPath, recipientName, onDone }: Props) => {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const dragRef = useRef<{ mode: "move" | "resize"; startX: number; startY: number; pageEl: HTMLDivElement } | null>(null);

  // Signature
  const [sigMode, setSigMode] = useState<"draw" | "type">("draw");
  const [typed, setTyped] = useState("");
  const [sigDataUrl, setSigDataUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  // Final
  const [finalBytes, setFinalBytes] = useState<Uint8Array | null>(null);
  const [finalPages, setFinalPages] = useState<RenderedPage[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load signed PDF on open
  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      setStep(1);
      setPlacement(null);
      setSigDataUrl(null);
      setTyped("");
      setFinalBytes(null);
      setFinalPages([]);
      setSaved(false);
      try {
        const { data, error } = await supabase.storage.from("contract-signed").download(signedPdfPath);
        if (error || !data) throw new Error(error?.message || "Failed to load PDF");
        const buf = new Uint8Array(await data.arrayBuffer());
        setPdfBytes(buf);
        const url = URL.createObjectURL(data);
        const rendered = await renderPdfPages(url, 800);
        setPages(rendered);
        setCurrentPage(0);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (e) {
        toast.error((e as Error).message);
        onOpenChange(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, signedPdfPath]);

  // PDF click to place signature box
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

  // Signature canvas
  const getCtx = () => {
    const c = canvasRef.current;
    if (!c) return null;
    const ctx = c.getContext("2d");
    if (ctx) { ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#0a0a0a"; }
    return ctx;
  };
  const sigPos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const sigStart = (e: React.PointerEvent) => { drawing.current = true; const ctx = getCtx(); const p = sigPos(e); ctx?.beginPath(); ctx?.moveTo(p.x, p.y); };
  const sigMove = (e: React.PointerEvent) => { if (!drawing.current) return; const ctx = getCtx(); const p = sigPos(e); ctx?.lineTo(p.x, p.y); ctx?.stroke(); };
  const sigEnd = () => { if (!drawing.current) return; drawing.current = false; const c = canvasRef.current; if (c) setSigDataUrl(c.toDataURL("image/png")); };
  const sigClear = () => {
    const c = canvasRef.current;
    if (c) c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setSigDataUrl(null);
    setTyped("");
  };

  const typedToDataUrl = (text: string) => {
    if (!text.trim()) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 600; canvas.height = 140;
    const ctx = canvas.getContext("2d"); if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0a0a0a";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.font = "italic 64px 'Brush Script MT', 'Segoe Script', 'Lucida Handwriting', cursive";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    return canvas.toDataURL("image/png");
  };

  // Apply signature into PDF
  const applyToDocument = async () => {
    if (!placement || !sigDataUrl || !pdfBytes) {
      toast.error("Place a signature and add your signature first");
      return;
    }
    try {
      setLoading(true);
      const pdf = await PDFDocument.load(pdfBytes);
      const page = pdf.getPage(placement.page);
      const { width: pw, height: ph } = page.getSize();
      const pngBytes = await (await fetch(sigDataUrl)).arrayBuffer();
      const png = await pdf.embedPng(pngBytes);
      const w = placement.w_pct * pw;
      const h = placement.h_pct * ph;
      const x = placement.x_pct * pw;
      // pdf-lib y origin is bottom-left
      const y = ph - (placement.y_pct * ph) - h;
      page.drawImage(png, { x, y, width: w, height: h });
      const out = await pdf.save();
      setFinalBytes(out);
      // Render preview
      const blob = new Blob([out as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const rendered = await renderPdfPages(url, 800);
      setFinalPages(rendered);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStep(3);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const saveAndDownload = async () => {
    if (!finalBytes) return;
    setSaving(true);
    try {
      const path = `countersigned/${envelopeId}-${Date.now()}.pdf`;
      const blob = new Blob([finalBytes as BlobPart], { type: "application/pdf" });
      const { error: upErr } = await supabase.storage.from("contract-signed").upload(path, blob, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;
      const { error: updErr } = await supabase
        .from("contract_envelopes")
        .update({ countersigned_file_url: path, countersigned_at: new Date().toISOString() })
        .eq("id", envelopeId);
      if (updErr) throw updErr;

      // Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `countersigned-${recipientName}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setSaved(true);
      toast.success("Countersigned and saved");
      onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const tryClose = (v: boolean) => {
    if (!v && !saved && (placement || sigDataUrl || finalBytes)) {
      if (!confirm("You haven't saved the countersigned contract yet. Close anyway?")) return;
    }
    onOpenChange(v);
  };

  const page = pages[currentPage];

  return (
    <Dialog open={open} onOpenChange={tryClose}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Countersign — {recipientName}</DialogTitle>
          <DialogDescription>
            Step {step} of 3 — {step === 1 ? "Place Signature" : step === 2 ? "Draw or Type Signature" : "Save & Download"}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
        )}

        {!loading && step === 1 && pages.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Click anywhere on the document to place the manager's signature. Drag to reposition, drag the bottom-right corner to resize. Scroll to navigate.</p>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{pages.length} {pages.length === 1 ? "page" : "pages"}</span>
              {placement && <span>Signature placed on page {placement.page + 1}</span>}
            </div>
            <div className="border rounded bg-muted/30 overflow-y-auto space-y-3 p-3" style={{ height: "78vh" }}>
              {pages.map((pg) => (
                <div
                  key={pg.index}
                  className="relative w-full bg-white shadow-sm"
                  onClick={onPdfClick(pg.index)}
                  style={{ cursor: placement ? "default" : "crosshair" }}
                >
                  <img src={pg.dataUrl} alt={`Page ${pg.index + 1}`} className="w-full block select-none pointer-events-none" />
                  {placement && placement.page === pg.index && (
                    <div
                      className="absolute border-2 border-primary bg-primary/20 flex items-center justify-center text-xs font-medium text-primary cursor-move select-none"
                      style={{
                        left: `${placement.x_pct * 100}%`,
                        top: `${placement.y_pct * 100}%`,
                        width: `${placement.w_pct * 100}%`,
                        height: `${placement.h_pct * 100}%`,
                      }}
                      onPointerDown={onBoxPointerDown}
                      onPointerMove={onBoxPointerMove}
                      onPointerUp={onBoxPointerUp}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Manager Signature
                      <div
                        className="absolute bottom-0 right-0 w-3 h-3 bg-primary cursor-se-resize"
                        onPointerDown={(e) => { e.stopPropagation(); setResizing(true); (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
                      />
                      <button
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center"
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
              <Button onClick={() => setStep(2)} disabled={!placement}>Add Signature →</Button>
            </div>
          </div>
        )}

        {!loading && step === 2 && (
          <div className="space-y-3">
            <Tabs value={sigMode} onValueChange={(v) => { setSigMode(v as any); sigClear(); }}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="draw">Draw</TabsTrigger>
                <TabsTrigger value="type">Type</TabsTrigger>
              </TabsList>
              <TabsContent value="draw" className="space-y-2 mt-2">
                <p className="text-xs text-muted-foreground">Draw the manager's signature below</p>
                <div className="border rounded bg-white">
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={140}
                    className="w-full touch-none cursor-crosshair"
                    onPointerDown={sigStart}
                    onPointerMove={sigMove}
                    onPointerUp={sigEnd}
                    onPointerLeave={sigEnd}
                  />
                </div>
              </TabsContent>
              <TabsContent value="type" className="space-y-2 mt-2">
                <p className="text-xs text-muted-foreground">Type the manager's name</p>
                <Input
                  value={typed}
                  onChange={(e) => { const t = e.target.value; setTyped(t); setSigDataUrl(typedToDataUrl(t)); }}
                  placeholder="e.g. Mark Smith"
                  className="text-center text-2xl"
                  style={{ fontFamily: "'Brush Script MT', 'Segoe Script', 'Lucida Handwriting', cursive", fontStyle: "italic" }}
                />
              </TabsContent>
            </Tabs>

            {sigDataUrl && (
              <div className="border rounded p-3 bg-muted/30">
                <p className="text-xs text-muted-foreground mb-2">Preview:</p>
                <img src={sigDataUrl} alt="Signature preview" className="max-h-24 mx-auto" />
              </div>
            )}

            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={sigClear}>Clear</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>← Back</Button>
                <Button onClick={applyToDocument} disabled={!sigDataUrl || loading}>Apply to Document →</Button>
              </div>
            </div>
          </div>
        )}

        {!loading && step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Preview of the countersigned document:</p>
            <div className="max-h-[50vh] overflow-y-auto border rounded bg-muted/30 space-y-2 p-2">
              {finalPages.map(p => (
                <img key={p.index} src={p.dataUrl} alt={`Page ${p.index + 1}`} className="w-full block" />
              ))}
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => { setStep(1); setSigDataUrl(null); setTyped(""); setFinalBytes(null); setFinalPages([]); }}>Start over</Button>
              <Button onClick={saveAndDownload} disabled={saving}>
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Save & Download"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
