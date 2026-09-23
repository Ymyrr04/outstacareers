import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FileText, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { generatePdcPdf } from '@/lib/pdcPdf';

export interface PdcSourceData {
  fullName: string;
  hoursPerWeek: number | null;
  hourlyRate: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: PdcSourceData;
  legalDocRequestId?: string;
  contractorName?: string;
}

const computeDeposit = (hours: string, rate: string): string => {
  const h = parseFloat(hours);
  const r = parseFloat(rate);
  if (isNaN(h) || isNaN(r)) return '';
  return (r * h * 2).toFixed(2);
};

export const PdcGenerateDialog: React.FC<Props> = ({ open, onOpenChange, data, contractorName }) => {
  const [salutation, setSalutation] = useState('');
  const [fullName, setFullName] = useState(data.fullName);
  const [hours, setHours] = useState(data.hoursPerWeek != null ? String(data.hoursPerWeek) : '');
  const [rate, setRate] = useState(data.hourlyRate != null ? String(data.hourlyRate) : '');
  const [deposit, setDeposit] = useState(() =>
    computeDeposit(
      data.hoursPerWeek != null ? String(data.hoursPerWeek) : '',
      data.hourlyRate != null ? String(data.hourlyRate) : '',
    ),
  );

  // Recalculate the deposit whenever hours or rate change; manual edits stick until then.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setDeposit(computeDeposit(hours, rate));
  }, [hours, rate]);

  const missing = {
    salutation: !salutation,
    fullName: !fullName.trim(),
    hours: !hours.trim() || isNaN(parseFloat(hours)),
    rate: !rate.trim() || isNaN(parseFloat(rate)),
    deposit: !deposit.trim() || isNaN(parseFloat(deposit)),
  };
  const canGenerate = !Object.values(missing).some(Boolean);

  const fieldCls = (isMissing: boolean) =>
    cn(isMissing && 'border-amber-500 focus-visible:ring-amber-500');

  const helper = (isMissing: boolean) =>
    isMissing ? <p className="text-[10px] text-amber-600">Missing — enter manually</p> : null;

  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const generate = async () => {
    setGenerating(true);
    try {
      const blob = await generatePdcPdf({
        salutation,
        fullName: fullName.trim(),
        amount: parseFloat(deposit).toFixed(2),
        todayDate: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      });
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (err) {
      console.error('PDC generation failed', err);
      toast({ title: 'Could not generate the certificate', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const fileName = `Pay_Deposit_Certificate-${fullName.trim().replace(/\s+/g, '_')}.pdf`;

  const download = () => {
    if (!pdfUrl) return;
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  if (pdfUrl) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Pay deposit certificate preview
            </DialogTitle>
          </DialogHeader>

          <object data={pdfUrl} type="application/pdf" className="w-full rounded border" style={{ height: 620 }}>
            <p className="text-sm text-muted-foreground p-4">Preview unavailable — use Download to view the file.</p>
          </object>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => { URL.revokeObjectURL(pdfUrl); setPdfUrl(null); }}>
              Back to edit
            </Button>
            <Button variant="outline" size="sm" onClick={download}>
              <Download className="w-3.5 h-3.5 mr-1" />
              Download
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Generate PDC{contractorName ? ` — ${contractorName}` : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Salutation</Label>
            <Select value={salutation} onValueChange={setSalutation}>
              <SelectTrigger className={fieldCls(missing.salutation)}>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Mr.">Mr.</SelectItem>
                <SelectItem value="Ms.">Ms.</SelectItem>
              </SelectContent>
            </Select>
            {helper(missing.salutation)}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className={fieldCls(missing.fullName)} />
            {helper(missing.fullName)}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Hours per week</Label>
              <Input type="number" value={hours} onChange={(e) => setHours(e.target.value)} className={fieldCls(missing.hours)} />
              {helper(missing.hours)}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hourly rate</Label>
              <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className={fieldCls(missing.rate)} />
              {helper(missing.rate)}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Deposit amount (rate × hours × 2)</Label>
            <Input
              type="number"
              step="0.01"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              className={fieldCls(missing.deposit)}
            />
            {helper(missing.deposit)}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" disabled={!canGenerate || generating} onClick={generate}>
              <FileText className="w-3.5 h-3.5 mr-1" />
              Generate
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
