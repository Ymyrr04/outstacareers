import { describe, it, expect } from 'bun:test';
import { recipientRows, digestHtml, type DigestRow } from '../../supabase/functions/_shared/clientTimesheetDigest';
const rows: DigestRow[] = ['a','b'].map(id => ({id,contractor_assignment_id:id,week_ending_date:'2026-10-25',total_hours:40,notes:null,daily_hours:null}));
describe('client grouped timesheet delivery', () => {
  it('groups all contractors into one email per unrestricted client recipient', () => {
    const result = recipientRows([{id:'p',email:'client@example.com',primary_email:null,secondary_email:null}],[],rows);
    expect(result.size).toBe(1); expect(result.get('client@example.com')?.map(r=>r.id)).toEqual(['a','b']);
  });
  it('limits a restricted account to its assigned contractors', () => {
    const result = recipientRows([{id:'p',email:'client@example.com',primary_email:null,secondary_email:null}],[{portal_user_id:'p',contractor_assignment_id:'a'}],rows);
    expect(result.get('client@example.com')?.map(r=>r.id)).toEqual(['a']);
  });
  it('does not send to placeholder portal addresses', () => {
    expect(recipientRows([{id:'p',email:'portal@outsta.io',primary_email:null,secondary_email:'fake@portal.outsta.local'}],[],rows).size).toBe(0);
  });
  it('never includes incentive or pay values in client summaries', () => {
    const html = digestHtml('Client',[{...rows[0], incentive_amount:999, hourly_rate:123} as DigestRow],new Map());
    expect(html).not.toContain('999'); expect(html).not.toContain('123');
  });
});