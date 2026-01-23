import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Building2, Users, Search, Plus, Loader2, Globe, Download, Upload, TrendingUp, UserPlus, Briefcase, ChevronDown } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AddClientDialog } from './AddClientDialog';
import { ClientDetailPanel } from './ClientDetailPanel';
import { ClientImportDialog } from './ClientImportDialog';

export interface Client {
  id: string;
  company_name: string;
  industry: string | null;
  website: string | null;
  address: string | null;
  notes: string | null;
  leads_from: string | null;
  company_links: string | null;
  yearly_increase: boolean;
  contractor_count: number;
  is_hiring: boolean;
  created_at: string;
  updated_at: string;
  contact_count?: number;
}

export interface ClientContact {
  id: string;
  client_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
}

export interface ContractorAssignment {
  id: string;
  client_id: string;
  applicant_id: string;
  job_title: string | null;
  hourly_rate: number | null;
  start_date: string | null;
  end_date: string | null;
  status: 'active' | 'completed' | 'paused' | 'terminated';
  notes: string | null;
  created_at: string;
  applicant?: {
    full_name: string;
    email: string;
    location: string;
  };
}

export interface ClientCommunication {
  id: string;
  client_id: string;
  contact_id: string | null;
  communication_type: 'email' | 'call' | 'meeting' | 'note';
  subject: string | null;
  content: string | null;
  communication_date: string;
  created_at: string;
  contact?: { full_name: string } | null;
}

export const ClientsDashboard = () => {
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [hiringRequests, setHiringRequests] = useState<{ client_id: string | null; client_status: string; job_title: string; pipeline_stage: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'lost' | 'newHiring' | 'existingHiring'>('all');
  const [lostYearFilter, setLostYearFilter] = useState<number>(2025);

  const fetchClients = useCallback(async () => {
    try {
      // Fetch clients, counts, and hiring requests in parallel
      const [clientsRes, contactCountsRes, contractorCountsRes, hiringRequestsRes] = await Promise.all([
        supabase.from('clients').select('*').order('company_name', { ascending: true }),
        supabase.from('client_contacts').select('client_id'),
        supabase.from('contractor_assignments').select('client_id, status'),
        supabase.from('client_hiring_requests').select('client_id, client_status, job_title, pipeline_stage, created_at'),
      ]);

      if (clientsRes.error) throw clientsRes.error;

      // Build counts maps
      const contactMap: Record<string, number> = {};
      const contractorMap: Record<string, number> = {};

      contactCountsRes.data?.forEach(c => {
        contactMap[c.client_id] = (contactMap[c.client_id] || 0) + 1;
      });

      // Count only active contractors (exclude scheduled, terminated, resigned, rendering)
      contractorCountsRes.data?.forEach(c => {
        const status = c.status?.toLowerCase();
        if (status === 'active') {
          contractorMap[c.client_id] = (contractorMap[c.client_id] || 0) + 1;
        }
      });

      // Enrich clients with actual contractor counts
      const enrichedClients = (clientsRes.data || []).map(client => ({
        ...client,
        contact_count: contactMap[client.id] || 0,
        contractor_count: contractorMap[client.id] || 0,
      }));

      setClients(enrichedClients);
      setHiringRequests(hiringRequestsRes.data || []);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to fetch clients: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    fetchClients();
  }, [fetchClients]);

  // Real-time subscriptions for auto-refresh
  useEffect(() => {
    const clientsChannel = supabase
      .channel('clients-dashboard-clients')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clients' },
        () => fetchClients()
      )
      .subscribe();

    const contractorsChannel = supabase
      .channel('clients-dashboard-contractors')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contractor_assignments' },
        () => fetchClients()
      )
      .subscribe();

    const hiringRequestsChannel = supabase
      .channel('clients-dashboard-hiring-requests')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'client_hiring_requests' },
        () => fetchClients()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(clientsChannel);
      supabase.removeChannel(contractorsChannel);
      supabase.removeChannel(hiringRequestsChannel);
    };
  }, [fetchClients]);

  // Pipeline stages that count as "actively hiring"
  const ACTIVE_HIRING_STAGES = ['sourcing', 'pitch', 'scheduled_interview'];
  
  // Lost stages in the pipeline
  const LOST_STAGES = ['lost_client', 'lost_outsta'];
  
  // Get unique client IDs that have hiring requests in active stages
  const clientsWithActiveHiringRequests = new Set(
    hiringRequests
      .filter(req => req.client_id && ACTIVE_HIRING_STAGES.includes(req.pipeline_stage))
      .map(req => req.client_id!)
  );
  
  // Clients lost = clients with hiring requests in lost stages, filtered by year
  const clientsInLostStages = new Set(
    hiringRequests
      .filter(req => 
        req.client_id && 
        LOST_STAGES.includes(req.pipeline_stage) &&
        new Date(req.created_at).getFullYear() === lostYearFilter
      )
      .map(req => req.client_id!)
  );
  
  const filteredClients = clients.filter(client => {
    const matchesSearch = !searchTerm || 
      client.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.industry?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.leads_from?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Apply status filter using pipeline-based hiring logic
    const hasActiveContractors = (client.contractor_count || 0) > 0;
    const isActivelyHiring = clientsWithActiveHiringRequests.has(client.id);
    const isInLostStage = clientsInLostStages.has(client.id);
    const matchesStatusFilter = 
      statusFilter === 'all' ||
      (statusFilter === 'active' && hasActiveContractors) ||
      (statusFilter === 'lost' && isInLostStage) ||
      (statusFilter === 'newHiring' && isActivelyHiring && !hasActiveContractors) ||
      (statusFilter === 'existingHiring' && isActivelyHiring && hasActiveContractors);
    
    return matchesSearch && matchesStatusFilter;
  });

  // Summary stats
  const totalActiveContractors = clients.reduce((sum, c) => sum + (c.contractor_count || 0), 0);
  const totalActiveClients = clients.filter(c => (c.contractor_count || 0) > 0).length;
  
  // Count hiring clients based on having requests in active pipeline stages
  const newClientsHiring = clients.filter(c => 
    clientsWithActiveHiringRequests.has(c.id) && (c.contractor_count || 0) === 0
  ).length;
  const existingClientsHiring = clients.filter(c => 
    clientsWithActiveHiringRequests.has(c.id) && (c.contractor_count || 0) > 0
  ).length;
  
  const clientsLost = clientsInLostStages.size;
  
  // Count open hiring requests per client (in active stages only)
  const hiringRequestCountByClient = hiringRequests
    .filter(req => ACTIVE_HIRING_STAGES.includes(req.pipeline_stage))
    .reduce((acc, req) => {
      if (req.client_id) {
        acc[req.client_id] = (acc[req.client_id] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
  
  // Total open roles for existing clients (clients with active contractors and requests in active stages)
  const existingClientsOpenRoles = clients
    .filter(c => clientsWithActiveHiringRequests.has(c.id) && (c.contractor_count || 0) > 0)
    .reduce((sum, c) => sum + (hiringRequestCountByClient[c.id] || 0), 0);

  // Export clients to CSV
  const handleExport = async () => {
    try {
      // Fetch all clients with contacts for export
      const { data: clientsData } = await supabase
        .from('clients')
        .select('*')
        .order('company_name');

      const { data: contactsData } = await supabase
        .from('client_contacts')
        .select('*')
        .eq('is_primary', true);

      // Build contacts map
      const contactsMap: Record<string, typeof contactsData[0]> = {};
      contactsData?.forEach(c => {
        if (!contactsMap[c.client_id]) {
          contactsMap[c.client_id] = c;
        }
      });

      // Build CSV - matching the required fields
      const headers = [
        'Business Name',
        'First Name',
        'Last Name',
        'Email Address',
        'Contact Information',
        'No. of Contractors',
        'Leads from',
        'Add links about the company to be shared with candidate(s)',
        '4% Yearly increase',
        'Industry'
      ];

      const rows = (clientsData || []).map(client => {
        const contact = contactsMap[client.id];
        return [
          `"${(client.company_name || '').replace(/"/g, '""')}"`,
          `"${(contact?.first_name || '').replace(/"/g, '""')}"`,
          `"${(contact?.last_name || '').replace(/"/g, '""')}"`,
          `"${(contact?.email || '').replace(/"/g, '""')}"`,
          `"${(contact?.phone || '').replace(/"/g, '""')}"`,
          client.contractor_count || 0,
          `"${(client.leads_from || '').replace(/"/g, '""')}"`,
          `"${(client.company_links || '').replace(/"/g, '""')}"`,
          client.yearly_increase ? 'Yes' : 'No',
          `"${(client.industry || '').replace(/"/g, '""')}"`
        ].join(',');
      });

      const csvContent = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clients_export_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: 'Success',
        description: `Exported ${clientsData?.length || 0} clients`,
      });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to export clients: ' + err.message,
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Loading clients...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card 
          className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === 'active' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalActiveClients}</p>
                <p className="text-sm text-muted-foreground">Total Active Clients</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <Users className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalActiveContractors}</p>
                <p className="text-sm text-muted-foreground">Active Contractors</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === 'lost' ? 'ring-2 ring-red-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'lost' ? 'all' : 'lost')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <Building2 className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold">{clientsLost}</p>
                  <Select
                    value={lostYearFilter.toString()}
                    onValueChange={(v) => setLostYearFilter(parseInt(v))}
                  >
                    <SelectTrigger 
                      className="h-7 w-[80px] text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent onClick={(e) => e.stopPropagation()}>
                      <SelectItem value="2024">2024</SelectItem>
                      <SelectItem value="2025">2025</SelectItem>
                      <SelectItem value="2026">2026</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-sm text-muted-foreground">Clients Lost ({lostYearFilter})</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === 'newHiring' ? 'ring-2 ring-amber-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'newHiring' ? 'all' : 'newHiring')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <UserPlus className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{newClientsHiring}</p>
                <p className="text-sm text-muted-foreground">New Client (Hiring)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === 'existingHiring' ? 'ring-2 ring-purple-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'existingHiring' ? 'all' : 'existingHiring')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Building2 className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold">{existingClientsHiring}</p>
                  {existingClientsOpenRoles > 0 && (
                    <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                      {existingClientsOpenRoles} {existingClientsOpenRoles === 1 ? 'role' : 'roles'}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">Existing Client (Hiring)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Header with Search and Add */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={clients.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Client
          </Button>
        </div>
      </div>

      {/* Client List */}
      {filteredClients.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {clients.length === 0 
                ? 'No clients yet. Add your first client!' 
                : 'No clients match your filters.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredClients.map(client => (
            <Card 
              key={client.id} 
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => setSelectedClient(client)}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{client.company_name}</h3>
                        {client.yearly_increase && (
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                            <TrendingUp className="w-3 h-3 mr-1" />
                            4% Increase
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        {client.industry && <span>{client.industry}</span>}
                        {client.leads_from && <span>From: {client.leads_from}</span>}
                        {client.website && (
                          <span className="flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            {client.website.replace(/^https?:\/\//, '')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    {hiringRequestCountByClient[client.id] > 0 && (
                      <Popover>
                        <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <div className="text-center cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors">
                            <p className="font-semibold text-purple-600">{hiringRequestCountByClient[client.id]}</p>
                            <p className="text-muted-foreground text-xs">Open Roles</p>
                          </div>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-3" onClick={(e) => e.stopPropagation()}>
                          <div className="space-y-2">
                            <h4 className="font-semibold text-sm flex items-center gap-2">
                              <Briefcase className="w-4 h-4 text-purple-600" />
                              Open Roles
                            </h4>
                            <ul className="space-y-1">
                              {hiringRequests
                                .filter(r => r.client_id === client.id)
                                .map((role, idx) => (
                                  <li key={idx} className="text-sm flex items-center gap-2 py-1 border-b border-border/50 last:border-0">
                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                    {role.job_title}
                                  </li>
                                ))}
                            </ul>
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                    <div className="text-center">
                      <p className="font-semibold">{client.contact_count}</p>
                      <p className="text-muted-foreground text-xs">Contacts</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold">{client.contractor_count}</p>
                      <p className="text-muted-foreground text-xs">Contractors</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Client Dialog */}
      <AddClientDialog 
        open={addDialogOpen} 
        onOpenChange={setAddDialogOpen}
        onClientAdded={fetchClients}
      />

      {/* Client Detail Panel */}
      {selectedClient && (
        <ClientDetailPanel
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          onUpdate={fetchClients}
        />
      )}

      {/* Import Dialog */}
      <ClientImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onClientsImported={fetchClients}
      />
    </div>
  );
};