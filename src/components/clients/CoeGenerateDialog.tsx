import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FileText, Download, Send, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { generateCoePdf } from '@/lib/coePdf';
import { toast } from '@/hooks/use-toast';

export interface CoeSourceData {
  fullName: string;
  role: string;
  startDate: string; // ISO or date-only
  hoursPerWeek: number | null;
  hourlyRate: number | null;
  companyName: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: CoeSourceData;
  legalDocRequestId?: string;
  contractorName?: string;
  onSent?: () => void;
}

const formatLongDate = (value: string): string => {
  if (!value) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

export const CoeGenerateDialog: React.FC<Props> = ({ open, onOpenChange, data, legalDocRequestId, contractorName, onSent }) => {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [fullName, setFullName] = useState(data.fullName);
  const [salutation, setSalutation] = useState('');
  const [role, setRole] = useState(data.role);
  const [startDate, setStartDate] = useState(formatLongDate(data.startDate));
  const [hours, setHours] = useState(data.hoursPerWeek != null ? String(data.hoursPerWeek) : '');
  const [rate, setRate] = useState(data.hourlyRate != null ? String(data.hourlyRate) : '');

  const monthlyIncome = useMemo(() => {
    const h = parseFloat(hours);
    const r = parseFloat(rate);
    if (isNaN(h) || isNaN(r)) return '';
    return (r * h * 4.3).toFixed(2);
  }, [hours, rate]);

  const missing = {
    fullName: !fullName.trim(),
    salutation: !salutation,
    role: !role.trim(),
    startDate: !startDate.trim(),
    hours: !hours.trim() || isNaN(parseFloat(hours)),
    rate: !rate.trim() || isNaN(parseFloat(rate)),
  };
  const canGenerate = !Object.values(missing).some(Boolean);

  const fieldCls = (isMissing: boolean) =>
    cn(isMissing && 'border-amber-500 focus-visible:ring-amber-500');

  const helper = (isMissing: boolean) =>
    isMissing ? <p className="text-[10px] text-amber-600">Missing — enter manually</p> : null;

  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    setGenerating(true);
    try {
      const blob = await generateCoePdf({
        salutation,
        fullName: fullName.trim(),
        role: role.trim(),
        startDate: startDate.trim(),
        hours: hours.trim(),
        income: monthlyIncome,
        todayDate: formatLongDate(new Date().toISOString()),
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      setPdfBytes(bytes);
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (err) {
      console.error('COE generation failed', err);
      toast({ title: 'Could not generate the certificate', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const fileName = `COE-${fullName.trim().replace(/\s+/g, '_')}.pdf`;

  const download = () => {
    if (!pdfUrl) return;
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const sendToContractor = async () => {
    if (!pdfBytes || !legalDocRequestId) return;
    setSending(true);
    try {
      let binary = '';
      pdfBytes.forEach((b) => { binary += String.fromCharCode(b); });
      const pdfBase64 = btoa(binary);

      const { error } = await supabase.functions.invoke('notify-timesheet-event', {
        body: {
          event: 'legal_doc_completed',
          legalDocRequestId,
          pdfBase64,
          filename: fileName,
        },
      });
      if (error) throw error;

      const { data: existing } = await supabase
        .from('contractor_legal_doc_requests' as any)
        .select('admin_notes')
        .eq('id', legalDocRequestId)
        .maybeSingle();
      const prevNote = ((existing as any)?.admin_notes || '').trim();
      const stamp = `COE sent ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
      await supabase
        .from('contractor_legal_doc_requests' as any)
        .update({ status: 'Completed', admin_notes: prevNote ? `${prevNote}\n${stamp}` : stamp })
        .eq('id', legalDocRequestId);

      toast({ title: `COE sent to ${contractorName || fullName.trim()}` });
      onSent?.();
      onOpenChange(false);
    } catch (err) {
      console.error('COE send failed', err);
      toast({ title: 'Could not send the certificate', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };


  if (pdfUrl) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Certificate preview
            </DialogTitle>
          </DialogHeader>

          <object data={pdfUrl} type="application/pdf" className="w-full rounded border" style={{ height: 620 }}>
            <p className="text-sm text-muted-foreground p-4">Preview unavailable — use Download to view the file.</p>
          </object>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => { URL.revokeObjectURL(pdfUrl); setPdfUrl(null); setPdfBytes(null); }}>
              Back to edit
            </Button>
            <Button variant="outline" size="sm" onClick={download}>
              <Download className="w-3.5 h-3.5 mr-1" />
              Download
            </Button>
            <Button size="sm" disabled={sending || !legalDocRequestId} onClick={sendToContractor}>
              {sending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
              Send to contractor
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
            Generate COE
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

          <div className="space-y-1">
            <Label className="text-xs">Role</Label>
            <Input value={role} onChange={(e) => setRole(e.target.value)} className={fieldCls(missing.role)} />
            {helper(missing.role)}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Start date</Label>
            <Input value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="Month DD, YYYY" className={fieldCls(missing.startDate)} />
            {helper(missing.startDate)}
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
            <Label className="text-xs">Monthly income (rate × hours × 4.3)</Label>
            <Input value={monthlyIncome ? `$${monthlyIncome}` : ''} readOnly className="bg-muted" />
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
