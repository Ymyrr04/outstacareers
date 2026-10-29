import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { matchesPublicJobRegion } from './jobRegion';

describe('public job region visibility', () => {
  it('shows Global only for an explicit Global assignment', () => {
    for (const region of ['philippines', 'latin-america', 'all', null, undefined]) {
      strictEqual(matchesPublicJobRegion({ region }, 'global'), false);
    }
    strictEqual(matchesPublicJobRegion({ region: 'global' }, 'global'), true);
  });

  it('shows Philippines jobs only in Philippines', () => {
    strictEqual(matchesPublicJobRegion({ region: 'philippines' }, 'philippines'), true);
    strictEqual(matchesPublicJobRegion({ region: 'philippines' }, 'latin-america'), false);
    strictEqual(matchesPublicJobRegion({ region: 'philippines' }, 'global'), false);
  });

  it('shows Latin America jobs only in Latin America', () => {
    strictEqual(matchesPublicJobRegion({ region: 'latin-america' }, 'latin-america'), true);
    strictEqual(matchesPublicJobRegion({ region: 'latin-america' }, 'philippines'), false);
    strictEqual(matchesPublicJobRegion({ region: 'latin-america' }, 'global'), false);
  });

  it('does not place Global jobs in the regional tabs', () => {
    strictEqual(matchesPublicJobRegion({ region: 'global' }, 'philippines'), false);
    strictEqual(matchesPublicJobRegion({ region: 'global' }, 'latin-america'), false);
  });

  it('preserves All Regions in the regional tabs without guessing missing regions', () => {
    strictEqual(matchesPublicJobRegion({ region: 'all' }, 'philippines'), true);
    strictEqual(matchesPublicJobRegion({ region: 'all' }, 'latin-america'), true);
    strictEqual(matchesPublicJobRegion({ region: null }, 'philippines'), false);
    strictEqual(matchesPublicJobRegion({}, 'latin-america'), false);
  });
});