import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Building2, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface ContractorData {
  id: string;
  client_id: string;
  applicant_id: string;
  job_title: string | null;
  hourly_rate: number | null;
  client_rate: number | null;
  hours_per_week: number | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  notes: string | null;
  contact_number: string | null;
  emergency_number: string | null;
  timesheet_link: string | null;
  is_replacement: boolean | null;
  country: string | null;
  source: string | null;
  applicant: {
    full_name: string;
    email: string;
    location: string;
    phone: string | null;
  } | null;
  client: {
    company_name: string;
    industry: string | null;
  } | null;
}

interface EditContractorDialogProps {
  contractor: ContractorData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export const EditContractorDialog = ({ contractor, open, onOpenChange, onUpdated }: EditContractorDialogProps) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [clients, setClients] = useState<{ id: string; company_name: string }[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  
  const [formData, setFormData] = useState({
    // Applicant fields
    full_name: '',
    email: '',
    // Contractor assignment fields
    client_id: '',
    status: 'active',
    job_title: '',
    hourly_rate: '',
    hours_per_week: '',
    start_date: '',
    end_date: '',
    contact_number: '',
    emergency_number: '',
    timesheet_link: '',
    is_replacement: false,
    country: '',
    source: '',
    notes: '',
  });

  // Fetch clients list
  useEffect(() => {
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
        console.error('Failed to fetch clients:', err);
      } finally {
        setLoadingClients(false);
      }
    };

    if (open) {
      fetchClients();
    }
  }, [open]);

  useEffect(() => {
    if (contractor) {
      setFormData({
        full_name: contractor.applicant?.full_name || '',
        email: contractor.applicant?.email || '',
        client_id: contractor.client_id || '',
        status: contractor.status || 'active',
        job_title: contractor.job_title || '',
        hourly_rate: contractor.hourly_rate?.toString() || '',
        hours_per_week: contractor.hours_per_week?.toString() || '',
        start_date: contractor.start_date || '',
        end_date: contractor.end_date || '',
        contact_number: contractor.contact_number || '',
        emergency_number: contractor.emergency_number || '',
        timesheet_link: contractor.timesheet_link || '',
        is_replacement: contractor.is_replacement || false,
        country: contractor.country || '',
        source: contractor.source || '',
        notes: contractor.notes || '',
      });
    }
  }, [contractor]);

  const handleSave = async () => {
    if (!contractor) return;
    
    setSaving(true);
    try {
      // Update applicant info (name/email)
      if (contractor.applicant_id) {
        const { error: applicantError } = await supabase
          .from('applicants_prescreen')
          .update({
            full_name: formData.full_name,
            email: formData.email,
          })
          .eq('id', contractor.applicant_id);

        if (applicantError) throw applicantError;
      }

      // Update contractor assignment
      const { error } = await supabase
        .from('contractor_assignments')
        .update({
          client_id: formData.client_id,
          status: formData.status,
          job_title: formData.job_title || null,
          hourly_rate: formData.hourly_rate ? parseFloat(formData.hourly_rate) : null,
          hours_per_week: formData.hours_per_week ? parseFloat(formData.hours_per_week) : null,
          start_date: formData.start_date || null,
          end_date: formData.end_date || null,
          contact_number: formData.contact_number || null,
          emergency_number: formData.emergency_number || null,
          timesheet_link: formData.timesheet_link || null,
          is_replacement: formData.is_replacement,
          country: formData.country || null,
          source: formData.source || null,
          notes: formData.notes || null,
        })
        .eq('id', contractor.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Contractor updated successfully',
      });
      
      onUpdated();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to update contractor: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!contractor) return;
    
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('contractor_assignments')
        .delete()
        .eq('id', contractor.id);

      if (error) throw error;

      toast({
        title: 'Contractor Deleted',
        description: `${contractor.applicant?.full_name || 'Contractor'} assignment has been deleted`,
      });
      
      onUpdated();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to delete contractor: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Contractor</DialogTitle>
          <DialogDescription>
            {contractor?.applicant?.full_name} - {contractor?.client?.company_name}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Name */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="full_name" className="text-right">Name</Label>
            <Input
              id="full_name"
              value={formData.full_name}
              onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
              className="col-span-3"
            />
          </div>

          {/* Email */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="email" className="text-right">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              className="col-span-3"
            />
          </div>

          {/* Client */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="client" className="text-right">Client</Label>
            <Select 
              value={formData.client_id} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, client_id: value }))}
              disabled={loadingClients}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder={loadingClients ? "Loading clients..." : "Select client"}>
                  {loadingClients ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Building2 className="w-3 h-3" />
                      {clients.find(c => c.id === formData.client_id)?.company_name || "Select client"}
                    </span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {clients.map(client => (
                  <SelectItem key={client.id} value={client.id}>
                    <span className="flex items-center gap-2">
                      <Building2 className="w-3 h-3" />
                      {client.company_name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="status" className="text-right">Status</Label>
            <Select value={formData.status} onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}>
              <SelectTrigger className="col-span-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="scheduled">Scheduled to Start</SelectItem>
                <SelectItem value="rendering">Rendering</SelectItem>
                <SelectItem value="resigned">Resigned</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Position */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="job_title" className="text-right">Position</Label>
            <Input
              id="job_title"
              value={formData.job_title}
              onChange={(e) => setFormData(prev => ({ ...prev, job_title: e.target.value }))}
              className="col-span-3"
            />
          </div>

          {/* Rate & Hours */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="hourly_rate" className="text-right">Hourly Rate ($)</Label>
            <Input
              id="hourly_rate"
              type="number"
              step="0.01"
              value={formData.hourly_rate}
              onChange={(e) => setFormData(prev => ({ ...prev, hourly_rate: e.target.value }))}
              className="col-span-1"
            />
            <Label htmlFor="hours_per_week" className="text-right">Hours/Week</Label>
            <Input
              id="hours_per_week"
              type="number"
              value={formData.hours_per_week}
              onChange={(e) => setFormData(prev => ({ ...prev, hours_per_week: e.target.value }))}
              className="col-span-1"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="start_date" className="text-right">Start Date</Label>
            <Input
              id="start_date"
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
              className="col-span-1"
            />
            <Label htmlFor="end_date" className="text-right">End Date</Label>
            <Input
              id="end_date"
              type="date"
              value={formData.end_date}
              onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
              className="col-span-1"
            />
          </div>

          {/* Contact Numbers */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="contact_number" className="text-right">Contact Number</Label>
            <Input
              id="contact_number"
              value={formData.contact_number}
              onChange={(e) => setFormData(prev => ({ ...prev, contact_number: e.target.value }))}
              className="col-span-3"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="emergency_number" className="text-right">Emergency Number</Label>
            <Input
              id="emergency_number"
              value={formData.emergency_number}
              onChange={(e) => setFormData(prev => ({ ...prev, emergency_number: e.target.value }))}
              className="col-span-3"
            />
          </div>

          {/* Timesheet Link */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="timesheet_link" className="text-right">Timesheet Link</Label>
            <Input
              id="timesheet_link"
              type="url"
              value={formData.timesheet_link}
              onChange={(e) => setFormData(prev => ({ ...prev, timesheet_link: e.target.value }))}
              className="col-span-3"
              placeholder="https://..."
            />
          </div>

          {/* Country & Source */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="country" className="text-right">Country</Label>
            <Input
              id="country"
              value={formData.country}
              onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
              className="col-span-3"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="source" className="text-right">Source</Label>
            <Input
              id="source"
              value={formData.source}
              onChange={(e) => setFormData(prev => ({ ...prev, source: e.target.value }))}
              className="col-span-3"
            />
          </div>

          {/* Type Toggle */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="is_replacement" className="text-right">Type</Label>
            <div className="col-span-3 flex items-center gap-3">
              <span className={!formData.is_replacement ? 'font-medium' : 'text-muted-foreground'}>New</span>
              <Switch
                id="is_replacement"
                checked={formData.is_replacement}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_replacement: checked }))}
              />
              <span className={formData.is_replacement ? 'font-medium' : 'text-muted-foreground'}>Replacement</span>
            </div>
          </div>

          {/* Notes */}
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="notes" className="text-right pt-2">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              className="col-span-3"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={saving || deleting}>
                {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Contractor Assignment?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the contractor assignment for {contractor?.applicant?.full_name}. 
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || deleting}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || deleting}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
