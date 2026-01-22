import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WysiwygEditor } from '@/components/WysiwygEditor';
import { useHiringRequests, type Priority, type ClientStatus } from '@/hooks/useHiringRequests';
import { usePipelineStages } from '@/hooks/usePipelineStages';
import { Loader2, Plus } from 'lucide-react';
import { getAdminDisplayName } from '@/lib/adminDisplayNames';
import { AddClientDialog } from './AddClientDialog';

interface Client {
  id: string;
  company_name: string;
  industry: string | null;
  leads_from: string | null;
}

interface ContractorJobTitle {
  job_title: string | null;
}

interface AdminUser {
  user_id: string;
  email: string;
}

interface AddHiringRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStage?: string;
  onCreated?: () => void;
}

const DEFAULT_INDUSTRIES = [
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
  const { stages } = usePipelineStages();
  const [clients, setClients] = useState<Client[]>([]);
  const [industries, setIndustries] = useState<string[]>(DEFAULT_INDUSTRIES);
  const [sources, setSources] = useState<string[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
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
    assigned_admin_id: '',
  });

  useEffect(() => {
    if (open) {
      setFormData(prev => ({ ...prev, pipeline_stage: defaultStage }));
      fetchClients();
      fetchAdminUsers();
    }
  }, [open, defaultStage]);

  const fetchAdminUsers = async () => {
    const { data, error } = await supabase.functions.invoke('get-admin-users');
    if (!error && data?.adminUsers) {
      setAdminUsers(data.adminUsers);
    }
  };

  const fetchClients = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('clients')
      .select('id, company_name, industry, leads_from')
      .order('company_name');
    
    setClients(data || []);
    
    // Extract unique industries and sources from clients
    if (data) {
      const clientIndustries = data
        .map(c => c.industry)
        .filter((ind): ind is string => !!ind && ind.trim() !== '');
      const allIndustries = [...new Set([...DEFAULT_INDUSTRIES, ...clientIndustries])];
      setIndustries(allIndustries.sort());

      // Extract unique sources/referrals
      const clientSources = data
        .map(c => c.leads_from)
        .filter((src): src is string => !!src && src.trim() !== '');
      const uniqueSources = [...new Set(clientSources)].sort();
      setSources(uniqueSources);
    }
    
    setLoading(false);
  };

  const handleClientChange = async (clientId: string) => {
    if (clientId === '__new__') {
      setShowAddClient(true);
      return;
    }
    const client = clients.find(c => c.id === clientId);
    
    // Check if client has existing contractors
    const { data: contractors } = await supabase
      .from('contractor_assignments')
      .select('job_title')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    
    const hasExistingContractors = contractors && contractors.length > 0;
    const existingJobTitles = contractors
      ?.map((c: ContractorJobTitle) => c.job_title)
      .filter((title): title is string => !!title) || [];
    
    setFormData(prev => ({
      ...prev,
      client_id: clientId,
      industry: client?.industry || prev.industry,
      // Auto-set to 'existing' if client has contractors
      client_status: hasExistingContractors ? 'existing' : prev.client_status,
      // Auto-fill source from client's leads_from
      source: client?.leads_from || prev.source,
      // Auto-fill first job title from existing contractors
      job_title: existingJobTitles[0] || prev.job_title,
    }));
  };

  const handleClientAdded = async () => {
    // Refresh clients list first
    const { data: allClients } = await supabase
      .from('clients')
      .select('id, company_name, industry, leads_from')
      .order('company_name');
    
    if (allClients) {
      setClients(allClients);
      
      // Extract unique industries and sources
      const clientIndustries = allClients
        .map(c => c.industry)
        .filter((ind): ind is string => !!ind && ind.trim() !== '');
      const allIndustries = [...new Set([...DEFAULT_INDUSTRIES, ...clientIndustries])];
      setIndustries(allIndustries.sort());

      const clientSources = allClients
        .map(c => c.leads_from)
        .filter((src): src is string => !!src && src.trim() !== '');
      setSources([...new Set(clientSources)].sort());
    }
    
    // Get the newest client and select it
    const { data: newestClient } = await supabase
      .from('clients')
      .select('id, company_name, industry, leads_from')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (newestClient) {
      setFormData(prev => ({
        ...prev,
        client_id: newestClient.id,
        industry: newestClient.industry || prev.industry,
        source: newestClient.leads_from || prev.source,
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
      assigned_admin_id: formData.assigned_admin_id || null,
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
        assigned_admin_id: '',
      });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Add Hiring Request</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto flex-1 pr-2">
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
                  <SelectItem value="medium">Medium</SelectItem>
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
                  <SelectItem value="returning">Returning</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Industry */}
            <div>
              <Label>Industry</Label>
              {formData.industry === '__custom__' || (formData.industry && !industries.includes(formData.industry)) ? (
                <div className="flex gap-2">
                  <Input
                    value={formData.industry === '__custom__' ? '' : formData.industry}
                    onChange={(e) => setFormData(prev => ({ ...prev, industry: e.target.value }))}
                    placeholder="Enter industry..."
                    autoFocus
                  />
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setFormData(prev => ({ ...prev, industry: '' }))}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Select 
                  value={formData.industry} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, industry: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {industries.map(industry => (
                      <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                    ))}
                    <SelectItem value="__custom__" className="text-primary font-medium">
                      <span className="flex items-center gap-1">
                        <Plus className="w-3 h-3" /> Add Other
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Pipeline Stage */}
            <div>
              <Label>Stage</Label>
              <Select 
                value={formData.pipeline_stage} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, pipeline_stage: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stages.map(stage => (
                    <SelectItem key={stage.id} value={stage.slug}>{stage.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Assignee */}
            <div>
              <Label>Assignee</Label>
              <Select 
                value={formData.assigned_admin_id} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, assigned_admin_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select admin..." />
                </SelectTrigger>
                <SelectContent>
                  {adminUsers.map(admin => (
                    <SelectItem key={admin.user_id} value={admin.user_id}>
                      {getAdminDisplayName(admin.email)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Source */}
            <div>
              <Label>Source / Referral</Label>
              {formData.source === '__custom__' || (formData.source && !sources.includes(formData.source)) ? (
                <div className="flex gap-2">
                  <Input
                    value={formData.source === '__custom__' ? '' : formData.source}
                    onChange={(e) => setFormData(prev => ({ ...prev, source: e.target.value }))}
                    placeholder="Enter source..."
                    className="flex-1"
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => setFormData(prev => ({ ...prev, source: '' }))}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Select
                  value={formData.source || '__none__'}
                  onValueChange={(value) => setFormData(prev => ({ 
                    ...prev, 
                    source: value === '__none__' ? '' : value 
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select source..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {sources.map(source => (
                      <SelectItem key={source} value={source}>{source}</SelectItem>
                    ))}
                    <SelectItem value="__custom__">
                      <span className="flex items-center gap-1">
                        <Plus className="w-3 h-3" /> Add Other
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
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

            {/* Job Description */}
            <div className="col-span-2">
              <Label>Job Description</Label>
              <WysiwygEditor
                value={formData.notes}
                onChange={(html) => setFormData(prev => ({ ...prev, notes: html }))}
                placeholder="Role details, requirements, responsibilities..."
                minHeight="100px"
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
