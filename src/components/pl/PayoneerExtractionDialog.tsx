import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download } from 'lucide-react';
import { extractionDepositRows, extractionExportRows, type PayoneerExtractionRow } from '@/lib/payoneerExtraction';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function PayoneerExtractionDialog({ rows, onClose, onExtract }: {
  rows: PayoneerExtractionRow[];
  onClose: () => void;
  onExtract: (rows: PayoneerExtractionRow[]) => void;
}) {
  const depositRows = useMemo(() => extractionDepositRows(rows), [rows]);
  const noDepositRows = useMemo(() => rows.filter((row) => row.depositStatus === 'none'), [rows]);
  const [selected, setSelected] = useState(() => new Set(depositRows.map((row) => row.id)));
  const allSelected = depositRows.length > 0 && selected.size === depositRows.length;
  const total = noDepositRows.length + selected.size;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Payoneer extraction</DialogTitle>
          <DialogDescription>
            {noDepositRows.length > 0
              ? `${plural(noDepositRows.length, 'submission')} with no deposit ${noDepositRows.length === 1 ? 'is' : 'are'} always included. Choose which of the ${plural(depositRows.length, 'deposit submission')} to include.`
              : `Every submission this week has a deposit — choose which of the ${plural(depositRows.length, 'deposit submission')} to include.`}
          </DialogDescription>
        </DialogHeader>
        {depositRows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No submissions have a deposit this week, so all {plural(rows.length, 'submission')} will be extracted.
          </p>
        ) : (
          <div className="overflow-auto min-h-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-10"><Checkbox aria-label="Select all deposit submissions" checked={allSelected ? true : selected.size ? 'indeterminate' : false} onCheckedChange={(checked) => setSelected(checked === true ? new Set(depositRows.map((r) => r.id)) : new Set())} /></TableHead>
                <TableHead>Name / Payoneer Email</TableHead><TableHead>Invoice Week</TableHead>
                <TableHead className="text-right">Invoice</TableHead><TableHead className="text-right">Bonus</TableHead><TableHead>Deposit status</TableHead>
              </TableRow></TableHeader>
              <TableBody>{depositRows.map((row) => {
                const name = row.contractor?.applicant?.full_name || 'Unnamed contractor';
                return <TableRow key={row.id}>
                  <TableCell><Checkbox aria-label={`Include ${name} ${row.week_ending_date}`} checked={selected.has(row.id)} onCheckedChange={(checked) => setSelected((prev) => { const next = new Set(prev); if (checked === true) next.add(row.id); else next.delete(row.id); return next; })} /></TableCell>
                  <TableCell><div className="font-medium">{name}</div><div className="text-xs text-muted-foreground break-all">{row.contractor?.payoneer_email || 'No Payoneer email'}</div></TableCell>
                  <TableCell className="whitespace-nowrap">{row.week_ending_date}</TableCell>
                  <TableCell className="text-right">{row.contractor?.hourly_rate != null ? `$${(Number(row.total_hours) * Number(row.contractor.hourly_rate)).toFixed(2)}` : '—'}</TableCell>
                  <TableCell className="text-right">${Number(row.incentive_amount || 0).toFixed(2)}</TableCell>
                  <TableCell>{row.depositStatus === 'ongoing' ? <Badge variant="outline">Still on deposit</Badge> : row.depositStatus === 'complete' ? <Badge variant="secondary">Just completed deposit</Badge> : <Badge variant="destructive">Excess ${row.excessAmount.toFixed(2)}</Badge>}</TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          </div>
        )}
        {noDepositRows.length > 0 && (
          <details className="shrink-0 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">Always included — no deposit this week ({noDepositRows.length})</summary>
            <div className="mt-1 max-h-28 overflow-auto rounded-md border border-border p-2 flex flex-wrap gap-x-3 gap-y-1 leading-5">
              {noDepositRows.map((row) => <span key={row.id}>{row.contractor?.applicant?.full_name || 'Unnamed contractor'}</span>)}
            </div>
          </details>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={total === 0} onClick={() => onExtract(extractionExportRows(rows, selected))}><Download className="w-4 h-4 mr-2" />Extract ({total})</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
