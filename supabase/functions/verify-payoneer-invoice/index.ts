import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const FIRECRAWL_V2 = 'https://api.firecrawl.dev/v2';
const SPREADSHEET_ID = '1HPFeleVLcfR0kyG1N4HCaEeQcEypzXquhQPbMToXQHY';
const SHEETS_GATEWAY = 'https://connector-gateway.lovable.dev/google_sheets/v4';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function extractAmount(text: string): { amount: number | null; currency: string | null } {
  if (!text) return { amount: null, currency: null };
  const matches = [...text.matchAll(/([\d,]+\.\d{2})\s*(USD|EUR|GBP|AUD|CAD)/gi)];
  let amount: number | null = null;
  let currency: string | null = null;
  for (const m of matches) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (!isNaN(n) && (amount === null || n > amount)) {
      amount = n;
      currency = m[2].toUpperCase();
    }
  }
  return { amount, currency };
}

// Compute the sheet tab name for a given week_ending_date (YYYY-MM-DD)
function tabNameForWeek(weekEndingDate: string): string {
  const [y, m, d] = weekEndingDate.split('-').map(Number);
  const ref = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const dow = ref.getUTCDay();
  const daysFromMon = (dow + 6) % 7;
  const mon = new Date(ref);
  mon.setUTCDate(ref.getUTCDate() - daysFromMon);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `Mon ${months[mon.getUTCMonth()]} ${mon.getUTCDate()} – Sun ${months[sun.getUTCMonth()]} ${sun.getUTCDate()}, ${sun.getUTCFullYear()}`;
}

// Push the freshly-verified amount into the Google Sheet row(s) for a given timesheet.
// Columns: L = Payoneer Link, M = Payoneer Amount, N = Payoneer Match.
async function syncToSheet(timesheetId: string, url: string, amount: number, currency: string | null) {
  try {
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    const sheetsKey = Deno.env.get('GOOGLE_SHEETS_API_KEY');
    if (!lovableKey || !sheetsKey) return;

    const { data: ts } = await supabase
      .from('contractor_timesheets')
      .select('week_ending_date, total_hours, overtime_hours, incentive_amount, contractor_assignments!inner(hourly_rate)')
      .eq('id', timesheetId)
      .maybeSingle();
    if (!ts) return;

    const totalHours = Number(ts.total_hours ?? 0);
    const overtime = Number(ts.overtime_hours ?? 0);
    const regularHours = Math.max(0, totalHours - overtime);
    const hourlyRate = Number((ts.contractor_assignments as any)?.hourly_rate || 0);
    const invoice = hourlyRate > 0 ? Number((regularHours * hourlyRate).toFixed(2)) : 0;
    const match = invoice && Math.abs(amount - invoice) < 0.01 ? '✓ Match' : '✗ Mismatch';

    const tab = tabNameForWeek(ts.week_ending_date);
    const encodedTab = encodeURIComponent(`'${tab}'`);
    const gwHeaders = {
      Authorization: `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': sheetsKey,
      'Content-Type': 'application/json',
    };

    // Fetch column L (Payoneer Link) to locate the row
    const res = await fetch(
      `${SHEETS_GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${encodedTab}!L:L`,
      { headers: gwHeaders },
    );
    if (!res.ok) return;
    const json = await res.json();
    const rows: string[][] = json.values || [];
    // Find all matching rows (there could be duplicate submissions)
    const targetRows: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      if ((rows[i]?.[0] || '').trim() === url.trim()) targetRows.push(i + 1); // 1-indexed
    }

    // If no row exists yet for this submission, append a full row via the
    // append function (which now reads the freshly-cached amount from DB).
    if (targetRows.length === 0) {
      await supabase.functions.invoke('append-timesheet-to-sheet', {
        body: { timesheetId },
      });
      return;
    }

    const amountCell = `${amount.toFixed(2)}${currency ? ' ' + currency : ''}`;
    for (const rowNum of targetRows) {
      await fetch(
        `${SHEETS_GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${encodedTab}!M${rowNum}:N${rowNum}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: gwHeaders,
          body: JSON.stringify({ values: [[amountCell, match]] }),
        },
      );
    }
  } catch (e) {
    console.error('syncToSheet failed:', (e as Error).message);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { url, force, timesheetId } = await req.json();
    if (!url || typeof url !== 'string' || !/^https?:\/\/(link\.|app\.)?payoneer\.com\//i.test(url)) {
      return new Response(JSON.stringify({ error: 'A valid Payoneer link is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Return cached verification if we already have an amount (unless forced)
    if (!force) {
      const { data: cached } = await supabase
        .from('payoneer_verifications')
        .select('amount, currency, error')
        .eq('url', url)
        .maybeSingle();
      if (cached && cached.amount !== null) {
        // Also sync to sheet in case sheet row was written before verification
        if (timesheetId) await syncToSheet(timesheetId, url, Number(cached.amount), cached.currency);
        return new Response(
          JSON.stringify({ amount: Number(cached.amount), currency: cached.currency, cached: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    const firecrawlKeys = [
      Deno.env.get('FIRECRAWL_API_KEY'),
      Deno.env.get('FIRECRAWL_API_KEY_2'),
      Deno.env.get('FIRECRAWL_API_KEY_3'),
    ].filter(Boolean) as string[];
    if (firecrawlKeys.length === 0) {
      return new Response(JSON.stringify({ error: 'FIRECRAWL_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let fcRes: Response | null = null;
    let lastErr = '';
    for (let i = 0; i < firecrawlKeys.length; i++) {
      const key = firecrawlKeys[i];
      const r = await fetch(`${FIRECRAWL_V2}/scrape`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
          onlyMainContent: false,
          waitFor: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        }),
      });
      if (r.ok) { fcRes = r; break; }
      const body = await r.text();
      lastErr = `Firecrawl key#${i + 1} failed [${r.status}]: ${body}`;
      if (![401, 402, 403, 429].includes(r.status)) { fcRes = null; break; }
    }

    if (!fcRes) {
      await supabase.from('payoneer_verifications').upsert({ url, amount: null, currency: null, error: lastErr, verified_at: new Date().toISOString() });
      return new Response(
        JSON.stringify({ error: lastErr, amount: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const fcJson = await fcRes.json();
    const markdown: string =
      fcJson?.data?.markdown || fcJson?.markdown || fcJson?.data?.html || fcJson?.html || '';

    const { amount, currency } = extractAmount(markdown);
    if (amount === null) {
      await supabase.from('payoneer_verifications').upsert({ url, amount: null, currency: null, error: 'Could not extract amount', verified_at: new Date().toISOString() });
      return new Response(
        JSON.stringify({ error: 'Could not extract amount from Payoneer page', amount: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    await supabase.from('payoneer_verifications').upsert({ url, amount, currency, error: null, verified_at: new Date().toISOString() });

    // Push the verified amount into the Google Sheet row for this submission
    if (timesheetId) await syncToSheet(timesheetId, url, amount, currency);

    return new Response(JSON.stringify({ amount, currency }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
