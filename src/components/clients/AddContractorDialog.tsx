import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Search } from 'lucide-react';

interface AddContractorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  onContractorAdded: () => void;
}

interface ApplicantOption {
  id: string;
  full_name: string;
  email: string;
  job_title: string;
}

export const AddContractorDialog = ({ open, onOpenChange, clientId, onContractorAdded }: AddContractorDialogProps) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applicants, setApplicants] = useState<ApplicantOption[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const [form, setForm] = useState({
    applicant_id: '',
    job_title: '',
    hourly_rate: '',
    client_rate: '',
    start_date: '',
    status: 'active',
    notes: '',
  });

  useEffect(() => {
    if (open) {
      fetchHiredApplicants();
    }
  }, [open]);

  const fetchHiredApplicants = async () => {
    setLoading(true);
    try {
      // Fetch applicants with "Hired" or "Bench" status who can be assigned
      const { data, error } = await supabase
        .from('applicants_prescreen')
        .select('id, full_name, email, job_title')
        .in('status', ['Hired', 'Bench'])
        .order('full_name');

      if (error) throw error;
      setApplicants(data || []);
    } catch (err) {
      console.error('Error fetching applicants:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredApplicants = applicants.filter(a => 
    a.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.applicant_id) {
      toast({
        title: 'Error',
        description: 'Please select a contractor',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('contractor_assignments').insert({
        client_id: clientId,
        applicant_id: form.applicant_id,
        job_title: form.job_title.trim() || null,
        hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null,
        client_rate: form.client_rate ? parseFloat(form.client_rate) : null,
        start_date: form.start_date || null,
        status: form.status,
        notes: form.notes.trim() || null,
        hired_via: 'manual_import',
      });

      if (error) throw error;

      toast({ title: 'Success', description: 'Contractor assigned successfully' });

      setForm({
        applicant_id: '',
        job_title: '',
        hourly_rate: '',
        client_rate: '',
        start_date: '',
        status: 'active',
        notes: '',
      });

      onOpenChange(false);
      onContractorAdded();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to assign contractor: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const selectedApplicant = applicants.find(a => a.id === form.applicant_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Contractor</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Select Contractor *</Label>
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading...
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search hired contractors..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select
                  value={form.applicant_id}
                  onValueChange={(v) => setForm({ ...form, applicant_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a contractor" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredApplicants.length === 0 ? (
                      <div className="py-2 px-3 text-sm text-muted-foreground">
                        No hired contractors found
                      </div>
                    ) : (
                      filteredApplicants.map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.full_name} - {a.job_title}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {selectedApplicant && (
                  <p className="text-sm text-muted-foreground">{selectedApplicant.email}</p>
                )}
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="job_title">Job Title/Role</Label>
            <Input
              id="job_title"
              value={form.job_title}
              onChange={(e) => setForm({ ...form, job_title: e.target.value })}
              placeholder="e.g. Virtual Assistant"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="hourly_rate">Hourly Rate ($)</Label>
              <Input
                id="hourly_rate"
                type="number"
                step="0.01"
                value={form.hourly_rate}
                onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client_rate">Client Rate ($)</Label>
              <Input
                id="client_rate"
                type="number"
                step="0.01"
                value={form.client_rate}
                onChange={(e) => setForm({ ...form, client_rate: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Additional notes..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Assign Contractor
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
