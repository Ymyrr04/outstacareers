import { Flag } from "lucide-react";
import { formatDateTime } from "@/lib/dateFormat";

interface Props {
  responses: any;
  flagged?: boolean | null;
}

const QUESTIONS: { key: string; label: string; flagWhen: boolean }[] = [
  { key: "read_job_description", label: "Have you read the full job description?", flagWhen: false },
  { key: "aware_of_rate", label: "Are you aware of the rate offered for this role?", flagWhen: false },
  { key: "agrees_with_rate", label: "Do you agree with the rate offered for this role?", flagWhen: false },
  { key: "applying_elsewhere", label: "Are you currently applying to other roles at the moment?", flagWhen: true },
];

export const PreScreeningResponsesCard = ({ responses, flagged }: Props) => {
  const hasData = responses && typeof responses === "object";

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h4 className="font-semibold text-sm">Pre-Screening Responses</h4>
        {flagged && (
          <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            <Flag className="w-3 h-3 fill-current" /> Flagged
          </span>
        )}
      </div>

      {!hasData ? (
        <p className="text-sm text-muted-foreground">Not answered</p>
      ) : (
        <>
          <div className="space-y-2">
            {QUESTIONS.map((q) => {
              const value = responses[q.key];
              const isTrigger = value === q.flagWhen;
              return (
                <div
                  key={q.key}
                  className={`flex items-start justify-between gap-3 rounded-md px-2 py-1.5 text-sm ${
                    isTrigger ? "bg-amber-500/10 border border-amber-500/30" : ""
                  }`}
                >
                  <span className="text-muted-foreground">{q.label}</span>
                  <span className={`font-medium shrink-0 ${isTrigger ? "text-amber-600 dark:text-amber-400" : ""}`}>
                    {value === true ? "Yes" : value === false ? "No" : "—"}
                  </span>
                </div>
              );
            })}
          </div>
          {responses.answered_at && (
            <p className="text-xs text-muted-foreground">
              Answered {formatDateTime(responses.answered_at)}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default PreScreeningResponsesCard;
