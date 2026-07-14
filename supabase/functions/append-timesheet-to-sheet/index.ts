import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SPREADSHEET_ID = '1HPFeleVLcfR0kyG1N4HCaEeQcEypzXquhQPbMToXQHY';
const GATEWAY = 'https://connector-gateway.lovable.dev/google_sheets/v4';

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

    // Load timesheet with contractor + applicant + client
    const { data: ts, error: tsErr } = await supabase
      .from('contractor_timesheets')
      .select(`
        id, week_ending_date, total_hours, overtime_hours, submitted_at, status,
        contractor_assignments!inner (
          job_title,
          applicants_prescreen ( full_name ),
          clients ( company_name )
        )
      `)
      .eq('id', timesheetId)
      .maybeSingle();
    if (tsErr) throw tsErr;
    if (!ts) throw new Error('Timesheet not found');

    const assignment: any = ts.contractor_assignments;
    const contractorName = assignment?.applicants_prescreen?.full_name || 'Unknown';
    const clientName = assignment?.clients?.company_name || 'Unassigned';
    const jobTitle = assignment?.job_title || '';

    const gwHeaders = {
      Authorization: `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': sheetsKey,
      'Content-Type': 'application/json',
    };

    // Get first sheet's title
    const metaRes = await fetch(
      `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties.title`,
      { headers: gwHeaders },
    );
    if (!metaRes.ok) {
      const body = await metaRes.text();
      throw new Error(`Sheet metadata failed [${metaRes.status}]: ${body}`);
    }
    const meta = await metaRes.json();
    const tabName: string = meta?.sheets?.[0]?.properties?.title || 'Sheet1';

    // Ensure header row exists
    const headerRes = await fetch(
      `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${tabName}!A1:F1`,
      { headers: gwHeaders },
    );
    const headerJson = headerRes.ok ? await headerRes.json() : { values: [] };
    if (!headerJson.values || headerJson.values.length === 0) {
      await fetch(
        `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${tabName}!A1:F1?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: gwHeaders,
          body: JSON.stringify({
            values: [['Contractor', 'Job Title', 'Client', 'Week Ending', 'Total Hours', 'Submitted At']],
          }),
        },
      );
    }

    const row = [
      contractorName,
      jobTitle,
      clientName,
      ts.week_ending_date,
      Number(ts.total_hours ?? 0),
      ts.submitted_at ? new Date(ts.submitted_at).toISOString() : new Date().toISOString(),
    ];

    const appendRes = await fetch(
      `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${tabName}!A:F:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
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

    return new Response(JSON.stringify({ success: true, tab: tabName }), {
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
