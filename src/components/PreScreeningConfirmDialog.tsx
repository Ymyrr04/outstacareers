import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertCircle } from "lucide-react";

export interface PreScreeningResponses {
  read_job_description: boolean;
  aware_of_rate: boolean;
  agrees_with_rate: boolean;
  applying_elsewhere: boolean;
  answered_at: string;
}

export const isPreScreeningFlagged = (r: Omit<PreScreeningResponses, "answered_at">) =>
  r.read_job_description === false ||
  r.aware_of_rate === false ||
  r.agrees_with_rate === false ||
  r.applying_elsewhere === true;

type Key = "read_job_description" | "aware_of_rate" | "agrees_with_rate" | "applying_elsewhere";

const QUESTIONS: { key: Key; label: string }[] = [
  { key: "read_job_description", label: "Have you read the full job description?" },
  { key: "aware_of_rate", label: "Are you aware of the rate offered for this role?" },
  { key: "agrees_with_rate", label: "Do you agree with the rate offered for this role? Please note this is non-negotiable." },
  { key: "applying_elsewhere", label: "Are you currently applying to other roles at the moment?" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (responses: PreScreeningResponses) => void;
}

const PreScreeningConfirmDialog = ({ open, onOpenChange, onConfirm }: Props) => {
  const [answers, setAnswers] = useState<Partial<Record<Key, boolean>>>({});
  const [error, setError] = useState("");

  const handleConfirm = () => {
    const allAnswered = QUESTIONS.every(q => typeof answers[q.key] === "boolean");
    if (!allAnswered) {
      setError("Please answer all questions before continuing");
      return;
    }
    setError("");
    onConfirm({
      read_job_description: answers.read_job_description!,
      aware_of_rate: answers.aware_of_rate!,
      agrees_with_rate: answers.agrees_with_rate!,
      applying_elsewhere: answers.applying_elsewhere!,
      answered_at: new Date().toISOString(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Before You Continue</DialogTitle>
          <DialogDescription>
            Please answer these four quick questions before uploading your CV.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {QUESTIONS.map((q, idx) => (
            <div key={q.key} className="space-y-2">
              <Label className="text-sm font-medium leading-snug">
                {idx + 1}. {q.label} <span className="text-destructive">*</span>
              </Label>
              <RadioGroup
                value={answers[q.key] === undefined ? "" : answers[q.key] ? "yes" : "no"}
                onValueChange={(v) => {
                  setAnswers(prev => ({ ...prev, [q.key]: v === "yes" }));
                  setError("");
                }}
                className="flex gap-6"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yes" id={`${q.key}-yes`} />
                  <Label htmlFor={`${q.key}-yes`} className="font-normal cursor-pointer">Yes</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="no" id={`${q.key}-no`} />
                  <Label htmlFor={`${q.key}-no`} className="font-normal cursor-pointer">No</Label>
                </div>
              </RadioGroup>
            </div>
          ))}
        </div>

        {error && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="w-4 h-4" />
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Back
          </Button>
          <Button className="flex-1" onClick={handleConfirm}>
            Confirm and Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PreScreeningConfirmDialog;
