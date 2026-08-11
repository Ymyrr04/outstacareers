// Zero-AI candidate matching: scores Talent Pool applicants against a job
// using data already stored on the applicant record.

export interface MatchCandidate {
  id: string;
  full_name: string | null;
  email: string | null;
  job_title: string | null;
  original_job_title: string | null;
  tags: string[] | null;
  suitable_roles: string[] | null;
  extracted_skills: string[] | null;
  extracted_tools: string[] | null;
  ai_assessment_details: any;
  total_score: number | null;
}

export interface MatchJob {
  title: string;
  description?: string | null;
  qualifications?: string[] | null;
  responsibilities?: string[] | null;
}

export interface MatchResult {
  score: number;
  reasons: string[];
}

const STOP_WORDS = new Set([
  'and', 'or', 'the', 'a', 'an', 'for', 'with', 'of', 'to', 'in', 'on', 'at',
  'senior', 'junior', 'lead', 'remote', 'full', 'time', 'part', 'specialist',
  'associate', 'assistant', 'staff', 'level', 'i', 'ii', 'iii', 'jr', 'sr',
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#. ]+/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function overlap(a: string[], b: Set<string>): string[] {
  return Array.from(new Set(a.filter((t) => b.has(t))));
}

export function recommendedRolesOf(c: MatchCandidate): string[] {
  const raw = c.ai_assessment_details?.recommended_roles;
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((r: any) => (typeof r === 'string' ? r : r?.role || r?.title || ''))
      .filter(Boolean);
  }
  if (typeof raw === 'string') return [raw];
  return [];
}

export function scoreCandidate(candidate: MatchCandidate, job: MatchJob): MatchResult {
  const titleTokens = new Set(tokens(job.title || ''));
  const jobBodyText = [
    job.title || '',
    job.description || '',
    ...(job.responsibilities || []),
    ...(job.qualifications || []),
  ].join(' ');
  const bodyTokens = new Set(tokens(jobBodyText));

  let score = 0;
  const reasons: string[] = [];

  // Suitable roles (manually curated) — strongest signal
  const suitable = candidate.suitable_roles || [];
  const suitableHit = suitable.filter((r) => overlap(tokens(r), titleTokens).length > 0);
  if (suitableHit.length) {
    score += 40;
    reasons.push(`Suitable role: ${suitableHit.join(', ')}`);
  }

  // AI recommended roles
  const recommended = recommendedRolesOf(candidate);
  const recHit = recommended.filter((r) => overlap(tokens(r), titleTokens).length > 0);
  if (recHit.length) {
    score += 35;
    reasons.push(`AI recommended: ${recHit.join(', ')}`);
  }

  // Applied-for role / original role
  const appliedTitles = [candidate.job_title, candidate.original_job_title].filter(Boolean) as string[];
  const appliedHit = appliedTitles.filter((t) => overlap(tokens(t), titleTokens).length > 0);
  if (appliedHit.length) {
    score += 30;
    reasons.push(`Applied for: ${Array.from(new Set(appliedHit)).join(', ')}`);
  }

  // Tags
  const tagHits = overlap((candidate.tags || []).flatMap(tokens), bodyTokens);
  if (tagHits.length) {
    score += Math.min(20, tagHits.length * 10);
    reasons.push(`Tags: ${tagHits.join(', ')}`);
  }

  // Skills & tools appearing in the job text
  const skillHits = overlap((candidate.extracted_skills || []).flatMap(tokens), bodyTokens);
  const toolHits = overlap((candidate.extracted_tools || []).flatMap(tokens), bodyTokens);
  const stCount = skillHits.length + toolHits.length;
  if (stCount) {
    score += Math.min(30, stCount * 6);
    const shown = [...skillHits, ...toolHits].slice(0, 6).join(', ');
    reasons.push(`Skills/tools: ${shown}${stCount > 6 ? ` +${stCount - 6} more` : ''}`);
  }

  return { score: Math.min(100, score), reasons };
}
