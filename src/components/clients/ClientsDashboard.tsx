import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Building2, Users, Search, Plus, Loader2, Globe, Download, Upload } from 'lucide-react';
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
  created_at: string;
  updated_at: string;
  contact_count?: number;
  contractor_count?: number;
}

export interface ClientContact {
  id: string;
  client_id: string;
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
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const fetchClients = async () => {
    setLoading(true);
    try {
      // Fetch clients with counts
      const { data: clientsData, error } = await supabase
        .from('clients')
        .select('*')
        .order('company_name', { ascending: true });

      if (error) throw error;

      // Fetch contact counts
      const { data: contactCounts } = await supabase
        .from('client_contacts')
        .select('client_id');

      // Fetch contractor counts
      const { data: contractorCounts } = await supabase
        .from('contractor_assignments')
        .select('client_id')
        .eq('status', 'active');

      // Build counts map
      const contactMap: Record<string, number> = {};
      const contractorMap: Record<string, number> = {};

      contactCounts?.forEach(c => {
        contactMap[c.client_id] = (contactMap[c.client_id] || 0) + 1;
      });

      contractorCounts?.forEach(c => {
        contractorMap[c.client_id] = (contractorMap[c.client_id] || 0) + 1;
      });

      // Enrich clients
      const enrichedClients = (clientsData || []).map(client => ({
        ...client,
        contact_count: contactMap[client.id] || 0,
        contractor_count: contractorMap[client.id] || 0,
      }));

      setClients(enrichedClients);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to fetch clients: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const filteredClients = clients.filter(client => {
    const matchesSearch = !searchTerm || 
      client.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.industry?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });

  // Summary stats
  const totalContractors = clients.reduce((sum, c) => sum + (c.contractor_count || 0), 0);
  const totalContacts = clients.reduce((sum, c) => sum + (c.contact_count || 0), 0);

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

      // Build CSV
      const headers = [
        'company_name',
        'industry',
        'website',
        'address',
        'billing_status',
        'notes',
        'contact_name',
        'contact_email',
        'contact_phone',
        'contact_role',
        'created_at'
      ];

      const rows = (clientsData || []).map(client => {
        const contact = contactsMap[client.id];
        return [
          `"${(client.company_name || '').replace(/"/g, '""')}"`,
          `"${(client.industry || '').replace(/"/g, '""')}"`,
          `"${(client.website || '').replace(/"/g, '""')}"`,
          `"${(client.address || '').replace(/"/g, '""')}"`,
          client.billing_status || '',
          `"${(client.notes || '').replace(/"/g, '""')}"`,
          `"${(contact?.full_name || '').replace(/"/g, '""')}"`,
          `"${(contact?.email || '').replace(/"/g, '""')}"`,
          `"${(contact?.phone || '').replace(/"/g, '""')}"`,
          `"${(contact?.role || '').replace(/"/g, '""')}"`,
          client.created_at
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{clients.length}</p>
                <p className="text-sm text-muted-foreground">Total Clients</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalContractors}</p>
                <p className="text-sm text-muted-foreground">Active Contractors</p>
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
                <p className="text-2xl font-bold">{totalContacts}</p>
                <p className="text-sm text-muted-foreground">Total Contacts</p>
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
                      <h3 className="font-semibold">{client.company_name}</h3>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        {client.industry && <span>{client.industry}</span>}
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
