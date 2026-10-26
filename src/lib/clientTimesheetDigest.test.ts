import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { recipientRows, digestHtml, type DigestRow } from '../../supabase/functions/_shared/clientTimesheetDigest';
const rows: DigestRow[] = ['a','b'].map(id => ({id,contractor_assignment_id:id,week_ending_date:'2026-10-25',total_hours:40,notes:null,daily_hours:null}));
describe('client grouped timesheet delivery', () => {
  it('groups all contractors into one email per unrestricted client recipient', () => {
    const result = recipientRows([{id:'p',email:'client@example.com',primary_email:null,secondary_email:null}],[],rows);
    assert.equal(result.size,1); assert.deepEqual(result.get('client@example.com')?.map(r=>r.id),['a','b']);
  });
  it('limits a restricted account to its assigned contractors', () => {
    const result = recipientRows([{id:'p',email:'client@example.com',primary_email:null,secondary_email:null}],[{portal_user_id:'p',contractor_assignment_id:'a'}],rows);
    assert.deepEqual(result.get('client@example.com')?.map(r=>r.id),['a']);
  });
  it('does not send to placeholder portal addresses', () => {
    assert.equal(recipientRows([{id:'p',email:'portal@outsta.io',primary_email:null,secondary_email:'fake@portal.outsta.local'}],[],rows).size,0);
  });
  it('never includes incentive or pay values in client summaries', () => {
    const html = digestHtml('Client',[{...rows[0], incentive_amount:999, hourly_rate:123} as DigestRow],new Map());
    assert.ok(!html.includes('999')); assert.ok(!html.includes('123'));
  });
});