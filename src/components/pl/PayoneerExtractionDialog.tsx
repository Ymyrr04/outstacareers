import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download } from 'lucide-react';
import { selectedExtractionRows, type PayoneerExtractionRow } from '@/lib/payoneerExtraction';

export function PayoneerExtractionDialog({ rows, onClose, onExtract }: {
  rows: PayoneerExtractionRow[];
  onClose: () => void;
  onExtract: (rows: PayoneerExtractionRow[]) => void;
}) {
  const [selected, setSelected] = useState(() => new Set(rows.map((row) => row.id)));
  const allSelected = selected.size === rows.length;
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Payoneer extraction</DialogTitle>
          <DialogDescription>{selected.size} of {rows.length} submissions selected</DialogDescription>
        </DialogHeader>
        <div className="overflow-auto min-h-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-10"><Checkbox aria-label="Select all submissions" checked={allSelected ? true : selected.size ? 'indeterminate' : false} onCheckedChange={(checked) => setSelected(checked === true ? new Set(rows.map((r) => r.id)) : new Set())} /></TableHead>
              <TableHead>Name / Payoneer Email</TableHead><TableHead>Invoice Week</TableHead>
              <TableHead className="text-right">Invoice</TableHead><TableHead className="text-right">Bonus</TableHead><TableHead>Deposit status</TableHead>
            </TableRow></TableHeader>
            <TableBody>{rows.map((row) => {
              const name = row.contractor?.applicant?.full_name || 'Unnamed contractor';
              return <TableRow key={row.id}>
                <TableCell><Checkbox aria-label={`Include ${name} ${row.week_ending_date}`} checked={selected.has(row.id)} onCheckedChange={(checked) => setSelected((prev) => { const next = new Set(prev); if (checked === true) next.add(row.id); else next.delete(row.id); return next; })} /></TableCell>
                <TableCell><div className="font-medium">{name}</div><div className="text-xs text-muted-foreground break-all">{row.contractor?.payoneer_email || 'No Payoneer email'}</div></TableCell>
                <TableCell className="whitespace-nowrap">{row.week_ending_date}</TableCell>
                <TableCell className="text-right">{row.contractor?.hourly_rate != null ? `$${(Number(row.total_hours) * Number(row.contractor.hourly_rate)).toFixed(2)}` : '—'}</TableCell>
                <TableCell className="text-right">${Number(row.incentive_amount || 0).toFixed(2)}</TableCell>
                <TableCell>{row.depositStatus === 'ongoing' ? <Badge variant="outline">Still on deposit</Badge> : row.depositStatus === 'complete' ? <Badge variant="secondary">Just completed deposit</Badge> : row.depositStatus === 'excess' ? <Badge variant="destructive">Excess ${row.excessAmount.toFixed(2)}</Badge> : <span className="text-muted-foreground text-xs">No deposit this week</span>}</TableCell>
              </TableRow>;
            })}</TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={selected.size === 0} onClick={() => onExtract(selectedExtractionRows(rows, selected))}><Download className="w-4 h-4 mr-2" />Extract selected ({selected.size})</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}