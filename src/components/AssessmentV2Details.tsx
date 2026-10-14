import { useState } from 'react';
import { AlertTriangle, ChevronDown, HelpCircle, Layers, Target, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function PartialToolBadge({ tool }: { tool: any }) {
  if (tool?.partial !== true) return null;
  return <Badge variant="outline" className="ml-2 text-xs">Partial</Badge>;
}

/** New (v2) assessment fields. Renders nothing for older assessments. */
export function AssessmentV2Details({ details }: { details: any }) {
  const [open, setOpen] = useState(false);
  if (!details || typeof details !== 'object') return null;

  const redFlags = arr(details.red_flags).filter((f) => txt(f?.detail) || txt(f?.type));
  const missing = arr(details.missing_information).map(txt).filter(Boolean) as string[];
  const seniority = txt(details.seniority_flag);
  const roles = arr(details.suggested_other_roles).filter((r) => txt(r?.role));
  const ev = details.score_evidence && typeof details.score_evidence === 'object' ? details.score_evidence : null;
  const evidence = ev
    ? ([
        ['Role experience', txt(ev.role_experience)],
        ['Skills and tools', txt(ev.skills_tools)],
        ['Availability', txt(ev.availability)],
      ].filter(([, v]) => v) as [string, string][])
    : [];

  if (!redFlags.length && !missing.length && !seniority && !roles.length && !evidence.length) return null;

  return (
    <div className="space-y-4">
      {redFlags.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-1 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" /> Red flags for review
          </p>
          <p className="text-xs text-muted-foreground mb-2">For human review. Does not affect the score.</p>
          <ul className="space-y-1">
            {redFlags.map((f, idx) => (
              <li key={idx} className="text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
                <span>•</span>
                <span>
                  {txt(f.type) && <span className="font-medium">{String(f.type).replace(/_/g, ' ')}: </span>}
                  {txt(f.detail)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {missing.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2 flex items-center gap-2">
            <HelpCircle className="w-4 h-4" /> Verify with the candidate
          </p>
          <ul className="space-y-1">
            {missing.map((m, idx) => (
              <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                <span>•</span> {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      {seniority && (
        <div>
          <p className="text-sm font-medium mb-1 flex items-center gap-2">
            <Layers className="w-4 h-4" /> Seniority
          </p>
          <p className="text-sm text-muted-foreground">{seniority}</p>
        </div>
      )}

      {roles.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2 flex items-center gap-2">
            <Target className="w-4 h-4 text-purple-600" /> Suggested other roles
          </p>
          <div className="space-y-2">
            {roles.map((r, idx) => (
              <div key={idx} className="p-2 bg-purple-50 dark:bg-purple-950/30 rounded text-sm">
                <span className="font-medium text-purple-700 dark:text-purple-400">{r.role}</span>
                {txt(r.reason) && <p className="text-xs text-muted-foreground mt-1">{r.reason}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {evidence.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="text-sm font-medium flex items-center gap-2"
          >
            <Info className="w-4 h-4" /> Why this score
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <dl className="mt-2 space-y-2">
              {evidence.map(([label, value]) => (
                <div key={label} className="text-sm">
                  <dt className="font-medium">{label}</dt>
                  <dd className="text-muted-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
