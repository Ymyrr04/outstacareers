import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, CheckCircle2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { renderPdfPages, RenderedPage } from "@/lib/pdfRender";

const FUNCTIONS_BASE = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const PUBLIC_HEADERS = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };

interface Placement { page: number; x_pct: number; y_pct: number; w_pct: number; h_pct: number; }
interface LoadResponse {
  envelope: {
    id: string;
    status: string;
    recipient_name: string;
    countersign_recipient_name: string | null;
    countersign_recipient_email: string | null;
    countersign_message: string | null;
    countersigned_at: string | null;
  };
  placement: Placement;
  pdf_url: string;
  saved_signature: string | null;
}

function renderMessage(raw: string): string {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    escape(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^\*])\*(?!\s)([^\*\n]+?)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/==(.+?)==/g, '<mark style="background:#fff176; padding:0 2px;">$1</mark>');
  const blocks = raw.replace(/\r\n/g, "\n").split(/\n\s*\n/);
  return blocks.map((block) => {
    const lines = block.split("\n").filter((l) => l.trim().length);
    const isList = lines.length > 0 && lines.every((l) => /^\s*-\s+/.test(l));
    if (isList) {
      const items = lines.map((l) => `<li style="margin:4px 0;">${inline(l.replace(/^\s*-\s+/, ""))}</li>`).join("");
      return `<ul style="padding-left:22px; margin:8px 0;">${items}</ul>`;
    }
    return `<p style="margin:8px 0;">${lines.map(inline).join("<br/>")}</p>`;
  }).join("");
}

const CountersignContract = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LoadResponse | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [sigMode, setSigMode] = useState<"draw" | "type">("draw");
  const [typed, setTyped] = useState("");
  const [sigDataUrl, setSigDataUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        setLoading(true);
        const r = await fetch(`${FUNCTIONS_BASE}/countersign-contract?token=${encodeURIComponent(token)}`, { headers: PUBLIC_HEADERS });
        if (!r.ok) {
          const t = await r.text();
          throw new Error(t || `HTTP ${r.status}`);
        }
        const json = (await r.json()) as LoadResponse;
        setData(json);
        if (json.envelope.countersigned_at) {
          setDone(true);
          setLoading(false);
          return;
        }
        const rendered = await renderPdfPages(json.pdf_url, 900);
        setPages(rendered);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

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

  const submit = async () => {
    if (!token || !sigDataUrl) { toast.error("Please add your signature first"); return; }
    setSubmitting(true);
    try {
      const r = await fetch(`${FUNCTIONS_BASE}/countersign-contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...PUBLIC_HEADERS },
        body: JSON.stringify({ token, signature_data_url: sigDataUrl }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t);
      }
      setDone(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  if (error) return (
    <div className="min-h-screen grid place-items-center p-6">
      <Card className="p-8 max-w-md text-center">
        <ShieldAlert className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h1 className="text-xl font-semibold mb-2">Unable to load document</h1>
        <p className="text-muted-foreground">{error}</p>
      </Card>
    </div>
  );
  if (done) return (
    <div className="min-h-screen grid place-items-center p-6 bg-muted/30">
      <Card className="p-10 max-w-lg text-center">
        <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Thank you — document signed</h1>
        <p className="text-muted-foreground">Your signed contract has been saved.</p>
      </Card>
    </div>
  );
  if (!data) return null;

  const p = data.placement;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <h1 className="font-semibold text-lg leading-tight">Sign — {data.envelope.recipient_name}</h1>
          <p className="text-xs text-muted-foreground">Review the signed contract below, then add your signature.</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {data.envelope.countersign_message && (
          <Card className="p-4 bg-background">
            <div className="text-sm" dangerouslySetInnerHTML={{ __html: renderMessage(data.envelope.countersign_message) }} />
          </Card>
        )}

        <div className="space-y-3">
          {pages.map((pg) => (
            <div key={pg.index} className="relative w-full bg-background shadow-sm border rounded mx-auto" style={{ width: pg.width, maxWidth: "100%" }}>
              <img src={pg.dataUrl} alt={`Page ${pg.index + 1}`} className="w-full block select-none pointer-events-none" />
              {pg.index === p.page && (
                <div
                  className="absolute border-2 border-primary bg-primary/10 flex items-center justify-center text-[11px] font-medium text-primary"
                  style={{
                    left: `${p.x_pct * 100}%`,
                    top: `${p.y_pct * 100}%`,
                    width: `${p.w_pct * 100}%`,
                    height: `${p.h_pct * 100}%`,
                  }}
                >
                  {sigDataUrl
                    ? <img src={sigDataUrl} alt="signature" className="max-h-full max-w-full" />
                    : <span>Sign here ↓</span>}
                </div>
              )}
            </div>
          ))}
        </div>

        <Card className="p-5 sticky bottom-4 shadow-lg space-y-3">
          <p className="text-sm font-medium">Your signature</p>
          <Tabs value={sigMode} onValueChange={(v) => { setSigMode(v as any); sigClear(); }}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="draw">Draw</TabsTrigger>
              <TabsTrigger value="type">Type</TabsTrigger>
            </TabsList>
            <TabsContent value="draw" className="mt-2">
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
            <TabsContent value="type" className="mt-2">
              <Input
                value={typed}
                onChange={(e) => { const t = e.target.value; setTyped(t); setSigDataUrl(typedToDataUrl(t)); }}
                placeholder="Type your name"
                className="text-center text-2xl"
                style={{ fontFamily: "'Brush Script MT', 'Segoe Script', 'Lucida Handwriting', cursive", fontStyle: "italic" }}
              />
            </TabsContent>
          </Tabs>
          <div className="flex justify-between items-center">
            <Button variant="ghost" size="sm" onClick={sigClear}>Clear</Button>
            <Button size="lg" onClick={submit} disabled={submitting || !sigDataUrl}>
              {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…</> : "Finish & Sign"}
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
};

export default CountersignContract;
