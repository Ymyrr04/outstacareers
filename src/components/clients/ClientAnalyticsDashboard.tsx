import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Building2, TrendingUp, TrendingDown, Users, DollarSign, BarChart3, X } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from 'recharts';

interface ContractorData {
  id: string;
  client_id: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  hourly_rate: number | null;
  client: {
    id: string;
    company_name: string;
    industry: string | null;
  } | null;
}

interface ClientData {
  id: string;
  company_name: string;
  industry: string | null;
  leads_from: string | null;
  website: string | null;
  notes: string | null;
  is_hiring: boolean | null;
}

interface SelectedClient extends ClientData {
  activeContractors: number;
  totalContractors: number;
  retention: number;
}

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

export const ClientAnalyticsDashboard = () => {
  const { toast } = useToast();
  const [contractors, setContractors] = useState<ContractorData[]>([]);
  const [clients, setClients] = useState<ClientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<SelectedClient | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [contractorsRes, clientsRes] = await Promise.all([
          supabase
            .from('contractor_assignments')
            .select(`*, client:clients(id, company_name, industry)`),
          supabase
            .from('clients')
            .select('id, company_name, industry, leads_from, website, notes, is_hiring'),
        ]);

        if (contractorsRes.error) throw contractorsRes.error;
        if (clientsRes.error) throw clientsRes.error;

        setContractors(contractorsRes.data || []);
        setClients(clientsRes.data || []);
      } catch (err: any) {
        toast({
          title: 'Error',
          description: 'Failed to load analytics data: ' + err.message,
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // 1. Clients per Industry
  const clientsByIndustry = useMemo(() => {
    const industryMap: Record<string, number> = {};
    clients.forEach(c => {
      const industry = c.industry || 'Unknown';
      industryMap[industry] = (industryMap[industry] || 0) + 1;
    });
    return Object.entries(industryMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [clients]);

  // 2. Hires per Year (based on start_date)
  const hiresPerYear = useMemo(() => {
    const yearMap: Record<string, number> = {};
    contractors.forEach(c => {
      if (c.start_date) {
        const year = new Date(c.start_date).getFullYear().toString();
        yearMap[year] = (yearMap[year] || 0) + 1;
      }
    });
    return Object.entries(yearMap)
      .map(([year, hires]) => ({ year, hires }))
      .sort((a, b) => a.year.localeCompare(b.year));
  }, [contractors]);

  // 3. Separated per Year (Terminated + Resigned)
  const separatedPerYear = useMemo(() => {
    const yearMap: Record<string, { terminated: number; resigned: number }> = {};
    contractors.filter(c => c.status === 'terminated' || c.status === 'resigned').forEach(c => {
      const dateToUse = c.end_date || c.start_date;
      if (dateToUse) {
        const year = new Date(dateToUse).getFullYear().toString();
        if (!yearMap[year]) {
          yearMap[year] = { terminated: 0, resigned: 0 };
        }
        if (c.status === 'terminated') {
          yearMap[year].terminated += 1;
        } else {
          yearMap[year].resigned += 1;
        }
      }
    });
    return Object.entries(yearMap)
      .map(([year, counts]) => ({ year, ...counts, total: counts.terminated + counts.resigned }))
      .sort((a, b) => a.year.localeCompare(b.year));
  }, [contractors]);

  // 4. Client Retention Rate (active / total per client)
  const clientRetention = useMemo(() => {
    const clientStats: Record<string, { total: number; active: number; name: string; clientId: string }> = {};
    
    contractors.forEach(c => {
      if (c.client) {
        if (!clientStats[c.client.id]) {
          clientStats[c.client.id] = { total: 0, active: 0, name: c.client.company_name, clientId: c.client.id };
        }
        clientStats[c.client.id].total += 1;
        if (c.status === 'active') {
          clientStats[c.client.id].active += 1;
        }
      }
    });

    const retentionData = Object.entries(clientStats)
      .map(([id, stats]) => ({
        id,
        name: stats.name.length > 20 ? stats.name.substring(0, 20) + '...' : stats.name,
        fullName: stats.name,
        retention: stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0,
        active: stats.active,
        total: stats.total,
      }))
      .filter(c => c.total >= 1)
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    const avgRetention = retentionData.length > 0
      ? Math.round(retentionData.reduce((sum, c) => sum + c.retention, 0) / retentionData.length)
      : 0;

    return { data: retentionData, average: avgRetention };
  }, [contractors]);

  // Handle client bar click
  const handleClientClick = (data: any) => {
    if (!data?.activePayload?.[0]?.payload) return;
    
    const payload = data.activePayload[0].payload;
    const client = clients.find(c => c.id === payload.id);
    
    if (client) {
      setSelectedClient({
        ...client,
        activeContractors: payload.active,
        totalContractors: payload.total,
        retention: payload.retention,
      });
    }
  };

  // 5. Hires per Rate Band
  const hiresPerRate = useMemo(() => {
    const rateBands: Record<string, number> = {
      '$0-5': 0,
      '$5-7': 0,
      '$7-10': 0,
      '$10-15': 0,
      '$15+': 0,
    };

    contractors.forEach(c => {
      const rate = c.hourly_rate || 0;
      if (rate <= 5) rateBands['$0-5']++;
      else if (rate <= 7) rateBands['$5-7']++;
      else if (rate <= 10) rateBands['$7-10']++;
      else if (rate <= 15) rateBands['$10-15']++;
      else rateBands['$15+']++;
    });

    return Object.entries(rateBands).map(([range, count]) => ({ range, count }));
  }, [contractors]);

  // Summary stats
  const activeContractors = contractors.filter(c => c.status === 'active').length;
  const scheduledContractors = contractors.filter(c => c.status === 'scheduled').length;
  const renderingContractors = contractors.filter(c => c.status === 'rendering').length;
  const separatedContractors = contractors.filter(c => c.status === 'terminated' || c.status === 'resigned').length;
  
  // Get unique client IDs with active contractors
  const clientsWithActiveContractors = new Set(
    contractors
      .filter(c => c.status === 'active')
      .map(c => c.client_id)
  );
  const totalActiveClients = clientsWithActiveContractors.size;
  
  // Clients with no contractors AND not marked as hiring (truly lost clients)
  const clientsWithContractors = new Set(contractors.map(c => c.client_id));
  const clientsLost = clients.filter(c => !clientsWithContractors.has(c.id) && !c.is_hiring).length;
  
  // Clients currently hiring (from clients.is_hiring flag)
  const newClientsHiring = clients.filter(c => c.is_hiring === true).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Loading analytics...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards - Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalActiveClients || 0}</p>
                <p className="text-sm text-muted-foreground">Active Clients</p>
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
                <p className="text-2xl font-bold">{activeContractors || 0}</p>
                <p className="text-sm text-muted-foreground">Active Contractors</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <TrendingUp className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{scheduledContractors || 0}</p>
                <p className="text-sm text-muted-foreground">Scheduled</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/10 rounded-lg">
                <Users className="w-5 h-5 text-cyan-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{renderingContractors || 0}</p>
                <p className="text-sm text-muted-foreground">Rendering</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary Cards - Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <TrendingDown className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{separatedContractors || 0}</p>
                <p className="text-sm text-muted-foreground">Separated</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Building2 className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{newClientsHiring || 0}</p>
                <p className="text-sm text-muted-foreground">Clients Hiring</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-500/10 rounded-lg">
                <TrendingDown className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{clientsLost || 0}</p>
                <p className="text-sm text-muted-foreground">Clients Lost</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/10 rounded-lg">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{clientRetention.average || 0}%</p>
                <p className="text-sm text-muted-foreground">Avg Retention</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Clients by Industry */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Clients by Industry
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={clientsByIndustry}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {clientsByIndustry.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Hires per Year */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Hires per Year
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hiresPerYear}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="year" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))' 
                    }} 
                  />
                  <Bar dataKey="hires" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Separations per Year (Terminated + Resigned) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="w-4 h-4" />
              Separations per Year
              <span className="text-xs text-muted-foreground font-normal">(Terminated + Resigned)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={separatedPerYear}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="year" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))' 
                    }} 
                  />
                  <Legend />
                  <Bar dataKey="terminated" stackId="a" fill="#ef4444" name="Terminated" />
                  <Bar dataKey="resigned" stackId="a" fill="#8b5cf6" name="Resigned" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Hires per Rate */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Hires by Rate Band
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hiresPerRate} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis type="category" dataKey="range" className="text-xs" width={60} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))' 
                    }} 
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Client Retention Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Client Retention Rate (Active / Total Contractors)
            <span className="text-xs text-muted-foreground font-normal ml-2">Click bar for details</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <div className="h-[350px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={clientRetention.data} 
                layout="vertical"
                onClick={handleClientClick}
                style={{ cursor: 'pointer' }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" domain={[0, 100]} className="text-xs" unit="%" />
                <YAxis type="category" dataKey="name" className="text-xs" width={150} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))' 
                  }}
                  formatter={(value: number, name: string, props: any) => [
                    `${value}% (${props.payload.active}/${props.payload.total})`,
                    'Retention'
                  ]}
                  labelFormatter={(label) => clientRetention.data.find(c => c.name === label)?.fullName || label}
                />
                <Bar 
                  dataKey="retention" 
                  fill="#8b5cf6" 
                  radius={[0, 4, 4, 0]}
                  background={{ fill: 'hsl(var(--muted))' }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          {/* Client Details Panel */}
          {selectedClient && (
            <div className="w-72 border rounded-lg bg-cyan-100/80 dark:bg-cyan-900/30 p-4 relative">
              <button 
                onClick={() => setSelectedClient(null)}
                className="absolute top-2 right-2 p-1 hover:bg-background/50 rounded"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-background/50 rounded">
                  <Building2 className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm leading-tight">{selectedClient.company_name}</h3>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-cyan-700 dark:text-cyan-300">
                    {selectedClient.industry && <span>{selectedClient.industry}</span>}
                    {selectedClient.leads_from && <span>From: {selectedClient.leads_from}</span>}
                  </div>
                </div>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Active:</span>
                  <span className="font-medium">{selectedClient.activeContractors}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-medium">{selectedClient.totalContractors}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Retention:</span>
                  <span className="font-medium">{selectedClient.retention}%</span>
                </div>
                {selectedClient.website && (
                  <div className="pt-2 border-t">
                    <a 
                      href={selectedClient.website} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline truncate block"
                    >
                      {selectedClient.website}
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
