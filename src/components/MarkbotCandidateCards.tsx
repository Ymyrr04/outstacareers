import { UserRound, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CandidateCardData {
  id: string;
  name: string;
  job_title: string | null;
  status: string | null;
  availability_state: string | null;
  days_since_check: number | null;
  ai_cv_score: number | null;
  interview_score: number | null;
  years_of_experience: number | null;
  has_profile: boolean | null;
}

const AVAIL: Record<string, { label: string; cls: string }> = {
  available: { label: 'Available', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  not_available: { label: 'Not available', cls: 'bg-destructive/15 text-destructive' },
  asked_no_reply: { label: 'No reply', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  never_asked: { label: 'Never asked', cls: 'bg-muted text-muted-foreground' },
};

const scoreCls = (n: number) =>
  n >= 70 ? 'text-emerald-600 dark:text-emerald-400' : n >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-destructive';

export function MarkbotCandidateCards({ cards, onOpen }: { cards: CandidateCardData[]; onOpen: (c: CandidateCardData) => void }) {
  if (!cards.length) return null;
  return (
    <div className="w-full space-y-1.5">
      {cards.map((c) => {
        const avail = c.availability_state ? AVAIL[c.availability_state] : null;
        return (
          <button key={c.id} type="button" onClick={() => onOpen(c)}
            className="w-full text-left rounded-md border bg-card hover:bg-muted/60 transition-colors px-2.5 py-2 group">
            <div className="flex items-center gap-2">
              <UserRound className="w-3.5 h-3.5 shrink-0 text-[hsl(var(--markbot))]" />
              <span className="text-[12px] font-semibold truncate">{c.name}</span>
              {c.status && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground shrink-0">{c.status}</span>}
              <ExternalLink className="w-3 h-3 ml-auto shrink-0 text-muted-foreground group-hover:text-foreground" />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-muted-foreground">
              {c.job_title && <span className="truncate max-w-[180px]">{c.job_title}</span>}
              {c.years_of_experience != null && <span>{c.years_of_experience} yrs</span>}
              {typeof c.ai_cv_score === 'number' && <span>CV <b className={cn('font-semibold', scoreCls(c.ai_cv_score))}>{c.ai_cv_score}</b></span>}
              {typeof c.interview_score === 'number' && <span>Interview <b className={cn('font-semibold', scoreCls(c.interview_score))}>{c.interview_score}</b></span>}
              {avail && (
                <span className={cn('px-1.5 py-0.5 rounded', avail.cls)}>
                  {avail.label}{c.days_since_check != null && c.availability_state !== 'never_asked' ? ` · ${c.days_since_check}d ago` : ''}
                </span>
              )}
              {c.has_profile && <span className="text-[hsl(var(--markbot))]">RM profile</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
