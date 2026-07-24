import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SPREADSHEET_ID = '1HPFeleVLcfR0kyG1N4HCaEeQcEypzXquhQPbMToXQHY';
const GATEWAY = 'https://connector-gateway.lovable.dev/google_sheets/v4';

const HEADERS = [
  'Contractor',
  'Email',
  'Company',
  'Week Ending',
  'Hours',
  'Deposit Hours',
  'OT',
  'Invoice',
  'Rate',
  'Expected Invoice',
  'Match',
  'Payoneer Link',
  'Payoneer Amount',
  'Payoneer Match',
  'Bonus',
  'Status',
  'Notes',
  'Submitted',
];

function extractPayoneerLink(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/https?:\/\/(?:link\.)?payoneer\.com\/[^\s"'<>]+/i);
  return m ? m[0] : null;
}

async function fetchPayoneerAmount(url: string): Promise<{ amount: number | null; currency: string | null; error?: string }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OutStaBot/1.0)', 'Accept': 'text/html' },
    });
    if (!res.ok) return { amount: null, currency: null, error: `HTTP ${res.status}` };
    const html = await res.text();
    const matches = [...html.matchAll(/([\d,]+\.\d{2})\s*(USD|EUR|GBP|AUD|CAD)/gi)];
    let amount: number | null = null;
    let currency: string | null = null;
    for (const m of matches) {
      const n = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(n) && (amount === null || n > amount)) { amount = n; currency = m[2].toUpperCase(); }
    }
    return { amount, currency, error: amount === null ? 'no amount found' : undefined };
  } catch (e) {
    return { amount: null, currency: null, error: (e as Error).message };
  }
}

function computeDeposit(startStr: string | null, hpw: number, weekEndingDate: string, totalHours: number) {
  if (!startStr || !hpw) return { depositHours: 0, isDeposit: false, weekIndex: null as number | null };
  const start = new Date(startStr);
  const end = new Date(weekEndingDate);
  const diffDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { depositHours: 0, isDeposit: false, weekIndex: null };
  const weekIndex = Math.floor(diffDays / 7);
  if (weekIndex > 1) return { depositHours: 0, isDeposit: false, weekIndex };
  return { depositHours: Math.min(Number(totalHours), hpw), isDeposit: true, weekIndex };
}

// Sheet tab name matches the PL dashboard week header (Mon–Sun range containing
// the submission's week_ending_date), e.g. "Mon Jul 20 – Sun Jul 26, 2026"
function tabNameForWeek(weekEndingDate: string): string {
  const [y, m, d] = weekEndingDate.split('-').map(Number);
  const ref = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const dow = ref.getUTCDay(); // 0=Sun..6=Sat
  const daysFromMon = (dow + 6) % 7; // Mon->0, Sun->6
  const mon = new Date(ref);
  mon.setUTCDate(ref.getUTCDate() - daysFromMon);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monStr = `Mon ${months[mon.getUTCMonth()]} ${mon.getUTCDate()}`;
  const sunStr = `Sun ${months[sun.getUTCMonth()]} ${sun.getUTCDate()}, ${sun.getUTCFullYear()}`;
  return `${monStr} – ${sunStr}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { timesheetId } = await req.json();
    if (!timesheetId) throw new Error('timesheetId required');

    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    const sheetsKey = Deno.env.get('GOOGLE_SHEETS_API_KEY');
    if (!lovableKey || !sheetsKey) throw new Error('Google Sheets connector not configured');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: ts, error: tsErr } = await supabase
      .from('contractor_timesheets')
      .select(`
        id, week_ending_date, total_hours, overtime_hours, submitted_at, status,
        outsta_status, notes, incentive_amount,
        contractor_assignments!inner (
          job_title, start_date, hours_per_week, hourly_rate,
          applicants_prescreen ( full_name, email ),
          clients ( company_name )
        )
      `)
      .eq('id', timesheetId)
      .maybeSingle();
    if (tsErr) throw tsErr;
    if (!ts) throw new Error('Timesheet not found');

    const assignment: any = ts.contractor_assignments;
    const contractorName = assignment?.applicants_prescreen?.full_name || 'Unknown';
    const contractorEmail = assignment?.applicants_prescreen?.email || '';
    const clientName = assignment?.clients?.company_name || 'Unassigned';
    const hourlyRate = Number(assignment?.hourly_rate || 0);
    const hpw = Number(assignment?.hours_per_week || 0);

    const totalHours = Number(ts.total_hours ?? 0);
    const overtime = Number(ts.overtime_hours ?? 0);
    const bonus = Number(ts.incentive_amount ?? 0);
    const dep = computeDeposit(assignment?.start_date, hpw, ts.week_ending_date, totalHours);
    const regularHours = Math.max(0, totalHours - overtime);
    const invoice = hourlyRate > 0 ? regularHours * hourlyRate : 0;
    const status = ts.outsta_status || ts.status || '';

    const gwHeaders = {
      Authorization: `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': sheetsKey,
      'Content-Type': 'application/json',
    };

    // Fetch existing tabs
    const metaRes = await fetch(
      `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties(title,sheetId)`,
      { headers: gwHeaders },
    );
    if (!metaRes.ok) {
      const body = await metaRes.text();
      throw new Error(`Sheet metadata failed [${metaRes.status}]: ${body}`);
    }
    const meta = await metaRes.json();
    const existingTabs: Array<{ title: string; sheetId: number }> =
      (meta?.sheets || []).map((s: any) => s.properties);

    const tabName = tabNameForWeek(ts.week_ending_date);
    const tabExists = existingTabs.some((t) => t.title === tabName);

    // Create the week-specific tab if missing
    if (!tabExists) {
      const addRes = await fetch(
        `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
        {
          method: 'POST',
          headers: gwHeaders,
          body: JSON.stringify({
            requests: [{ addSheet: { properties: { title: tabName } } }],
          }),
        },
      );
      if (!addRes.ok) {
        const body = await addRes.text();
        throw new Error(`Failed to create tab "${tabName}" [${addRes.status}]: ${body}`);
      }
    }

    // Ensure header row on the week tab
    // Compute last column letter (supports beyond Z)
    const colLetter = (n: number) => {
      let s = '';
      while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
      return s;
    };
    const lastCol = colLetter(HEADERS.length);
    const encodedTab = encodeURIComponent(`'${tabName}'`);
    const headerRes = await fetch(
      `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${encodedTab}!A1:${lastCol}1`,
      { headers: gwHeaders },
    );
    const headerJson = headerRes.ok ? await headerRes.json() : { values: [] };
    const existing = headerJson.values?.[0] || [];
    const headersMatch = existing.length === HEADERS.length && HEADERS.every((h, i) => existing[i] === h);
    if (!headersMatch) {
      await fetch(
        `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${encodedTab}!A1:${lastCol}1?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: gwHeaders,
          body: JSON.stringify({ values: [HEADERS] }),
        },
      );
    }

    const expectedInvoice = Number((regularHours * hourlyRate).toFixed(2));
    const invoiceRounded = invoice ? Number(invoice.toFixed(2)) : 0;
    const match = Math.abs(expectedInvoice - invoiceRounded) < 0.01 ? '✓ Match' : '✗ Mismatch';

    const row = [
      contractorName,
      contractorEmail,
      clientName,
      ts.week_ending_date,
      totalHours,
      dep.isDeposit ? dep.depositHours : '',
      overtime,
      invoice ? invoiceRounded : '',
      hourlyRate || '',
      expectedInvoice || '',
      match,
      bonus,
      status,
      ts.notes || '',
      ts.submitted_at ? new Date(ts.submitted_at).toISOString() : new Date().toISOString(),
    ];

    const appendRes = await fetch(
      `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${encodedTab}!A:${lastCol}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: gwHeaders,
        body: JSON.stringify({ values: [row] }),
      },
    );
    if (!appendRes.ok) {
      const body = await appendRes.text();
      throw new Error(`Sheets append failed [${appendRes.status}]: ${body}`);
    }

    return new Response(JSON.stringify({ success: true, tab: tabName, created: !tabExists }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('append-timesheet-to-sheet error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
