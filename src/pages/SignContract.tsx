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

interface TemplateField {
  id: string;
  field_type: "signature" | "initials" | "date" | "text" | "checkbox";
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
}

const FUNCTIONS_BASE = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1`;

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

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        setLoading(true);
        const r = await fetch(`${FUNCTIONS_BASE}/sign-contract?token=${encodeURIComponent(token)}`);
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
        const rendered = await renderPdfPages(json.pdf_url, 900);
        setPages(rendered);
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
    if (f.field_type === "checkbox") return v?.value === "true";
    if (f.field_type === "signature" || f.field_type === "initials") return !!v?.signature_data_url;
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
      const ok = f.field_type === "checkbox" ? v?.value === "true"
        : (f.field_type === "signature" || f.field_type === "initials") ? !!v?.signature_data_url
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, fieldValues, consent: true }),
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
        <p className="text-muted-foreground">A copy of the signed contract and its audit trail have been emailed to you and to OutSta.</p>
      </Card>
    </div>
  );

  if (!data) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-semibold text-lg leading-tight">{data.template.name}</h1>
            <p className="text-xs text-muted-foreground">For {data.envelope.recipient_name} • Expires {new Date(data.envelope.expires_at).toLocaleDateString()}</p>
          </div>
          <div className="text-sm">
            <span className="font-medium">{completedCount}</span>
            <span className="text-muted-foreground"> / {requiredCount} required</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {data.envelope.message && (
          <Card className="p-4 bg-background"><p className="text-sm whitespace-pre-wrap">{data.envelope.message}</p></Card>
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
                      {renderFieldOverlay(f, v, adminLocked, (next) => setValues((prev) => ({ ...prev, [f.id]: { ...prev[f.id], ...next } })), data.envelope.recipient_name)}
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
  signerName: string,
) {
  const baseBox = "w-full h-full border border-dashed border-primary/60 bg-primary/5 hover:bg-primary/10 transition flex items-center text-xs";

  if (f.field_type === "signature" || f.field_type === "initials") {
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
          <p className="text-xs font-medium mb-2">{f.label || (f.field_type === "initials" ? "Your initials" : "Your signature")}</p>
          <SignaturePad
            value={v.signature_data_url || null}
            onChange={(d) => set({ signature_data_url: d || undefined })}
            signerName={f.field_type === "initials" ? signerName.split(" ").map(p => p[0]).join("") : signerName}
          />
        </PopoverContent>
      </Popover>
    );
  }

  if (f.field_type === "checkbox") {
    return (
      <button
        type="button"
        disabled={locked}
        onClick={() => set({ value: v.value === "true" ? "false" : "true" })}
        className={`${baseBox} justify-center text-base ${v.value === "true" ? "bg-emerald-500/10 border-emerald-500" : ""}`}
      >
        {v.value === "true" ? "✓" : ""}
      </button>
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
