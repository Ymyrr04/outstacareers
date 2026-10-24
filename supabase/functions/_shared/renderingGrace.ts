/** Rendering deactivation runs one day later; the stored end date stays unchanged. */
export function renderingDeactivationCutoff(now: Date): string {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return cutoff.toISOString().slice(0, 10);
}