import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { renderingDeactivationCutoff } from '../../supabase/functions/_shared/renderingGrace';

describe('rendering portal grace', () => {
  it('does not deactivate an October 23 end date on the October 23 scheduled run', () => {
    const cutoff = renderingDeactivationCutoff(new Date('2026-10-23T13:00:00Z'));
    strictEqual(cutoff, '2026-10-22');
    strictEqual('2026-10-23' <= cutoff, false);
  });
  it('deactivates that end date on the run exactly 24 hours later', () => {
    const cutoff = renderingDeactivationCutoff(new Date('2026-10-24T13:00:00Z'));
    strictEqual(cutoff, '2026-10-23');
    strictEqual('2026-10-23' <= cutoff, true);
  });
  it('handles month and year boundaries without altering end dates', () => {
    strictEqual(renderingDeactivationCutoff(new Date('2027-01-01T13:00:00Z')), '2026-12-31');
  });
});