import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Building2, TrendingUp, TrendingDown, Users, DollarSign, BarChart3 } from 'lucide-react';
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
}

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

export const ClientAnalyticsDashboard = () => {
  const { toast } = useToast();
  const [contractors, setContractors] = useState<ContractorData[]>([]);
  const [clients, setClients] = useState<ClientData[]>([]);
  const [loading, setLoading] = useState(true);

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
            .select('id, company_name, industry'),
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

  // 3. Terminated per Year
  const terminatedPerYear = useMemo(() => {
    const yearMap: Record<string, number> = {};
    contractors.filter(c => c.status === 'terminated').forEach(c => {
      if (c.end_date) {
        const year = new Date(c.end_date).getFullYear().toString();
        yearMap[year] = (yearMap[year] || 0) + 1;
      } else if (c.start_date) {
        // Use start_date year as fallback
        const year = new Date(c.start_date).getFullYear().toString();
        yearMap[year] = (yearMap[year] || 0) + 1;
      }
    });
    return Object.entries(yearMap)
      .map(([year, terminated]) => ({ year, terminated }))
      .sort((a, b) => a.year.localeCompare(b.year));
  }, [contractors]);

  // 4. Client Retention Rate (active / total per client)
  const clientRetention = useMemo(() => {
    const clientStats: Record<string, { total: number; active: number; name: string }> = {};
    
    contractors.forEach(c => {
      if (c.client) {
        if (!clientStats[c.client.id]) {
          clientStats[c.client.id] = { total: 0, active: 0, name: c.client.company_name };
        }
        clientStats[c.client.id].total += 1;
        if (c.status === 'active') {
          clientStats[c.client.id].active += 1;
        }
      }
    });

    const retentionData = Object.entries(clientStats)
      .map(([id, stats]) => ({
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
  const totalClients = clients.length;
  const totalContractors = contractors.length;
  const activeContractors = contractors.filter(c => c.status === 'active').length;
  const terminatedTotal = contractors.filter(c => c.status === 'terminated').length;

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
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalClients || 0}</p>
                <p className="text-sm text-muted-foreground">Total Clients</p>
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
                <p className="text-2xl font-bold">{clientRetention.average || 0}%</p>
                <p className="text-sm text-muted-foreground">Avg Retention Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <TrendingDown className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{terminatedTotal || 0}</p>
                <p className="text-sm text-muted-foreground">Total Terminated</p>
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
        {/* Terminated per Year */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="w-4 h-4" />
              Terminations per Year
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={terminatedPerYear}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="year" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))' 
                    }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="terminated" 
                    stroke="#ef4444" 
                    strokeWidth={2}
                    dot={{ fill: '#ef4444', strokeWidth: 2 }}
                  />
                </LineChart>
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
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={clientRetention.data} layout="vertical">
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
        </CardContent>
      </Card>
    </div>
  );
};
