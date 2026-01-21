import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useHiringRequests, type PipelineStage, type Priority, type ClientStatus, PIPELINE_STAGES } from '@/hooks/useHiringRequests';
import { Loader2, Plus } from 'lucide-react';
import { AddClientDialog } from './AddClientDialog';

interface Client {
  id: string;
  company_name: string;
  industry: string | null;
}

interface AddHiringRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStage?: PipelineStage;
  onCreated?: () => void;
}

const INDUSTRIES = [
  'Healthcare',
  'Legal',
  'E-Commerce',
  'Financial',
  'Agriculture - Supply Chain',
  'Marketing and Advertising',
  'Consulting',
  'Real Estate',
  'Technology',
];

export const AddHiringRequestDialog = ({ 
  open, 
  onOpenChange, 
  defaultStage = 'backlog',
  onCreated 
}: AddHiringRequestDialogProps) => {
  const { createRequest } = useHiringRequests();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);

  const [formData, setFormData] = useState({
    client_id: '',
    job_title: '',
    priority: 'high' as Priority,
    industry: '',
    client_status: 'new' as ClientStatus,
    pipeline_stage: defaultStage,
    source: '',
    start_date: '',
    target_end_date: '',
    notes: '',
  });

  useEffect(() => {
    if (open) {
      setFormData(prev => ({ ...prev, pipeline_stage: defaultStage }));
      fetchClients();
    }
  }, [open, defaultStage]);

  const fetchClients = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('clients')
      .select('id, company_name, industry')
      .order('company_name');
    
    setClients(data || []);
    setLoading(false);
  };

  const handleClientChange = (clientId: string) => {
    if (clientId === '__new__') {
      setShowAddClient(true);
      return;
    }
    const client = clients.find(c => c.id === clientId);
    setFormData(prev => ({
      ...prev,
      client_id: clientId,
      industry: client?.industry || prev.industry,
    }));
  };

  const handleClientAdded = async () => {
    // Refresh clients list and select the newest one
    const { data } = await supabase
      .from('clients')
      .select('id, company_name, industry')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (data && data[0]) {
      await fetchClients();
      setFormData(prev => ({
        ...prev,
        client_id: data[0].id,
        industry: data[0].industry || prev.industry,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.job_title.trim()) {
      return;
    }

    setSaving(true);
    const success = await createRequest({
      client_id: formData.client_id || null,
      job_title: formData.job_title.trim(),
      priority: formData.priority,
      industry: formData.industry || null,
      client_status: formData.client_status,
      pipeline_stage: formData.pipeline_stage,
      source: formData.source.trim() || null,
      start_date: formData.start_date || null,
      target_end_date: formData.target_end_date || null,
      notes: formData.notes.trim() || null,
    });

    setSaving(false);

    if (success) {
      onOpenChange(false);
      onCreated?.();
      // Reset form
      setFormData({
        client_id: '',
        job_title: '',
        priority: 'high',
        industry: '',
        client_status: 'new',
        pipeline_stage: defaultStage,
        source: '',
        start_date: '',
        target_end_date: '',
        notes: '',
      });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Hiring Request</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Client */}
              <div className="col-span-2">
                <Label>Client</Label>
                <Select 
                  value={formData.client_id} 
                  onValueChange={handleClientChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a client..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__new__" className="text-primary font-medium">
                      <span className="flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        Add New Client
                      </span>
                    </SelectItem>
                    {clients.length > 0 && (
                      <div className="border-t my-1" />
                    )}
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

            {/* Job Title */}
            <div className="col-span-2">
              <Label>Job Title *</Label>
              <Input
                value={formData.job_title}
                onChange={(e) => setFormData(prev => ({ ...prev, job_title: e.target.value }))}
                placeholder="e.g., Billing CSR, Senior Accountant"
                required
              />
            </div>

            {/* Priority */}
            <div>
              <Label>Priority</Label>
              <Select 
                value={formData.priority} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, priority: v as Priority }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Client Status */}
            <div>
              <Label>Client Status</Label>
              <Select 
                value={formData.client_status} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, client_status: v as ClientStatus }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="existing">Existing</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Industry */}
            <div>
              <Label>Industry</Label>
              <Select 
                value={formData.industry} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, industry: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map(industry => (
                    <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Pipeline Stage */}
            <div>
              <Label>Stage</Label>
              <Select 
                value={formData.pipeline_stage} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, pipeline_stage: v as PipelineStage }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIPELINE_STAGES.map(stage => (
                    <SelectItem key={stage.id} value={stage.id}>{stage.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Source */}
            <div className="col-span-2">
              <Label>Source / Referral</Label>
              <Input
                value={formData.source}
                onChange={(e) => setFormData(prev => ({ ...prev, source: e.target.value }))}
                placeholder="e.g., BNI Revival, Adam W, LinkedIn"
              />
            </div>

            {/* Date Range */}
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
              />
            </div>
            <div>
              <Label>Target End Date</Label>
              <Input
                type="date"
                value={formData.target_end_date}
                onChange={(e) => setFormData(prev => ({ ...prev, target_end_date: e.target.value }))}
              />
            </div>

            {/* Notes */}
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional details..."
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !formData.job_title.trim()}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Request
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    <AddClientDialog
      open={showAddClient}
      onOpenChange={setShowAddClient}
      onClientAdded={handleClientAdded}
    />
  </>
  );
};
