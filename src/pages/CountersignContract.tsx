import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, CheckCircle2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SignaturePad } from "@/components/contracts/SignaturePad";
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
  const [sigDataUrl, setSigDataUrl] = useState<string | null>(null);
  const [savedSig, setSavedSig] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

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

        let found = json.saved_signature;
        const email = json.envelope.countersign_recipient_email?.toLowerCase();
        if (!found && email) {
          try { found = localStorage.getItem(`sig:${email}`); } catch { /* ignore */ }
        }
        if (found) setSavedSig(found);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

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
      try {
        const email = data?.envelope.countersign_recipient_email?.toLowerCase();
        if (email) localStorage.setItem(`sig:${email}`, sigDataUrl);
      } catch { /* ignore */ }
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
  const showSavedPrompt = !!savedSig && !sigDataUrl;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <h1 className="font-semibold text-lg leading-tight">Sign — {data.envelope.recipient_name}</h1>
          <p className="text-xs text-muted-foreground">Review the signed contract below, then click the highlighted box to add your signature.</p>
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
                  className="absolute"
                  style={{
                    left: `${p.x_pct * 100}%`,
                    top: `${p.y_pct * 100}%`,
                    width: `${p.w_pct * 100}%`,
                    height: `${p.h_pct * 100}%`,
                  }}
                >
                  <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                    <PopoverTrigger asChild>
                      <button
                        className={`w-full h-full border-2 border-dashed border-amber-600 bg-amber-200/70 hover:bg-amber-300/80 ring-2 ring-amber-500/70 shadow-md transition flex items-center justify-center text-xs font-medium text-primary ${sigDataUrl ? "border-emerald-500 bg-emerald-500/10 ring-emerald-500/70" : ""}`}
                      >
                        {sigDataUrl
                          ? <img src={sigDataUrl} alt="signature" className="max-h-full max-w-full" />
                          : <span>Click to sign ↓</span>}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[420px] p-3">
                      {showSavedPrompt && (
                        <div className="mb-3 p-2 rounded border border-primary/30 bg-primary/5 flex items-center gap-2">
                          <img src={savedSig!} alt="saved" className="h-10 max-w-[120px] object-contain bg-white border rounded px-1" />
                          <div className="flex-1">
                            <p className="text-xs font-medium">Use your previous signature?</p>
                          </div>
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              setSigDataUrl(savedSig);
                              setPopoverOpen(false);
                              toast.success("Saved signature applied");
                            }}
                          >
                            Use it
                          </Button>
                        </div>
                      )}
                      <p className="text-xs font-medium mb-2">Your signature</p>
                      <SignaturePad
                        value={sigDataUrl}
                        onChange={(d) => setSigDataUrl(d)}
                        allowType
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
          ))}
        </div>

        <Card className="p-5 sticky bottom-4 shadow-lg flex items-center justify-between gap-3">
          <p className="text-sm">
            {sigDataUrl
              ? <span className="text-emerald-600 font-medium">Signature added.</span>
              : <span className="text-muted-foreground">Click the highlighted box on the document to add your signature.</span>}
          </p>
          <Button size="lg" onClick={submit} disabled={submitting || !sigDataUrl}>
            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…</> : "Finish & Sign"}
          </Button>
        </Card>
      </main>
    </div>
  );
};

export default CountersignContract;
