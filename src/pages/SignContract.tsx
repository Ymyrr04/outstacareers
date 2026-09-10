import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, CheckCircle2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { renderPdfPages, RenderedPage } from "@/lib/pdfRender";
import { SignaturePad } from "@/components/contracts/SignaturePad";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PrePitchSignView } from "@/components/contracts/PrePitchSignView";
import { formatDate } from "@/lib/dateFormat";

const PRE_PITCH_TEMPLATE_NAME = "OutSta Pre-Pitch Agreement";

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

interface TemplateField {
  id: string;
  field_type: "signature" | "initials" | "date" | "text" | "attachment" | "checkbox";
  page: number;
  x_pct: number;
  y_pct: number;
  width_pct: number;
  height_pct: number;
  label: string | null;
  required: boolean;
  assigned_to: "signer" | "admin" | "system";
  field_key: string | null;
}

interface LoadResponse {
  envelope: {
    id: string;
    status: string;
    recipient_name: string;
    recipient_email: string;
    expires_at: string;
    admin_prefill: Record<string, string>;
    message: string | null;
  };
  template: { id: string; name: string; page_count: number };
  pdf_url: string;
  fields: TemplateField[];
  saved_signature: string | null;
}

const FUNCTIONS_BASE = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const PUBLIC_HEADERS = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };

const SignContract = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LoadResponse | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [values, setValues] = useState<Record<string, { value?: string; signature_data_url?: string }>>({});
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [savedSig, setSavedSig] = useState<string | null>(null);
  const [savedSigPrompt, setSavedSigPrompt] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        setLoading(true);
        const r = await fetch(`${FUNCTIONS_BASE}/sign-contract?token=${encodeURIComponent(token)}`, { headers: PUBLIC_HEADERS });
        if (!r.ok) {
          const t = await r.text();
          throw new Error(t || `HTTP ${r.status}`);
        }
        const json = (await r.json()) as LoadResponse;
        setData(json);
        if (json.envelope.status === "signed") {
          setDone(true);
          setLoading(false);
          return;
        }
        if (json.template?.name !== PRE_PITCH_TEMPLATE_NAME) {
          const rendered = await renderPdfPages(json.pdf_url, 900);
          setPages(rendered);
        }
        const init: Record<string, { value?: string; signature_data_url?: string }> = {};
        const today = new Date().toISOString().slice(0, 10);
        for (const f of json.fields) {
          if (f.assigned_to === "admin") {
            const key = (f.field_key || f.label || "") as string;
            const v = json.envelope.admin_prefill?.[key];
            if (v) init[f.id] = { value: v };
          }
          if (f.assigned_to === "system" && f.field_type === "date") {
            init[f.id] = { value: today };
          }
        }
        setValues(init);

        // Look for saved signature: server (by email) or localStorage fallback
        let found = json.saved_signature;
        const email = json.envelope.recipient_email?.toLowerCase();
        if (!found && email) {
          try { found = localStorage.getItem(`sig:${email}`); } catch { /* ignore */ }
        }
        if (found) {
          setSavedSig(found);
          setSavedSigPrompt(true);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const signerFields = useMemo(() => (data?.fields ?? []).filter(f => f.assigned_to !== "admin"), [data]);
  const completedCount = signerFields.filter(f => {
    const v = values[f.id];
    if (f.field_type === "attachment") return !!v?.signature_data_url;
    if (f.field_type === "signature" || f.field_type === "initials") return !!v?.signature_data_url;
    if (f.field_type === "checkbox") return v?.value === "true";
    return !!v?.value;
  }).length;
  const requiredCount = signerFields.filter(f => f.required).length;

  const submit = async () => {
    if (!token || !data) return;
    if (!consent) {
      toast.error("Please confirm consent to sign electronically.");
      return;
    }
    for (const f of signerFields) {
      if (!f.required) continue;
      const v = values[f.id];
      const ok = (f.field_type === "signature" || f.field_type === "initials" || f.field_type === "attachment")
        ? !!v?.signature_data_url
        : f.field_type === "checkbox"
        ? v?.value === "true"
        : !!v?.value;
      if (!ok) {
        toast.error(`Please complete: ${f.label || f.field_type}`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const fieldValues = Object.entries(values).map(([template_field_id, v]) => ({
        template_field_id,
        value: v.value,
        signature_data_url: v.signature_data_url,
      }));
      const r = await fetch(`${FUNCTIONS_BASE}/sign-contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...PUBLIC_HEADERS },
        body: JSON.stringify({ token, fieldValues, consent: true }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t);
      }
      // Cache locally for future signings on this browser
      try {
        const email = data.envelope.recipient_email?.toLowerCase();
        const sigField = signerFields.find(f => f.field_type === "signature");
        const sigUrl = sigField ? values[sigField.id]?.signature_data_url : undefined;
        if (email && sigUrl) localStorage.setItem(`sig:${email}`, sigUrl);
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
        <p className="text-muted-foreground">A copy of the signed contract and its audit trail have been emailed to you and to OutSta.</p>
      </Card>
    </div>
  );

  if (!data) return null;

  if (data.template?.name === PRE_PITCH_TEMPLATE_NAME) {
    return (
      <PrePitchSignView
        token={token!}
        recipientName={data.envelope.recipient_name}
        expiresAt={data.envelope.expires_at}
        savedSignature={savedSig}
        onDone={() => setDone(true)}
      />
    );
  }


  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-semibold text-lg leading-tight">OutSta Agreement - {data.envelope.recipient_name}</h1>
            <p className="text-xs text-muted-foreground">For {data.envelope.recipient_name} • Expires {formatDate(data.envelope.expires_at)}</p>
          </div>
          <div className="text-sm">
            <span className="font-medium">{completedCount}</span>
            <span className="text-muted-foreground"> / {requiredCount} required</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {data.envelope.message && (
          <Card className="p-4 bg-background">
            <div className="text-sm" dangerouslySetInnerHTML={{ __html: renderMessage(data.envelope.message) }} />
          </Card>
        )}



        {pages.map((p) => {
          const pageFields = data.fields.filter(f => (f.page - 1) === p.index);
          return (
            <div key={p.index} className="bg-background shadow-sm border rounded relative mx-auto" style={{ width: p.width, maxWidth: "100%" }}>
              <img src={p.dataUrl} alt={`Page ${p.index + 1}`} className="w-full block select-none pointer-events-none" />
              <div className="absolute inset-0">
                {pageFields.map((f) => {
                  const v = values[f.id] || {};
                  const style: React.CSSProperties = {
                    position: "absolute",
                    left: `${f.x_pct * 100}%`,
                    top: `${f.y_pct * 100}%`,
                    width: `${f.width_pct * 100}%`,
                    height: `${f.height_pct * 100}%`,
                  };
                  const adminLocked = f.assigned_to === "admin" || f.assigned_to === "system";
                  return (
                    <div key={f.id} style={style} className="group">
                      {renderFieldOverlay(f, v, adminLocked, (next) => setValues((prev) => ({ ...prev, [f.id]: { ...prev[f.id], ...next } })), savedSig)}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <Card className="p-5 sticky bottom-4 shadow-lg">
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox checked={consent} onCheckedChange={(c) => setConsent(c === true)} />
            <span className="text-sm">
              I agree that my electronic signature on this document is the legal equivalent of my handwritten signature, and that this document is binding on me.
            </span>
          </label>
          <div className="flex justify-end mt-4">
            <Button size="lg" onClick={submit} disabled={submitting || !consent}>
              {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing…</> : "Finish & Sign"}
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
};

function renderFieldOverlay(
  f: TemplateField,
  v: { value?: string; signature_data_url?: string },
  locked: boolean,
  set: (next: { value?: string; signature_data_url?: string }) => void,
  savedSig?: string | null,
) {
  const baseBox = "w-full h-full border-2 border-dashed border-amber-600 bg-amber-200/70 hover:bg-amber-300/80 ring-2 ring-amber-500/70 shadow-md transition flex items-center text-xs";

  if (f.field_type === "signature" || f.field_type === "initials") {
    const showSavedPrompt = !!savedSig && !v.signature_data_url && f.field_type === "signature";
    return (
      <Popover>
        <PopoverTrigger asChild disabled={locked}>
          <button className={`${baseBox} cursor-pointer px-2 ${v.signature_data_url ? "border-emerald-500 bg-emerald-500/10" : ""}`}>
            {v.signature_data_url
              ? <img src={v.signature_data_url} alt="sig" className="max-h-full max-w-full" />
              : <span className="text-primary font-medium">{f.field_type === "initials" ? "Initials" : "Sign here"}</span>}
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
                  set({ signature_data_url: savedSig! });
                }}
              >
                Use it
              </Button>
            </div>
          )}
          <p className="text-xs font-medium mb-2">{f.label || (f.field_type === "initials" ? "Your initials" : "Your signature")}</p>
          <SignaturePad
            value={v.signature_data_url || null}
            onChange={(d) => set({ signature_data_url: d || undefined })}
            allowType={f.field_type === "initials"}
          />
        </PopoverContent>
      </Popover>
    );
  }

  if (f.field_type === "attachment") {
    return (
      <label
        className={`${baseBox} cursor-pointer justify-center px-2 overflow-hidden ${v.signature_data_url ? "border-emerald-500 bg-emerald-500/10" : ""} ${locked ? "pointer-events-none opacity-70" : ""}`}
      >
        {v.signature_data_url
          ? <img src={v.signature_data_url} alt="attachment" className="max-h-full max-w-full object-contain" />
          : <span className="text-primary font-medium">📎 {f.label || "Attach image"}</span>}
        <input
          type="file"
          accept="image/png,image/jpeg,image/jpg"
          className="hidden"
          disabled={locked}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => set({ signature_data_url: reader.result as string });
            reader.readAsDataURL(file);
          }}
        />
      </label>
    );
  }

  if (f.field_type === "checkbox") {
    const checked = v.value === "true";
    return (
      <label className={`${baseBox} cursor-pointer justify-center overflow-hidden ${checked ? "border-emerald-500 bg-emerald-500/10" : ""} ${locked ? "pointer-events-none opacity-70" : ""}`}>
        <input
          type="checkbox"
          checked={checked}
          disabled={locked}
          onChange={(e) => set({ value: e.target.checked ? "true" : "false" })}
          className="w-5 h-5 accent-primary"
        />
      </label>
    );
  }

  return (
    <input
      type={f.field_type === "date" ? "date" : "text"}
      value={v.value ?? ""}
      disabled={locked}
      onChange={(e) => set({ value: e.target.value })}
      placeholder={f.label || ""}
      className={`${baseBox} px-2 outline-none bg-white/80 ${v.value ? "border-emerald-500 bg-emerald-500/5" : ""}`}
    />
  );
}

export default SignContract;
