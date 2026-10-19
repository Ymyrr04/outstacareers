export interface PipelineJob {
  id: string;
  title: string;
  client_name: string | null;
  assigned_admin_id: string | null;
  is_active: boolean;
}

export type PipelineJobFilter = 'active' | 'inactive' | 'all';

export function filterPipelineJobs(jobs: PipelineJob[], filter: PipelineJobFilter, admin = 'all') {
  return jobs.filter(job =>
    (filter === 'all' || job.is_active === (filter === 'active')) &&
    (admin === 'all' || job.assigned_admin_id === admin)
  );
}

export function resolvePipelineRole(value: string, jobs: PipelineJob[]) {
  if (jobs.some(job => job.id === value)) return value;
  return jobs.find(job => job.title === value && job.is_active)?.id ?? '__all__';
}

export function candidatePipelineJobIds(candidate: { job_id: string | null; job_title: string }, jobs: PipelineJob[]) {
  // A linked applicant never falls back to another job with the same title.
  if (candidate.job_id) return [candidate.job_id];
  const matches = jobs.filter(job => job.title === candidate.job_title);
  const active = matches.filter(job => job.is_active);
  return (active.length === 1 ? active : matches).map(job => job.id);
}

export function candidateMatchesPipelineJobs(
  candidate: { job_id: string | null; job_title: string },
  jobs: PipelineJob[],
  jobIds: Set<string>,
) {
  return candidatePipelineJobIds(candidate, jobs).some(id => jobIds.has(id));
}

export function isInactivePipelineCandidate(candidate: { job_id: string | null; job_title: string }, jobs: PipelineJob[]) {
  const ids = new Set(candidatePipelineJobIds(candidate, jobs));
  const matches = jobs.filter(job => ids.has(job.id));
  return matches.length > 0 && matches.every(job => !job.is_active);
}

export function pipelineJobNeedsAdmin(job: PipelineJob, jobs: PipelineJob[]) {
  return jobs.filter(other => other.title === job.title && other.client_name === job.client_name).length > 1;
}

// Card role label: the linked job's title plus its client, falling back to the
// stored title when the job is unknown or has no client.
export function candidateRoleLabel(candidate: { job_id: string | null; job_title: string }, jobs: PipelineJob[]) {
  const job = candidate.job_id ? jobs.find(other => other.id === candidate.job_id) : undefined;
  const title = job?.title || candidate.job_title;
  return job?.client_name ? `${title} · ${job.client_name}` : title;
}