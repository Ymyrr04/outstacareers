export type PublicJobRegion = 'philippines' | 'latin-america' | 'global';

export function matchesPublicJobRegion(
  job: { region?: string | null },
  region: PublicJobRegion,
): boolean {
  // All Regions retains its regional reach, but Global requires an explicit assignment.
  return job.region === 'global' || job.region === region || (job.region === 'all' && region !== 'global');
}