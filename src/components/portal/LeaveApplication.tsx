import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { CalendarIcon, Loader2, HelpCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const LEAVE_TYPES = [
  'Bereavement leave (Immediate Family)',
  'Bereavement leave (Other)',
  'Personal leave',
  'Emergency leave',
  'Medical Leave',
  'Client Mandated Off',
] as const;

const TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const ampm = h < 12 ? 'AM' : 'PM';
      slots.push(`${hour12}:${m === 0 ? '00' : '30'} ${ampm}`);
    }
  }
  return slots;
})();

interface LeaveRow {
  id: string;
  leave_date: string;
  time_period: string;
  specific_time: string | null;
  leave_type: string;
  leave_type_other: string | null;
  compensation_type: string | null;
  compensation_note: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  review_notes: string | null;
}

interface Props {
  contractorAssignmentId: string;
}

export const LeaveApplication: React.FC<Props> = ({ contractorAssignmentId }) => {
  const { toast } = useToast();
  const [leaveDate, setLeaveDate] = useState<Date | undefined>(undefined);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [timePeriod, setTimePeriod] = useState<'AM' | 'PM' | 'All day'>('All day');
  const [timeFrom, setTimeFrom] = useState<string>('9:00 AM');
  const [timeTo, setTimeTo] = useState<string>('12:00 PM');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [otherChecked, setOtherChecked] = useState(false);
  const [otherText, setOtherText] = useState('');
  const [compensationType, setCompensationType] = useState<'Paid' | 'Unpaid' | 'Time compensation' | ''>('');
  const [compensationNote, setCompensationNote] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clientInformed, setClientInformed] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  const loadHistory = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('contractor_leave_applications' as any)
      .select('id, leave_date, time_period, specific_time, leave_type, leave_type_other, compensation_type, compensation_note, notes, status, created_at, review_notes')
      .eq('contractor_assignment_id', contractorAssignmentId)
      .order('leave_date', { ascending: false });
    if (!error) setHistory((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { loadHistory(); }, [contractorAssignmentId]);

  const toggleType = (t: string, checked: boolean) => {
    setSelectedTypes((prev) => checked ? [...prev, t] : prev.filter((x) => x !== t));
  };

  const reset = () => {
    setLeaveDate(undefined);
    setTimePeriod('All day');
    setTimeFrom('9:00 AM');
    setTimeTo('12:00 PM');
    setSelectedTypes([]);
    setOtherChecked(false);
    setOtherText('');
    setCompensationType('');
    setCompensationNote('');
    setNotes('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveDate) {
      toast({ title: 'Leave date required', variant: 'destructive' });
      return;
    }
    const types = [...selectedTypes];
    if (otherChecked) {
      if (!otherText.trim()) {
        toast({ title: 'Please specify the "Other" leave type', variant: 'destructive' });
        return;
      }
      types.push(`Other: ${otherText.trim()}`);
    }
    if (types.length === 0) {
      toast({ title: 'Select at least one leave type', variant: 'destructive' });
      return;
    }
    if (!compensationType) {
      toast({ title: 'Please select a compensation type', variant: 'destructive' });
      return;
    }
    if (compensationType === 'Time compensation' && !compensationNote.trim()) {
      toast({ title: 'Please add a comment for time compensation', variant: 'destructive' });
      return;
    }
    setClientInformed(false);
    setConfirmOpen(true);
  };

  const performSubmit = async () => {
    if (!clientInformed) {
      toast({ title: 'Please confirm the client has approved your leave', variant: 'destructive' });
      return;
    }
    if (!leaveDate) return;
    const types = [...selectedTypes];
    if (otherChecked) types.push(`Other: ${otherText.trim()}`);
    setSubmitting(true);
    try {
      const { error } = await supabase.from('contractor_leave_applications' as any).insert({
        contractor_assignment_id: contractorAssignmentId,
        leave_date: format(leaveDate, 'yyyy-MM-dd'),
        time_period: timePeriod,
        specific_time: timePeriod === 'All day' ? null : `${timeFrom} - ${timeTo}`,
        leave_type: types.join('; '),
        leave_type_other: otherChecked ? otherText.trim() : null,
        compensation_type: compensationType,
        compensation_note: compensationType === 'Time compensation' ? compensationNote.trim() : null,
        notes: notes.trim() || null,
        client_informed_approved: true,
      });
      if (error) throw error;
      toast({ title: 'Leave application submitted', description: 'Your request has been sent for review.' });
      setConfirmOpen(false);
      reset();
      loadHistory();
    } catch (err: any) {
      toast({ title: 'Submission failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (s: string) => {
    if (s === 'approved') return <Badge className="bg-emerald-600">Approved</Badge>;
    if (s === 'rejected') return <Badge variant="destructive">Rejected</Badge>;
    return <Badge variant="secondary">Pending</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Apply for leave</CardTitle>
          <CardDescription>Submit a leave request. All times are EST.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Leave date <span className="text-destructive">*</span></Label>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn('w-full justify-start text-left font-normal', !leaveDate && 'text-muted-foreground')}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {leaveDate ? format(leaveDate, 'MMM/dd/yyyy') : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={leaveDate}
                      onSelect={(d) => { setLeaveDate(d); setDatePickerOpen(false); }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Time period (EST) <span className="text-destructive">*</span></Label>
                <RadioGroup
                  value={timePeriod}
                  onValueChange={(v) => setTimePeriod(v as any)}
                  className="flex items-center gap-4 pt-2"
                >
                  {(['AM', 'PM', 'All day'] as const).map((p) => (
                    <div key={p} className="flex items-center gap-2">
                      <RadioGroupItem value={p} id={`tp-${p}`} />
                      <Label htmlFor={`tp-${p}`} className="font-normal cursor-pointer">{p}</Label>
                    </div>
                  ))}
                </RadioGroup>
                {(timePeriod === 'AM' || timePeriod === 'PM') && (
                  <div className="pt-2 grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">From (EST)</Label>
                      <Select value={timeFrom} onValueChange={setTimeFrom}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-[240px]">
                          {TIME_SLOTS.map((slot) => (
                            <SelectItem key={slot} value={slot}>{slot} ET</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">To (EST)</Label>
                      <Select value={timeTo} onValueChange={setTimeTo}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-[240px]">
                          {TIME_SLOTS.map((slot) => (
                            <SelectItem key={slot} value={slot}>{slot} ET</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Type of leave <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                {LEAVE_TYPES.map((t) => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={selectedTypes.includes(t)}
                      onCheckedChange={(v) => toggleType(t, v === true)}
                    />
                    <span className="text-sm">{t}</span>
                  </label>
                ))}
                <div className="flex items-center gap-2 md:col-span-2">
                  <Checkbox checked={otherChecked} onCheckedChange={(v) => setOtherChecked(v === true)} />
                  <span className="text-sm">Other:</span>
                  <Input
                    value={otherText}
                    onChange={(e) => setOtherText(e.target.value)}
                    disabled={!otherChecked}
                    placeholder="Please specify"
                    className="flex-1 h-8"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Compensation <span className="text-destructive">*</span></Label>
              <div className="flex flex-wrap items-center gap-4 pt-1">
                {(['Paid', 'Unpaid', 'Time compensation'] as const).map((c) => (
                  <label key={c} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={compensationType === c}
                      onCheckedChange={(v) => setCompensationType(v === true ? c : '')}
                    />
                    <span className="text-sm">{c}</span>
                  </label>
                ))}
              </div>
              {compensationType === 'Time compensation' && (
                <Textarea
                  value={compensationNote}
                  onChange={(e) => setCompensationNote(e.target.value)}
                  placeholder="Add a comment about the time compensation arrangement"
                  rows={2}
                  className="mt-2"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="leave-notes">Additional notes</Label>
              <Textarea
                id="leave-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional context for your leave request"
                rows={3}
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Submit leave application
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My leave applications</CardTitle>
          <CardDescription>History of submitted requests.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leave applications submitted yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Compensation</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{format(new Date(r.leave_date + 'T00:00:00'), 'MMM/dd/yyyy')}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.time_period}
                      {r.specific_time && r.time_period !== 'All day' && (
                        <div className="text-xs text-muted-foreground">{r.specific_time} ET</div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs whitespace-normal text-sm">{r.leave_type}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {r.compensation_type || '—'}
                      {r.compensation_note && (
                        <div className="text-xs text-muted-foreground italic mt-1 whitespace-normal">{r.compensation_note}</div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs whitespace-normal text-sm text-muted-foreground">
                      {r.notes || '—'}
                      {r.review_notes && (
                        <div className="text-xs italic mt-1">Admin: {r.review_notes}</div>
                      )}
                    </TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!submitting) setConfirmOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm leave application</DialogTitle>
            <DialogDescription>
              Please confirm the following before submitting your leave request.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={clientInformed}
                onCheckedChange={(v) => setClientInformed(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm leading-relaxed">
                I have already informed the client about this leave, and it has been approved by them.
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="button" onClick={performSubmit} disabled={!clientInformed || submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm & submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
