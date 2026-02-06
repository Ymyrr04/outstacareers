import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Copy, Check } from 'lucide-react';

interface HiredAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicant: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    location: string;
    job_title: string;
  } | null;
  onComplete: () => void;
}

interface ClientOption {
  id: string;
  company_name: string;
}

export const HiredAssignmentDialog = ({ open, onOpenChange, applicant, onComplete }: HiredAssignmentDialogProps) => {
  const { toast } = useToast();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [form, setForm] = useState({
    client_id: '',
    preferred_name: '',
    start_date_time: '',
    rate_offered: '',
    country: '',
    phone: '',
    email: '',
    work_hours: '',
    client_rate: '',
    agreed_work_hours: '',
    is_replacement: 'new',
    hourly_rate: '',
    hours_per_week: '',
  });

  // Reset form when applicant changes
  useEffect(() => {
    if (applicant && open) {
      setForm(prev => ({
        ...prev,
        preferred_name: applicant.full_name.split(' ')[0],
        country: applicant.location || '',
        phone: applicant.phone || '',
        email: applicant.email || '',
      }));
      fetchClients();
    }
  }, [applicant, open]);

  const fetchClients = async () => {
    setLoadingClients(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, company_name')
        .order('company_name');
      if (error) throw error;
      setClients(data || []);
    } catch (err) {
      console.error('Error fetching clients:', err);
    } finally {
      setLoadingClients(false);
    }
  };

  const selectedClient = clients.find(c => c.id === form.client_id);

  const onboardingNote = useMemo(() => {
    if (!applicant) return '';
    return [
      `Full Name: ${applicant.full_name}`,
      `Preferred Name: ${form.preferred_name}`,
      `Start Date and Time: ${form.start_date_time ? form.start_date_time.replace('T', ' ') : ''}`,
      `Rate Offered: ${form.rate_offered}`,
      `Country of Residence: ${form.country}`,
      `Active Phone number: ${form.phone}`,
      `Email Address: ${form.email}`,
      `Client (Company name): ${selectedClient?.company_name || ''}`,
      `Work hours: ${form.work_hours}`,
      `Client Rate: ${form.client_rate}`,
      `Agreed work hours: ${form.agreed_work_hours}`,
      `New / Replacement: ${form.is_replacement === 'new' ? 'New' : 'Replacement'}`,
    ].join('\n');
  }, [applicant, form, selectedClient]);

  const handleCopyNote = async () => {
    try {
      await navigator.clipboard.writeText(onboardingNote);
      setCopiedField('note');
      setTimeout(() => setCopiedField(null), 2000);
      toast({ title: 'Copied!', description: 'Onboarding note copied to clipboard' });
    } catch {
      toast({ title: 'Error', description: 'Failed to copy', variant: 'destructive' });
    }
  };

  const handleSubmit = async () => {
    if (!applicant || !form.client_id) {
      toast({ title: 'Error', description: 'Please select a client', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      // Create contractor assignment
      const { error: assignError } = await supabase.from('contractor_assignments').insert({
        applicant_id: applicant.id,
        client_id: form.client_id,
        job_title: applicant.job_title,
        hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : (form.rate_offered ? parseFloat(form.rate_offered) : null),
        start_date: form.start_date_time ? form.start_date_time.split('T')[0] : null,
        hours_per_week: form.hours_per_week ? parseFloat(form.hours_per_week) : (form.agreed_work_hours ? parseFloat(form.agreed_work_hours) : null),
        is_replacement: form.is_replacement === 'replacement',
        status: 'active',
        country: form.country || null,
        contact_number: form.phone || null,
        source: null,
      });

      if (assignError) throw assignError;

      toast({ title: 'Success', description: `Assigned to ${selectedClient?.company_name}` });
      onOpenChange(false);
      onComplete();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!applicant) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Hired Candidate — {applicant.full_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Client selection */}
          <div className="space-y-2">
            <Label>Client (Company) *</Label>
            {loadingClients ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading clients...
              </div>
            ) : (
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Onboarding fields - 2 columns */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Full Name</Label>
              <Input value={applicant.full_name} readOnly className="bg-muted/50 text-sm h-8" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Preferred Name</Label>
              <Input
                value={form.preferred_name}
                onChange={e => setForm({ ...form, preferred_name: e.target.value })}
                className="text-sm h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Start Date</Label>
              <Input
                type="date"
                value={form.start_date_time.split('T')[0] || form.start_date_time}
                onChange={e => {
                  const time = form.start_date_time.includes('T') ? form.start_date_time.split('T')[1] : '';
                  setForm({ ...form, start_date_time: time ? `${e.target.value}T${time}` : e.target.value });
                }}
                className="text-sm h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Start Time</Label>
              <Input
                type="time"
                value={form.start_date_time.includes('T') ? form.start_date_time.split('T')[1] : ''}
                onChange={e => {
                  const date = form.start_date_time.split('T')[0] || '';
                  setForm({ ...form, start_date_time: date ? `${date}T${e.target.value}` : e.target.value });
                }}
                className="text-sm h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Rate Offered</Label>
              <Input
                value={form.rate_offered}
                onChange={e => setForm({ ...form, rate_offered: e.target.value })}
                placeholder="e.g. $5/hr"
                className="text-sm h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Country of Residence</Label>
              <Input
                value={form.country}
                onChange={e => setForm({ ...form, country: e.target.value })}
                className="text-sm h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Active Phone Number</Label>
              <Input
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                className="text-sm h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email Address</Label>
              <Input
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="text-sm h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Work Hours</Label>
              <Input
                value={form.work_hours}
                onChange={e => setForm({ ...form, work_hours: e.target.value })}
                placeholder="e.g. 9am-6pm EST"
                className="text-sm h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Client Rate</Label>
              <Input
                value={form.client_rate}
                onChange={e => setForm({ ...form, client_rate: e.target.value })}
                placeholder="e.g. $10/hr"
                className="text-sm h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Agreed Work Hours</Label>
              <Input
                value={form.agreed_work_hours}
                onChange={e => setForm({ ...form, agreed_work_hours: e.target.value })}
                placeholder="e.g. 40"
                className="text-sm h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">New / Replacement</Label>
              <Select value={form.is_replacement} onValueChange={v => setForm({ ...form, is_replacement: v })}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="replacement">Replacement</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Copyable onboarding note */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Onboarding Note (easy copy)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={handleCopyNote}
              >
                {copiedField === 'note' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedField === 'note' ? 'Copied!' : 'Copy All'}
              </Button>
            </div>
            <Textarea
              readOnly
              value={onboardingNote}
              className="bg-muted/50 text-xs font-mono leading-relaxed"
              rows={12}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Skip Assignment
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !form.client_id}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Assign to Client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
