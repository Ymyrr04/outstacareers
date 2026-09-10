import { useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { SignaturePad } from "@/components/contracts/SignaturePad";
import { formatDate } from "@/lib/dateFormat";

const FUNCTIONS_BASE = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const PUBLIC_HEADERS = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };

const TERMS = [
  {
    title: "Security deposit",
    body: "A two-week security deposit will be held by OutSta for the duration of your contract. This deposit will be released in full on your final working day, provided there are no outstanding issues or claims. This is a standard requirement for all contractors and is non-negotiable.",
  },
  {
    title: "Payment method — Payoneer only",
    body: "All payments are processed exclusively through Payoneer. This is required for our tax and accounting compliance. Direct bank transfers or any other payment methods are not supported. Please ensure you have an active Payoneer account set up before your start date.",
  },
  {
    title: "Employment status — full - time Independent contractor",
    body: "You will be engaged as a full - time Independent contractor, working dedicated hours exclusively for your assigned client. While you work full-time hours, your engagement is on a contractor basis — meaning you are responsible for your own taxes and statutory compliance in your country of residence. OutSta does not provide employment benefits such as paid leave, health insurance, or retirement contributions.",
  },
  {
    title: "Working hours — as per client requirement",
    body: "Your working hours are based on the client's requirements, up to a maximum of 50 hours per week as stated in the contract. Your agreed hours will be confirmed during the offer stage. Any overtime beyond the agreed hours must be mutually agreed upon by both parties in advance.",
  },
  {
    title: "Rate — as agreed during offer",
    body: "Your rate is the hourly or weekly rate discussed and agreed upon during your offer conversation with our recruitment manager. This rate is final and forms part of your contract. Rate adjustments cannot be made after the contract has been signed and executed.",
  },
  {
    title: "Probation period",
    body: "All contractors are subject to a two-week probation period starting from their first day of work. During this period, either party may end the engagement without the standard notice requirement. Successful completion of the probation period confirms your continued placement with the client. OutSta and the client reserve the right to assess your performance, work quality, and overall fit during this time.",
  },
];

interface Props {
  token: string;
  recipientName: string;
  expiresAt: string;
  savedSignature: string | null;
  onDone: () => void;
}

export const PrePitchSignView = ({ token, recipientName, expiresAt, savedSignature, onDone }: Props) => {
  const [terms, setTerms] = useState<boolean[]>([false, false, false, false, false, false]);
  const [finalConfirm, setFinalConfirm] = useState(false);
  const [fullName, setFullName] = useState(recipientName || "");
  const [signature, setSignature] = useState<string | null>(savedSignature);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const completed =
    terms.filter(Boolean).length + (finalConfirm ? 1 : 0) + (fullName.trim() ? 1 : 0) + (signature ? 1 : 0);
  const totalRequired = 6 + 1 + 1 + 1;

  const setTerm = (i: number, v: boolean) => setTerms(prev => prev.map((t, idx) => (idx === i ? v : t)));

  const submit = async () => {
    if (!consent) return toast.error("Please confirm consent to sign electronically.");
    if (terms.some(t => !t)) return toast.error("Please tick all six terms.");
    if (!finalConfirm) return toast.error("Please tick the final confirmation.");
    if (!fullName.trim()) return toast.error("Please enter your full name.");
    if (!signature) return toast.error("Please add your signature.");

    setSubmitting(true);
    try {
      const r = await fetch(`${FUNCTIONS_BASE}/sign-prepitch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...PUBLIC_HEADERS },
        body: JSON.stringify({
          token,
          fullName: fullName.trim(),
          signatureDataUrl: signature,
          terms,
          finalConfirm,
          consent: true,
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `HTTP ${r.status}`);
      }
      try {
        const email = recipientName ? null : null; // signature is cached by edge function
        void email;
      } catch { /* ignore */ }
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-semibold text-2xl leading-tight">OutSta Pre-Pitch Agreement</h1>
            <p className="text-base text-muted-foreground">For {recipientName} • Expires {formatDate(expiresAt)}</p>
          </div>
          <div className="text-lg">
            <span className="font-medium">{completed}</span>
            <span className="text-muted-foreground"> / {totalRequired} complete</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <Card className="p-8 bg-background">
          <div className="bg-teal-700 text-white rounded-md p-7 -mx-2 -mt-2 mb-6">
            <h2 className="text-4xl font-bold leading-none">OutSta</h2>
            <p className="text-lg opacity-90 mt-2">Pre-Pitch Agreement</p>
          </div>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Before we move forward with presenting you to our client, please read each term carefully and tick the box beside it to confirm your understanding. Sign and print your full name at the bottom. This agreement must be completed before we can proceed with your placement.
          </p>
        </Card>

        {TERMS.map((t, i) => (
          <Card key={i} className={`p-7 transition border-2 ${terms[i] ? "border-emerald-500/50 bg-emerald-500/5" : "border-border"}`}>
            <label className="flex gap-5 cursor-pointer">
              <Checkbox
                checked={terms[i]}
                onCheckedChange={(c) => setTerm(i, c === true)}
                className="mt-1.5 h-7 w-7"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">Term 0{i + 1}</p>
                <h3 className="font-semibold text-xl mt-1">{t.title}</h3>
                <p className="text-base text-muted-foreground mt-3 leading-relaxed">{t.body}</p>
              </div>
            </label>
          </Card>
        ))}

        <Card className={`p-7 border-2 ${finalConfirm ? "border-emerald-500/50 bg-emerald-500/5" : "border-border"}`}>
          <p className="text-sm font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 mb-3">Final confirmation</p>
          <label className="flex gap-5 cursor-pointer">
            <Checkbox
              checked={finalConfirm}
              onCheckedChange={(c) => setFinalConfirm(c === true)}
              className="mt-1.5 h-7 w-7"
            />
            <span className="text-base leading-relaxed">
              I confirm that I have read, understood, and agree to all six terms listed above. I understand that by signing below, I am acknowledging my acceptance of these conditions before being presented to the client.
            </span>
          </label>
        </Card>

        <Card className="p-7">
          <h3 className="font-semibold text-xl mb-5">Sign below</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Full name (printed)</label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full legal name"
                className="mt-2 h-14 text-lg"
              />
            </div>
            <div>
              <label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Signature</label>
              <div className="mt-2">
                <SignaturePad value={signature} onChange={setSignature} />
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6 sticky bottom-4 shadow-lg">
          <label className="flex items-start gap-4 cursor-pointer">
            <Checkbox checked={consent} onCheckedChange={(c) => setConsent(c === true)} className="mt-1 h-6 w-6" />
            <span className="text-base leading-relaxed">
              I agree that my electronic signature on this document is the legal equivalent of my handwritten signature, and that this document is binding on me.
            </span>
          </label>
          <div className="flex justify-end mt-5">
            <Button size="lg" onClick={submit} disabled={submitting || !consent} className="text-lg h-12 px-8">
              {submitting ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Signing…</> : <><CheckCircle2 className="w-5 h-5 mr-2" /> Finish & Sign</>}
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
};

export default PrePitchSignView;
