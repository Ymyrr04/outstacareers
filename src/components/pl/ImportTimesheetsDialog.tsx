import { useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface ParsedRow {
  rowNumber: number;
  contractorKey: string; // email or name as written in the file
  weekEnding: string; // YYYY-MM-DD
  totalHours: number;
  overtimeHours: number;
  incentiveAmount: number;
  notes: string;
  assignmentId: string | null;
  matchedName: string | null;
  issue: string | null; // why it can't be imported
  isDuplicate: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

/** Minimal CSV parser handling quoted fields, commas and newlines inside quotes. */
const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** Accepts YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY (only when day > 12), and "Mon DD, YYYY". */
const parseDate = (raw: string): string | null => {
  const s = raw.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    let [, a, b, y] = slash;
    // If first part > 12 it must be DD/MM
    if (Number(a) > 12) [a, b] = [b, a];
    return `${y}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return null;
};

const parseNum = (raw: string): number | null => {
  const n = Number(raw.replace(/[$,\s]/g, ''));
  return raw.trim() === '' || isNaN(n) ? null : n;
};

export const ImportTimesheetsDialog = ({ open, onOpenChange, onImported }: Props) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState<{ inserted: number; skipped: number } | null>(null);

  const reset = () => {
    setFileName(null);
    setRows([]);
    setDone(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    setDone(null);
    try {
      const text = await file.text();
      const grid = parseCsv(text);
      if (grid.length < 2) {
        toast({ title: 'The file looks empty', description: 'Expected a header row plus data rows.', variant: 'destructive' });
        setParsing(false);
        return;
      }
      const header = grid[0].map(norm);
      const col = (...names: string[]) => {
        for (const n of names) {
          const i = header.indexOf(n);
          if (i >= 0) return i;
        }
        return -1;
      };
      const cEmail = col('email', 'contractor_email', 'e_mail');
      const cName = col('name', 'contractor', 'contractor_name', 'full_name', 'employee');
      const cWeek = col('week_ending', 'week_ending_date', 'week_end', 'week', 'date', 'week_ending_sunday');
      const cHours = col('total_hours', 'hours', 'work_hours', 'total');
      const cOt = col('overtime_hours', 'overtime', 'ot', 'ot_hours');
      const cBonus = col('incentive_amount', 'incentive', 'bonus', 'bonus_amount');
      const cNotes = col('notes', 'note', 'comments', 'remarks');

      if (cWeek < 0 || cHours < 0 || (cEmail < 0 && cName < 0)) {
        toast({
          title: 'Missing required columns',
          description: 'The file needs columns for contractor (email or name), week ending date, and total hours.',
          variant: 'destructive',
        });
        setParsing(false);
        return;
      }

      // Load all assignments (any status) + existing timesheets for matching & duplicate detection
      const [{ data: assignments }, { data: existing }] = await Promise.all([
        supabase
          .from('contractor_assignments')
          .select('id, applicant:applicants_prescreen(full_name, email)'),
        supabase
          .from('contractor_timesheets')
          .select('contractor_assignment_id, week_ending_date'),
      ]);

      const byEmail = new Map<string, { id: string; name: string }>();
      const byName = new Map<string, { id: string; name: string }>();
      ((assignments as any[]) || []).forEach((a) => {
        const email = (a.applicant?.email || '').trim().toLowerCase();
        const name = (a.applicant?.full_name || '').trim();
        if (email && !byEmail.has(email)) byEmail.set(email, { id: a.id, name });
        if (name && !byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), { id: a.id, name });
      });

      const existingKeys = new Set(
        ((existing as any[]) || []).map((t) => `${t.contractor_assignment_id}|${t.week_ending_date}`)
      );

      const parsed: ParsedRow[] = grid.slice(1).map((cells, idx) => {
        const contractorKey = (cEmail >= 0 ? cells[cEmail] : cells[cName])?.trim() || '';
        const weekEnding = parseDate(cells[cWeek] || '');
        const totalHours = parseNum(cells[cHours] || '');
        const overtimeHours = cOt >= 0 ? parseNum(cells[cOt] || '') ?? 0 : 0;
        const incentiveAmount = cBonus >= 0 ? parseNum(cells[cBonus] || '') ?? 0 : 0;
        const notes = cNotes >= 0 ? (cells[cNotes] || '').trim() : '';

        let issue: string | null = null;
        let assignmentId: string | null = null;
        let matchedName: string | null = null;

        if (!contractorKey) issue = 'No contractor name or email';
        else if (!weekEnding) issue = 'Unrecognised week ending date';
        else if (totalHours === null) issue = 'Total hours is not a number';
        else {
          const match =
            byEmail.get(contractorKey.toLowerCase()) || byName.get(contractorKey.toLowerCase());
          if (!match) issue = 'No matching contractor record';
          else {
            assignmentId = match.id;
            matchedName = match.name;
          }
        }

        const isDuplicate =
          !!assignmentId && !!weekEnding && existingKeys.has(`${assignmentId}|${weekEnding}`);

        return {
          rowNumber: idx + 2, // spreadsheet row (1 = header)
          contractorKey,
          weekEnding: weekEnding || (cells[cWeek] || '').trim(),
          totalHours: totalHours ?? 0,
          overtimeHours,
          incentiveAmount,
          notes,
          assignmentId,
          matchedName,
          issue,
          isDuplicate,
        };
      });

      setRows(parsed);
      setFileName(file.name);
    } catch (e: any) {
      toast({ title: 'Could not read the file', description: e?.message, variant: 'destructive' });
    } finally {
      setParsing(false);
    }
  };

  const importable = useMemo(() => rows.filter((r) => !r.issue && !r.isDuplicate), [rows]);
  const skipped = useMemo(() => rows.filter((r) => r.issue || r.isDuplicate), [rows]);

  const handleImport = async () => {
    if (importable.length === 0) return;
    setImporting(true);
    try {
      const payload = importable.map((r) => ({
        contractor_assignment_id: r.assignmentId!,
        week_ending_date: r.weekEnding,
        total_hours: r.totalHours,
        overtime_hours: r.overtimeHours,
        incentive_amount: r.incentiveAmount,
        notes: r.notes || null,
        status: 'approved',
        outsta_status: 'approved',
        client_approval_status: 'approved',
        locked: true,
        submitted_at: new Date(`${r.weekEnding}T12:00:00Z`).toISOString(),
      }));
      // Insert in chunks of 200
      let inserted = 0;
      for (let i = 0; i < payload.length; i += 200) {
        const { error } = await supabase.from('contractor_timesheets').insert(payload.slice(i, i + 200));
        if (error) throw error;
        inserted += Math.min(200, payload.length - i);
      }
      setDone({ inserted, skipped: skipped.length });
      toast({ title: `Imported ${inserted} timesheets`, description: skipped.length ? `${skipped.length} rows were skipped.` : undefined });
      onImported();
    } catch (e: any) {
      toast({ title: 'Import failed', description: e?.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!importing) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import historical timesheets</DialogTitle>
          <DialogDescription>
            Upload a CSV with columns: <span className="font-medium">email (or name), week ending, total hours</span> — optional:
            overtime, bonus, notes. Rows are matched to contractor records by email first, then by exact name.
            Imported rows are marked approved and locked.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={parsing || importing}>
              {parsing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              {fileName ? 'Choose a different file' : 'Choose CSV file'}
            </Button>
            {fileName && (
              <span className="text-sm text-muted-foreground inline-flex items-center gap-1">
                <FileSpreadsheet className="w-4 h-4" /> {fileName}
              </span>
            )}
          </div>

          {rows.length > 0 && (
            <>
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline" className="border-emerald-500 text-emerald-600">
                  {importable.length} ready
                </Badge>
                {skipped.length > 0 && (
                  <Badge variant="outline" className="border-amber-500 text-amber-600">
                    {skipped.length} skipped
                  </Badge>
                )}
              </div>
              <div className="border rounded-md max-h-[45vh] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Row</TableHead>
                      <TableHead>Contractor</TableHead>
                      <TableHead>Week ending</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right">OT</TableHead>
                      <TableHead className="text-right">Bonus</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.rowNumber} className={r.issue || r.isDuplicate ? 'opacity-60' : ''}>
                        <TableCell className="text-xs text-muted-foreground">{r.rowNumber}</TableCell>
                        <TableCell className="text-sm">
                          {r.matchedName || r.contractorKey}
                          {r.matchedName && r.matchedName !== r.contractorKey && (
                            <span className="block text-xs text-muted-foreground">{r.contractorKey}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{r.weekEnding}</TableCell>
                        <TableCell className="text-sm text-right">{r.totalHours}</TableCell>
                        <TableCell className="text-sm text-right">{r.overtimeHours}</TableCell>
                        <TableCell className="text-sm text-right">{r.incentiveAmount}</TableCell>
                        <TableCell>
                          {r.issue ? (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                              <AlertTriangle className="w-3 h-3" /> {r.issue}
                            </span>
                          ) : r.isDuplicate ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <AlertTriangle className="w-3 h-3" /> Already exists
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                              <CheckCircle2 className="w-3 h-3" /> Ready
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {done && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20 p-3 text-sm text-emerald-700 dark:text-emerald-400">
              Imported {done.inserted} timesheets{done.skipped > 0 ? ` · ${done.skipped} rows skipped` : ''}.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }} disabled={importing}>
            Close
          </Button>
          <Button onClick={handleImport} disabled={importable.length === 0 || importing || !!done}>
            {importing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Import {importable.length > 0 ? `${importable.length} rows` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
