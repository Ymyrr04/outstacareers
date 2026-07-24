import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SPREADSHEET_ID = '1HPFeleVLcfR0kyG1N4HCaEeQcEypzXquhQPbMToXQHY';
const GATEWAY = 'https://connector-gateway.lovable.dev/google_sheets/v4';
const FIRECRAWL_V2 = 'https://api.firecrawl.dev/v2';

// Column indices (0-based) must match HEADERS in append-timesheet-to-sheet
const COL = {
  invoice: 7,
  payoneerLink: 11,
  payoneerAmount: 12,
  payoneerMatch: 13,
};

function currentWeekTabName(): string {
  const nowEst = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const dow = nowEst.getDay();
  const daysFromMon = (dow + 6) % 7;
  const mon = new Date(nowEst);
  mon.setDate(nowEst.getDate() - daysFromMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `Mon ${months[mon.getMonth()]} ${mon.getDate()} – Sun ${months[sun.getMonth()]} ${sun.getDate()}, ${sun.getFullYear()}`;
}

function colLetter(n: number): string {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

async function fetchPayoneer(url: string): Promise<{ amount: number | null; currency: string | null; error?: string }> {
  const keys = [
    Deno.env.get('FIRECRAWL_API_KEY'),
    Deno.env.get('FIRECRAWL_API_KEY_2'),
    Deno.env.get('FIRECRAWL_API_KEY_3'),
  ].filter(Boolean) as string[];
  if (keys.length === 0) return { amount: null, currency: null, error: 'FIRECRAWL_API_KEY missing' };
  let lastErr = '';
  for (let i = 0; i < keys.length; i++) {
    try {
      const res = await fetch(`${FIRECRAWL_V2}/scrape`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${keys[i]}`, 'Content-Type': 'application/json' },
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
      if (!res.ok) {
        lastErr = `Firecrawl key#${i + 1} ${res.status}`;
        if (![401, 402, 403, 429].includes(res.status)) return { amount: null, currency: null, error: lastErr };
        continue;
      }
      const json = await res.json();
      const text: string = json?.data?.markdown || json?.markdown || json?.data?.html || json?.html || '';
      const matches = [...text.matchAll(/([\d,]+\.\d{2})\s*(USD|EUR|GBP|AUD|CAD)/gi)];
      let amount: number | null = null;
      let currency: string | null = null;
      for (const m of matches) {
        const n = parseFloat(m[1].replace(/,/g, ''));
        if (!isNaN(n) && (amount === null || n > amount)) { amount = n; currency = m[2].toUpperCase(); }
      }
      return { amount, currency, error: amount === null ? 'no amount found' : undefined };
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  return { amount: null, currency: null, error: lastErr || 'all Firecrawl keys failed' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    const sheetsKey = Deno.env.get('GOOGLE_SHEETS_API_KEY');
    if (!lovableKey || !sheetsKey) throw new Error('Google Sheets connector not configured');

    const gwHeaders = {
      Authorization: `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': sheetsKey,
      'Content-Type': 'application/json',
    };

    const tabName = currentWeekTabName();
    const encodedTab = encodeURIComponent(`'${tabName}'`);
    const lastCol = colLetter(18);

    // Read all rows on the current-week tab
    const rangeRes = await fetch(
      `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${encodedTab}!A1:${lastCol}1000`,
      { headers: gwHeaders },
    );
    if (!rangeRes.ok) {
      const body = await rangeRes.text();
      throw new Error(`Sheet read failed [${rangeRes.status}]: ${body}`);
    }
    const { values } = await rangeRes.json();
    if (!values || values.length < 2) {
      return new Response(JSON.stringify({ tab: tabName, processed: 0, message: 'No rows to verify' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: any[] = [];
    // Row 1 is header, data rows start at index 1 -> sheet row = i + 1 (1-based)
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const sheetRow = i + 1;
      const link: string = (row[COL.payoneerLink] || '').trim();
      const existingAmount: string = (row[COL.payoneerAmount] || '').trim();
      const invoiceCell: string = (row[COL.invoice] || '').toString().trim();
      const invoice = parseFloat(invoiceCell.replace(/,/g, '')) || 0;

      if (!link) {
        results.push({ row: sheetRow, skipped: 'no link' });
        continue;
      }
      // Skip if already verified (has a numeric amount recorded)
      if (existingAmount && /\d/.test(existingAmount)) {
        results.push({ row: sheetRow, skipped: 'already verified', existingAmount });
        continue;
      }

      const p = await fetchPayoneer(link);
      let amountCell = '';
      let matchCell = '';
      if (p.amount === null) {
        matchCell = `— (${p.error || 'unavailable'})`;
      } else {
        amountCell = `${p.amount.toFixed(2)}${p.currency ? ' ' + p.currency : ''}`;
        matchCell = Math.abs(p.amount - Number(invoice.toFixed(2))) < 0.01 ? '✓ Match' : '✗ Mismatch';
      }

      const amountRange = `${colLetter(COL.payoneerAmount + 1)}${sheetRow}:${colLetter(COL.payoneerMatch + 1)}${sheetRow}`;
      const updRes = await fetch(
        `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${encodedTab}!${amountRange}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: gwHeaders,
          body: JSON.stringify({ values: [[amountCell, matchCell]] }),
        },
      );
      const ok = updRes.ok;
      results.push({ row: sheetRow, link, amount: p.amount, currency: p.currency, match: matchCell, updated: ok });
    }

    return new Response(JSON.stringify({ tab: tabName, processed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
