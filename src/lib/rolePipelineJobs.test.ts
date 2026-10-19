import { describe, it as test } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';
import { candidatePipelineJobIds, candidateRoleLabel, filterPipelineJobs, isInactivePipelineCandidate, pipelineJobNeedsAdmin, resolvePipelineRole, type PipelineJob } from './rolePipelineJobs';

const jobs: PipelineJob[] = [
  { id: 'job-a', title: 'CSR', client_name: 'Client A', assigned_admin_id: 'kristine', is_active: true },
  { id: 'job-b', title: 'CSR', client_name: 'Client B', assigned_admin_id: 'mark', is_active: false },
  { id: 'job-c', title: 'Accountant', client_name: 'Client C', assigned_admin_id: 'mark', is_active: true },
  { id: 'job-d', title: 'Accountant', client_name: 'Client C', assigned_admin_id: 'kristine', is_active: true },
];

describe('Role Pipeline job identity', () => {
  test('duplicate titles remain separate jobs', () => {
    deepStrictEqual(filterPipelineJobs(jobs, 'all').filter(job => job.title === 'CSR').map(job => job.id), ['job-a', 'job-b']);
  });
  test('inactive is determined per job even with an active duplicate title', () => {
    deepStrictEqual(filterPipelineJobs(jobs, 'inactive').map(job => job.id), ['job-b']);
  });
  test('admin plus active includes only that admin’s active jobs', () => {
    deepStrictEqual(filterPipelineJobs(jobs, 'active', 'mark').map(job => job.id), ['job-c']);
  });
  test('job-id URL selects the exact duplicate job', () => {
    strictEqual(resolvePipelineRole('job-b', jobs), 'job-b');
  });
  test('legacy title URL selects an active job', () => {
    strictEqual(resolvePipelineRole('CSR', jobs), 'job-a');
  });
  test('linked candidates never match another job by title', () => {
    deepStrictEqual(candidatePipelineJobIds({ job_id: 'job-b', job_title: 'CSR' }, jobs), ['job-b']);
  });
  test('unlinked candidate matches the uniquely active job', () => {
    deepStrictEqual(candidatePipelineJobIds({ job_id: null, job_title: 'CSR' }, jobs), ['job-a']);
  });
  test('unlinked candidate with multiple active matches belongs to all matching jobs', () => {
    deepStrictEqual(candidatePipelineJobIds({ job_id: null, job_title: 'Accountant' }, jobs), ['job-c', 'job-d']);
  });
  test('unlinked candidate with no active match belongs to all matching jobs', () => {
    deepStrictEqual(candidatePipelineJobIds({ job_id: null, job_title: 'CSR' }, jobs.map(job => ({ ...job, is_active: false }))), ['job-a', 'job-b']);
  });
  test('inactive badge follows linked job rather than duplicate title', () => {
    strictEqual(isInactivePipelineCandidate({ job_id: 'job-b', job_title: 'CSR' }, jobs), true);
    strictEqual(isInactivePipelineCandidate({ job_id: null, job_title: 'CSR' }, jobs), false);
  });
  test('admin disambiguation applies only to identical title and client', () => {
    strictEqual(pipelineJobNeedsAdmin(jobs[0], jobs), false);
    strictEqual(pipelineJobNeedsAdmin(jobs[2], jobs), true);
  });
  test('card label shows the linked job title plus its client', () => {
    strictEqual(candidateRoleLabel({ job_id: 'job-b', job_title: 'CSR' }, jobs), 'CSR · Client B');
  });
  test('card label falls back to the title when the job has no client', () => {
    strictEqual(candidateRoleLabel({ job_id: 'job-c', job_title: 'Accountant' }, jobs.map(job => (job.id === 'job-c' ? { ...job, client_name: null } : job))), 'Accountant');
  });
  test('card label uses the stored title for unlinked or unknown jobs', () => {
    strictEqual(candidateRoleLabel({ job_id: null, job_title: 'CSR' }, jobs), 'CSR');
    strictEqual(candidateRoleLabel({ job_id: 'job-gone', job_title: 'CSR' }, jobs), 'CSR');
  });
});