import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { countClientRecruiterAssignments } from './clientRecruiterAssignments';

describe('client recruiter assignments', () => {
  it('includes Christian and counts his active role assignments only', () => {
    const counts = countClientRecruiterAssignments(
      ['sourcing', 'pitch', 'scheduled_interview', 'backlog', 'closed', 'lost_client', 'lost_outsta'].map(pipeline_stage => ({ pipeline_stage, assigned_admin_id: 'christian-id' })),
      [{ user_id: 'christian-id', email: 'Christian@outsta.io' }],
    );
    strictEqual(counts['christian@outsta.io'], 3);
  });
  it('keeps existing recruiters separate and shows Christian with zero when unassigned', () => {
    const counts = countClientRecruiterAssignments(
      [{ pipeline_stage: 'pitch', assigned_admin_id: 'cza-id' }, { pipeline_stage: 'pitch', assigned_admin_id: null }],
      [{ user_id: 'cza-id', email: 'czarina@outsta.io' }],
    );
    strictEqual(counts['czarina@outsta.io'], 1);
    strictEqual(counts['kristine@outsta.io'], 0);
    strictEqual(counts['eduardo@outsta.io'], 0);
    strictEqual(counts['christian@outsta.io'], 0);
  });
});