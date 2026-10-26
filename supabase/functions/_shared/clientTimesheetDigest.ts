export interface DigestRow {
  id: string;
  contractor_assignment_id: string;
  week_ending_date: string;
  total_hours: number;
  notes: string | null;
  daily_hours: Record<string, { hours?: number; time_in?: string; time_out?: string; reason?: string }> | null;
}
export interface DigestAccount {
  id: string;
  primary_email: string | null;
  secondary_email: string | null;
  email: string | null;
}
export function recipientRows(accounts: DigestAccount[], access: { portal_user_id: string; contractor_assignment_id: string }[], rows: DigestRow[]) {
  const result = new Map<string, DigestRow[]>();
  for (const account of accounts) {
    const ids = access.filter(a => a.portal_user_id === account.id).map(a => a.contractor_assignment_id);
    const visible = rows.filter(r => ids.length === 0 || ids.includes(r.contractor_assignment_id));
    for (const address of [account.primary_email || account.email, account.secondary_email]) {
      const email = address?.trim().toLowerCase();
      if (!email || email === 'portal@outsta.io' || email.endsWith('@portal.outsta.local')) continue;
      const existing = result.get(email) || [];
      result.set(email, [...new Map([...existing, ...visible].map(r => [r.id, r])).values()]);
    }
  }
  return result;
}
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c] || c));
export function digestHtml(company: string, rows: DigestRow[], names: Map<string,string>) {
  const sections = rows.map(row => {
    const daily = Object.entries(row.daily_hours || {}).filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort(([a],[b]) => a.localeCompare(b));
    const notes = (row.notes || '').replace(/https?:\/\/[^\s<>"']*/gi, '').replace(/payoneer\.com\/[^\s<>"']*/gi, '').trim();
    return `<h3>${escapeHtml(names.get(row.contractor_assignment_id) || 'Contractor')}</h3><p>Week ending: ${escapeHtml(row.week_ending_date)}<br>Total hours: ${Number(row.total_hours).toFixed(2)}</p><table cellpadding="8"><thead><tr><th>Day</th><th>Hours</th><th>Time</th><th>Notes</th></tr></thead><tbody>${daily.map(([date,d]) => `<tr><td>${escapeHtml(date)}</td><td>${Number(d.hours || 0).toFixed(2)}</td><td>${escapeHtml(d.time_in || '')} – ${escapeHtml(d.time_out || '')}</td><td>${escapeHtml(d.reason || '')}</td></tr>`).join('')}</tbody></table>${notes ? `<p>${escapeHtml(notes).replace(/\n/g,'<br>')}</p>` : ''}`;
  }).join('<hr>');
  return `<html><body style="font-family:Arial,sans-serif"><h2>${escapeHtml(company)} — timesheets to review</h2><p>Your contractors have submitted ${rows.length} timesheet${rows.length === 1 ? '' : 's'}. Please review and approve or flag in your client portal.</p>${sections}<p><a href="https://outstaworkforce.com/client">Open client portal</a></p><p>OutSta — automated notification</p></body></html>`;
}