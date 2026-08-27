import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { INTERNAL_CLIENT_ID } from '@/lib/internalCompany';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Building2, Users, Search, Plus, Loader2, Globe, Download, Upload, TrendingUp, UserPlus, Briefcase, ChevronDown, Trash2, CheckSquare, Square } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AddClientDialog } from './AddClientDialog';
import { ClientDetailPanel } from './ClientDetailPanel';
import { ClientImportDialog } from './ClientImportDialog';
import { ClientInsightsPanel } from './ClientInsightsPanel';

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
  status: string;
  notes: string | null;
  timesheet_link: string | null;
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
  const [hiringRequests, setHiringRequests] = useState<{ id?: string; client_id: string | null; client_status: string; job_title: string; pipeline_stage: string; start_date: string | null; industry?: string | null; closed_at?: string | null }[]>([]);
  const [contractorData, setContractorData] = useState<{ client_id: string; start_date: string | null; status: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'lost' | 'newHiring' | 'existingHiring' | 'inactive'>('all');
  const [lostYearFilter, setLostYearFilter] = useState<number>(2026);
  const [addedYearFilter, setAddedYearFilter] = useState<number>(2026);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Auto-open client detail when ?clientId=... is present in URL
  useEffect(() => {
    const targetId = searchParams.get('clientId');
    if (!targetId || clients.length === 0) return;
    const match = clients.find(c => c.id === targetId);
    if (match) {
      setSelectedClient(match);
      const next = new URLSearchParams(searchParams);
      next.delete('clientId');
      setSearchParams(next, { replace: true });
    }
  }, [clients, searchParams, setSearchParams]);

  const fetchClients = useCallback(async () => {
    try {
      // Fetch clients, counts, and hiring requests in parallel (v2 - includes created_at for year filtering)
      const [clientsRes, contactCountsRes, contractorCountsRes, hiringRequestsRes] = await Promise.all([
        supabase.from('clients').select('*').order('company_name', { ascending: true }),
        supabase.from('client_contacts').select('client_id'),
        supabase.from('contractor_assignments').select('client_id, status, start_date'),
        supabase.from('client_hiring_requests').select('id, client_id, client_status, job_title, pipeline_stage, start_date, industry, closed_at'),
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

      // Enrich clients with actual contractor counts; exclude OutSta (internal team)
      const enrichedClients = (clientsRes.data || [])
        .filter(client => client.id !== INTERNAL_CLIENT_ID)
        .map(client => ({
          ...client,
          contact_count: contactMap[client.id] || 0,
          contractor_count: contractorMap[client.id] || 0,
        }));

      setClients(enrichedClients);
      setContractorData((contractorCountsRes.data || [])
        .filter(c => c.client_id !== INTERNAL_CLIENT_ID)
        .map(c => ({ client_id: c.client_id, start_date: c.start_date ?? null, status: c.status ?? null })));
      setHiringRequests((hiringRequestsRes.data || []).filter(r => r.client_id !== INTERNAL_CLIENT_ID));
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
  
  // Clients lost = clients with hiring requests in lost stages, filtered by year based on start_date
  // If start_date is empty, default to 2025
  const lostRequests = hiringRequests.filter(req => 
    req.client_id && LOST_STAGES.includes(req.pipeline_stage)
  );
  
  // Filter by year using start_date (default to 2025 if null)
  const lostRequestsForYear = lostRequests.filter(req => {
    const year = req.start_date ? new Date(req.start_date).getFullYear() : 2025;
    return year === lostYearFilter;
  });
  
  const clientsInLostStages = new Set(lostRequestsForYear.map(req => req.client_id!));
  
  const filteredClients = clients.filter(client => {
    const matchesSearch = !searchTerm || 
      client.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.industry?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.leads_from?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Apply status filter using pipeline-based hiring logic
    const hasActiveContractors = (client.contractor_count || 0) > 0;
    const isActivelyHiring = clientsWithActiveHiringRequests.has(client.id);
    const isInLostStage = clientsInLostStages.has(client.id);
    const isInactive = !hasActiveContractors && !isActivelyHiring;
    const matchesStatusFilter = 
      statusFilter === 'all' ||
      (statusFilter === 'active' && hasActiveContractors) ||
      (statusFilter === 'lost' && isInLostStage) ||
      (statusFilter === 'newHiring' && isActivelyHiring && !hasActiveContractors) ||
      (statusFilter === 'existingHiring' && isActivelyHiring && hasActiveContractors) ||
      (statusFilter === 'inactive' && isInactive);
    
    return matchesSearch && matchesStatusFilter;
  });

  // Summary stats
  const totalActiveContractors = clients.reduce((sum, c) => sum + (c.contractor_count || 0), 0);
  const totalActiveClients = clients.filter(c => (c.contractor_count || 0) > 0).length;

  // Active clients (with active contractors) split by earliest active contractor start date
  const activeClientsWithContractors = clients.filter(c => (c.contractor_count || 0) > 0);
  const getClientEarliestActiveStartYear = (clientId: string) => {
    const activeStartDates = contractorData
      .filter(c => c.status?.toLowerCase() === 'active' && c.client_id === clientId && c.start_date)
      .map(c => new Date(c.start_date as string).getFullYear());
    return activeStartDates.length > 0 ? Math.min(...activeStartDates) : null;
  };
  const oldActiveClientsCount = activeClientsWithContractors.filter(c => {
    const year = getClientEarliestActiveStartYear(c.id);
    return year !== null && year < 2026;
  }).length;
  const newActiveClientsCount = activeClientsWithContractors.filter(c => {
    const year = getClientEarliestActiveStartYear(c.id);
    return year !== null && year >= 2026;
  }).length;

  // Count clients added per selected year (based on created_at)
  const clientsAddedForYear = clients.filter(c => {
    const year = new Date(c.created_at).getFullYear();
    return year === addedYearFilter;
  }).length;
  
  // Count hiring clients based on having requests in active pipeline stages
  const newClientsHiring = clients.filter(c => 
    clientsWithActiveHiringRequests.has(c.id) && (c.contractor_count || 0) === 0
  ).length;
  const existingClientsHiring = clients.filter(c => 
    clientsWithActiveHiringRequests.has(c.id) && (c.contractor_count || 0) > 0
  ).length;
  
  const clientsLost = clientsInLostStages.size;
  const inactiveClients = clients.filter(c => 
    (c.contractor_count || 0) === 0 && !clientsWithActiveHiringRequests.has(c.id)
  ).length;
  
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
    // ... keep existing code
    try {
      const { data: clientsData } = await supabase
        .from('clients')
        .select('*')
        .order('company_name');

      const { data: contactsData } = await supabase
        .from('client_contacts')
        .select('*')
        .eq('is_primary', true);

      const contactsMap: Record<string, typeof contactsData[0]> = {};
      contactsData?.forEach(c => {
        if (!contactsMap[c.client_id]) {
          contactsMap[c.client_id] = c;
        }
      });

      const headers = [
        'Business Name', 'First Name', 'Last Name', 'Email Address',
        'Contact Information', 'No. of Contractors', 'Leads from',
        'Add links about the company to be shared with candidate(s)',
        '4% Yearly increase', 'Industry'
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

      toast({ title: 'Success', description: `Exported ${clientsData?.length || 0} clients` });
    } catch (err: any) {
      toast({ title: 'Error', description: 'Failed to export clients: ' + err.message, variant: 'destructive' });
    }
  };

  const toggleSelectClient = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredClients.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredClients.map(c => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(`Are you sure you want to delete ${selectedIds.size} client(s)? This will also archive them to the deleted clients table.`);
    if (!confirmed) return;

    setBulkDeleting(true);
    try {
      const idsArray = Array.from(selectedIds);
      const clientsToDelete = clients.filter(c => idsArray.includes(c.id));

      // Archive to deleted_clients
      const archiveRows = clientsToDelete.map(c => ({
        original_id: c.id,
        company_name: c.company_name,
        industry: c.industry,
        website: c.website,
        address: c.address,
        notes: c.notes,
        leads_from: c.leads_from,
        company_links: c.company_links,
        yearly_increase: c.yearly_increase,
        contractor_count: c.contractor_count,
        is_hiring: c.is_hiring,
        created_at: c.created_at,
      }));

      const { error: archiveError } = await supabase
        .from('deleted_clients')
        .insert(archiveRows);

      if (archiveError) throw archiveError;

      // Delete from clients table
      const { error: deleteError } = await supabase
        .from('clients')
        .delete()
        .in('id', idsArray);

      if (deleteError) throw deleteError;

      toast({ title: 'Deleted', description: `${idsArray.length} client(s) deleted successfully.` });
      setSelectedIds(new Set());
      setSelectionMode(false);
      fetchClients();
    } catch (err: any) {
      toast({ title: 'Error', description: 'Failed to delete clients: ' + err.message, variant: 'destructive' });
    } finally {
      setBulkDeleting(false);
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
        <div
          className={`stat-card cursor-pointer transition-all ${statusFilter === 'active' ? 'ring-2 ring-primary' : ''}`}
          style={{ color: '#534AB7' }}
          onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')}
        >
          <div className="flex items-center justify-center mb-2.5" style={{ width: 32, height: 32, borderRadius: 8, background: '#EEEDFE' }} aria-hidden="true">
            <Building2 style={{ width: 16, height: 16, color: '#534AB7' }} strokeWidth={2} />
          </div>
          <p className="text-[10px] uppercase tracking-[0.04em] font-medium text-muted-foreground mb-1">Total Active Clients</p>
          <p className="text-[22px] font-medium leading-none text-foreground">{totalActiveClients}</p>
          <div className="mt-2 flex items-center gap-1.5 text-[10px]">
            <span className="text-muted-foreground">Added:</span>
            <span className="font-semibold">{clientsAddedForYear}</span>
            <Select value={addedYearFilter.toString()} onValueChange={(v) => setAddedYearFilter(parseInt(v))}>
              <SelectTrigger className="h-5 w-[60px] text-[10px] px-1.5" onClick={(e) => e.stopPropagation()}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent onClick={(e) => e.stopPropagation()}>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 mt-1 text-[10px]">
            <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground" title="Active clients whose earliest active contractor started before 2026">
              Old <span className="font-semibold text-foreground">{oldActiveClientsCount}</span>
            </span>
            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary" title="Active clients whose active contractors all started in 2026 or later">
              New <span className="font-semibold">{newActiveClientsCount}</span>
            </span>
          </div>
        </div>
        <div className="stat-card" style={{ color: '#534AB7' }}>
          <div className="flex items-center justify-center mb-2.5" style={{ width: 32, height: 32, borderRadius: 8, background: '#EEEDFE' }} aria-hidden="true">
            <Users style={{ width: 16, height: 16, color: '#534AB7' }} strokeWidth={2} />
          </div>
          <p className="text-[10px] uppercase tracking-[0.04em] font-medium text-muted-foreground mb-1">Active Contractors</p>
          <p className="text-[22px] font-medium leading-none text-foreground">{totalActiveContractors}</p>
        </div>
        <div
          className={`stat-card cursor-pointer transition-all ${statusFilter === 'lost' ? 'ring-2 ring-red-500' : ''}`}
          style={{ color: '#E24B4A' }}
          onClick={() => setStatusFilter(statusFilter === 'lost' ? 'all' : 'lost')}
        >
          <div className="flex items-center justify-center mb-2.5" style={{ width: 32, height: 32, borderRadius: 8, background: '#FCEBEB' }} aria-hidden="true">
            <Building2 style={{ width: 16, height: 16, color: '#E24B4A' }} strokeWidth={2} />
          </div>
          <p className="text-[10px] uppercase tracking-[0.04em] font-medium text-muted-foreground mb-1">Clients Lost</p>
          <p className="text-[22px] font-medium leading-none text-foreground">{clientsInLostStages.size}</p>
          <div className="mt-2">
            <Select value={lostYearFilter.toString()} onValueChange={(v) => setLostYearFilter(parseInt(v))}>
              <SelectTrigger className="h-7 w-[80px] text-xs" onClick={(e) => e.stopPropagation()}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent onClick={(e) => e.stopPropagation()}>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div
          className={`stat-card cursor-pointer transition-all ${statusFilter === 'newHiring' ? 'ring-2 ring-amber-500' : ''}`}
          style={{ color: '#0ABEDF' }}
          onClick={() => setStatusFilter(statusFilter === 'newHiring' ? 'all' : 'newHiring')}
        >
          <div className="flex items-center justify-center mb-2.5" style={{ width: 32, height: 32, borderRadius: 8, background: '#E0F7FC' }} aria-hidden="true">
            <UserPlus style={{ width: 16, height: 16, color: '#0ABEDF' }} strokeWidth={2} />
          </div>
          <p className="text-[10px] uppercase tracking-[0.04em] font-medium text-muted-foreground mb-1">New Client (Hiring)</p>
          <p className="text-[22px] font-medium leading-none text-foreground">{newClientsHiring}</p>
        </div>
        <div
          className={`stat-card cursor-pointer transition-all ${statusFilter === 'existingHiring' ? 'ring-2 ring-purple-500' : ''}`}
          style={{ color: '#0ABEDF' }}
          onClick={() => setStatusFilter(statusFilter === 'existingHiring' ? 'all' : 'existingHiring')}
        >
          <div className="flex items-center justify-center mb-2.5" style={{ width: 32, height: 32, borderRadius: 8, background: '#E0F7FC' }} aria-hidden="true">
            <Building2 style={{ width: 16, height: 16, color: '#0ABEDF' }} strokeWidth={2} />
          </div>
          <p className="text-[10px] uppercase tracking-[0.04em] font-medium text-muted-foreground mb-1">Existing Client (Hiring)</p>
          <div className="flex items-center gap-2">
            <p className="text-[22px] font-medium leading-none text-foreground">{existingClientsHiring}</p>
            {existingClientsOpenRoles > 0 && (
              <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                {existingClientsOpenRoles} {existingClientsOpenRoles === 1 ? 'role' : 'roles'}
              </Badge>
            )}
          </div>
        </div>
        <div
          className={`stat-card cursor-pointer transition-all ${statusFilter === 'inactive' ? 'ring-2 ring-gray-500' : ''}`}
          style={{ color: '#534AB7' }}
          onClick={() => setStatusFilter(statusFilter === 'inactive' ? 'all' : 'inactive')}
        >
          <div className="flex items-center justify-center mb-2.5" style={{ width: 32, height: 32, borderRadius: 8, background: '#EEEDFE' }} aria-hidden="true">
            <Building2 style={{ width: 16, height: 16, color: '#534AB7' }} strokeWidth={2} />
          </div>
          <p className="text-[10px] uppercase tracking-[0.04em] font-medium text-muted-foreground mb-1">Inactive Clients</p>
          <p className="text-[22px] font-medium leading-none text-foreground">{inactiveClients}</p>
        </div>
      </div>

      {/* Client Insights */}
      <ClientInsightsPanel
        clients={clients}
        contractors={contractorData}
        hiringRequests={hiringRequests}
      />

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
          <Button
            variant={selectionMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setSelectionMode(!selectionMode);
              if (selectionMode) setSelectedIds(new Set());
            }}
          >
            <CheckSquare className="w-4 h-4 mr-2" />
            {selectionMode ? 'Cancel' : 'Select'}
          </Button>
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

      {/* Bulk Action Bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="sticky top-0 z-10 bg-background border rounded-lg p-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={selectedIds.size === filteredClients.length}
              onCheckedChange={toggleSelectAll}
            />
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
          >
            {bulkDeleting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deleting...</>
            ) : (
              <><Trash2 className="w-4 h-4 mr-2" />Delete ({selectedIds.size})</>
            )}
          </Button>
        </div>
      )}

      {/* Select All row when in selection mode */}
      {selectionMode && selectedIds.size === 0 && (
        <div className="flex items-center gap-3 px-4 py-2 text-sm text-muted-foreground">
          <Checkbox
            checked={false}
            onCheckedChange={toggleSelectAll}
          />
          <span>Select all ({filteredClients.length})</span>
        </div>
      )}

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
          {filteredClients.map((client, clientIndex) => (
            <Card 
              key={client.id} 
              className={`list-row-card cursor-pointer transition-colors ${selectedIds.has(client.id) ? 'ring-2 ring-primary' : ''}`}
              onClick={() => selectionMode ? toggleSelectClient(client.id) : setSelectedClient(client)}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {selectionMode && (
                      <Checkbox
                        checked={selectedIds.has(client.id)}
                        onCheckedChange={() => toggleSelectClient(client.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <div className={`list-row-icon ${['tint-cyan', 'tint-purple', 'tint-coral', 'tint-blue'][clientIndex % 4]}`}>
                      <Building2 />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="list-row-title">{client.company_name}</h3>
                        {client.yearly_increase && (
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                            <TrendingUp className="w-3 h-3 mr-1" />
                            4% Increase
                          </Badge>
                        )}
                      </div>
                      <div className="list-row-meta flex items-center gap-4 mt-1">
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
                                .filter(r => r.client_id === client.id && ACTIVE_HIRING_STAGES.includes(r.pipeline_stage))
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