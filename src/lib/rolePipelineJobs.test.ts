import { describe, expect, test } from 'bun:test';
import { candidatePipelineJobIds, filterPipelineJobs, isInactivePipelineCandidate, pipelineJobNeedsAdmin, resolvePipelineRole, type PipelineJob } from './rolePipelineJobs';

const jobs: PipelineJob[] = [
  { id: 'job-a', title: 'CSR', client_name: 'Client A', assigned_admin_id: 'kristine', is_active: true },
  { id: 'job-b', title: 'CSR', client_name: 'Client B', assigned_admin_id: 'mark', is_active: false },
  { id: 'job-c', title: 'Accountant', client_name: 'Client C', assigned_admin_id: 'mark', is_active: true },
  { id: 'job-d', title: 'Accountant', client_name: 'Client C', assigned_admin_id: 'kristine', is_active: true },
];

describe('Role Pipeline job identity', () => {
  test('duplicate titles remain separate jobs', () => {
    expect(filterPipelineJobs(jobs, 'all').filter(job => job.title === 'CSR').map(job => job.id)).toEqual(['job-a', 'job-b']);
  });
  test('inactive is determined per job even with an active duplicate title', () => {
    expect(filterPipelineJobs(jobs, 'inactive').map(job => job.id)).toEqual(['job-b']);
  });
  test('admin plus active includes only that admin’s active jobs', () => {
    expect(filterPipelineJobs(jobs, 'active', 'mark').map(job => job.id)).toEqual(['job-c']);
  });
  test('job-id URL selects the exact duplicate job', () => {
    expect(resolvePipelineRole('job-b', jobs)).toBe('job-b');
  });
  test('legacy title URL selects an active job', () => {
    expect(resolvePipelineRole('CSR', jobs)).toBe('job-a');
  });
  test('linked candidates never match another job by title', () => {
    expect(candidatePipelineJobIds({ job_id: 'job-b', job_title: 'CSR' }, jobs)).toEqual(['job-b']);
  });
  test('unlinked candidate matches the uniquely active job', () => {
    expect(candidatePipelineJobIds({ job_id: null, job_title: 'CSR' }, jobs)).toEqual(['job-a']);
  });
  test('unlinked candidate with multiple active matches belongs to all matching jobs', () => {
    expect(candidatePipelineJobIds({ job_id: null, job_title: 'Accountant' }, jobs)).toEqual(['job-c', 'job-d']);
  });
  test('unlinked candidate with no active match belongs to all matching jobs', () => {
    expect(candidatePipelineJobIds({ job_id: null, job_title: 'CSR' }, jobs.map(job => ({ ...job, is_active: false })))).toEqual(['job-a', 'job-b']);
  });
  test('inactive badge follows linked job rather than duplicate title', () => {
    expect(isInactivePipelineCandidate({ job_id: 'job-b', job_title: 'CSR' }, jobs)).toBe(true);
    expect(isInactivePipelineCandidate({ job_id: null, job_title: 'CSR' }, jobs)).toBe(false);
  });
  test('admin disambiguation applies only to identical title and client', () => {
    expect(pipelineJobNeedsAdmin(jobs[0], jobs)).toBe(false);
    expect(pipelineJobNeedsAdmin(jobs[2], jobs)).toBe(true);
  });
});