// Client Analytics Dashboard
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Building2, TrendingUp, TrendingDown, Users, GripVertical, ArrowUpDown, ArrowUp, ArrowDown, Globe } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface ContractorData {
  id: string;
  client_id: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  hourly_rate: number | null;
  job_title: string | null;
  country: string | null;
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

type CardId = 'industry' | 'roles' | 'country' | 'monthlyHires' | 'separations' | 'retentionCompany' | 'retentionIndustry';

type SortField = 'hired' | 'active' | 'retention';
type SortDirection = 'asc' | 'desc';

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

const DEFAULT_CARD_ORDER: CardId[] = ['industry', 'roles', 'country', 'monthlyHires', 'separations', 'retentionCompany', 'retentionIndustry'];

export const ClientAnalyticsDashboard = () => {
  const { toast } = useToast();
  const [contractors, setContractors] = useState<ContractorData[]>([]);
  const [clients, setClients] = useState<ClientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [cardOrder, setCardOrder] = useState<CardId[]>(() => {
    const saved = localStorage.getItem('analytics-card-order');
    return saved ? JSON.parse(saved) : DEFAULT_CARD_ORDER;
  });
  const [draggedCard, setDraggedCard] = useState<CardId | null>(null);
  const [companySortField, setCompanySortField] = useState<SortField>('hired');
  const [companySortDir, setCompanySortDir] = useState<SortDirection>('desc');
  const [industrySortField, setIndustrySortField] = useState<SortField>('hired');
  const [industrySortDir, setIndustrySortDir] = useState<SortDirection>('desc');

  const fetchData = useCallback(async () => {
    try {
      const [contractorsRes, clientsRes] = await Promise.all([
        supabase
          .from('contractor_assignments')
          .select(`*, country, client:clients(id, company_name, industry)`),
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
    }
  }, [toast]);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  // Real-time subscriptions for auto-refresh
  useEffect(() => {
    const contractorsChannel = supabase
      .channel('analytics-contractors')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contractor_assignments' },
        () => fetchData()
      )
      .subscribe();

    const clientsChannel = supabase
      .channel('analytics-clients')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clients' },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(contractorsChannel);
      supabase.removeChannel(clientsChannel);
    };
  }, [fetchData]);

  // Save card order to localStorage
  useEffect(() => {
    localStorage.setItem('analytics-card-order', JSON.stringify(cardOrder));
  }, [cardOrder]);

  // 1. Clients per Industry (with percentages)
  const clientsByIndustry = useMemo(() => {
    const industryMap: Record<string, number> = {};
    clients.forEach(c => {
      const industry = c.industry || 'Unknown';
      industryMap[industry] = (industryMap[industry] || 0) + 1;
    });
    const total = clients.length;
    return Object.entries(industryMap)
      .map(([name, value]) => ({ 
        name, 
        value, 
        percentage: total > 0 ? Math.round((value / total) * 100) : 0 
      }))
      .sort((a, b) => b.value - a.value);
  }, [clients]);

  // 2. Monthly stats (Hires, Resignations, Terminations) - Starting from 2026
  const monthlyStats = useMemo(() => {
    const monthMap: Record<string, { hires: number; resigned: number; terminated: number }> = {};
    
    const now = new Date();
    const startYear = 2026;
    const startMonth = 0;
    
    for (let year = startYear; year <= now.getFullYear(); year++) {
      const endMonth = year === now.getFullYear() ? now.getMonth() : 11;
      const beginMonth = year === startYear ? startMonth : 0;
      
      for (let month = beginMonth; month <= endMonth; month++) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}`;
        monthMap[key] = { hires: 0, resigned: 0, terminated: 0 };
      }
    }
    
    contractors.forEach(c => {
      if (c.start_date) {
        const date = new Date(c.start_date);
        if (date.getFullYear() >= 2026) {
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          if (monthMap[key]) {
            monthMap[key].hires += 1;
          }
        }
      }
    });
    
    contractors.filter(c => c.status === 'terminated' || c.status === 'resigned').forEach(c => {
      const dateToUse = c.end_date || c.start_date;
      if (dateToUse) {
        const date = new Date(dateToUse);
        if (date.getFullYear() >= 2026) {
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          if (monthMap[key]) {
            if (c.status === 'terminated') {
              monthMap[key].terminated += 1;
            } else {
              monthMap[key].resigned += 1;
            }
          }
        }
      }
    });
    
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, counts]) => {
        const [year, m] = month.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return {
          month: `${monthNames[parseInt(m) - 1]} ${year.slice(2)}`,
          ...counts,
        };
      });
  }, [contractors]);

  // 3. Retention Rate per Company (raw data without sorting)
  const retentionByCompanyRaw = useMemo(() => {
    const companyStats: Record<string, { name: string; total: number; active: number }> = {};
    
    contractors.forEach(c => {
      if (c.client) {
        if (!companyStats[c.client.id]) {
          companyStats[c.client.id] = { name: c.client.company_name, total: 0, active: 0 };
        }
        companyStats[c.client.id].total += 1;
        if (c.status === 'active') {
          companyStats[c.client.id].active += 1;
        }
      }
    });

    return Object.values(companyStats)
      .map(stats => ({
        name: stats.name,
        hired: stats.total,
        active: stats.active,
        retention: stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0,
      }))
      .filter(c => c.hired >= 1);
  }, [contractors]);

  // Apply sorting to company retention
  const retentionByCompany = useMemo(() => {
    return [...retentionByCompanyRaw].sort((a, b) => {
      const multiplier = companySortDir === 'asc' ? 1 : -1;
      return (a[companySortField] - b[companySortField]) * multiplier;
    });
  }, [retentionByCompanyRaw, companySortField, companySortDir]);

  // 4. Retention Rate per Industry (raw data without sorting)
  const retentionByIndustryRaw = useMemo(() => {
    const industryStats: Record<string, { total: number; active: number }> = {};
    
    contractors.forEach(c => {
      if (c.client) {
        const industry = c.client.industry || 'Unknown';
        if (!industryStats[industry]) {
          industryStats[industry] = { total: 0, active: 0 };
        }
        industryStats[industry].total += 1;
        if (c.status === 'active') {
          industryStats[industry].active += 1;
        }
      }
    });

    return Object.entries(industryStats)
      .map(([name, stats]) => ({
        name,
        hired: stats.total,
        active: stats.active,
        retention: stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0,
      }));
  }, [contractors]);

  // Apply sorting to industry retention
  const retentionByIndustry = useMemo(() => {
    return [...retentionByIndustryRaw].sort((a, b) => {
      const multiplier = industrySortDir === 'asc' ? 1 : -1;
      return (a[industrySortField] - b[industrySortField]) * multiplier;
    });
  }, [retentionByIndustryRaw, industrySortField, industrySortDir]);

  // 5. Contractors by Role (Job Title)
  const contractorsByRole = useMemo(() => {
    const roleMap: Record<string, number> = {};
    contractors.forEach(c => {
      const role = c.job_title || 'Unknown';
      roleMap[role] = (roleMap[role] || 0) + 1;
    });
    const total = contractors.length;
    return Object.entries(roleMap)
      .map(([name, value]) => ({ 
        name, 
        value, 
        percentage: total > 0 ? Math.round((value / total) * 100) : 0 
      }))
      .sort((a, b) => b.value - a.value);
  }, [contractors]);

  // 6. Contractors by Country
  const contractorsByCountry = useMemo(() => {
    const countryMap: Record<string, number> = {};
    contractors.forEach(c => {
      const country = c.country || 'Unknown';
      countryMap[country] = (countryMap[country] || 0) + 1;
    });
    const total = contractors.length;
    return Object.entries(countryMap)
      .map(([name, value]) => ({ 
        name, 
        value, 
        percentage: total > 0 ? Math.round((value / total) * 100) : 0 
      }))
      .sort((a, b) => b.value - a.value);
  }, [contractors]);

  // Summary stats
  const activeContractors = contractors.filter(c => c.status === 'active').length;
  const scheduledContractors = contractors.filter(c => c.status === 'scheduled').length;
  
  const clientsWithActiveContractors = new Set(
    contractors
      .filter(c => c.status === 'active')
      .map(c => c.client_id)
  );
  const totalActiveClients = clientsWithActiveContractors.size;
  
  const clientsLost = clients.filter(c => !clientsWithActiveContractors.has(c.id) && !c.is_hiring).length;
  
  const newClientsHiring = clients.filter(c => c.is_hiring === true).length;

  // Sort handlers for retention tables
  const handleCompanySort = (field: SortField) => {
    if (companySortField === field) {
      setCompanySortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setCompanySortField(field);
      setCompanySortDir('desc');
    }
  };

  const handleIndustrySort = (field: SortField) => {
    if (industrySortField === field) {
      setIndustrySortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setIndustrySortField(field);
      setIndustrySortDir('desc');
    }
  };

  const SortIcon = ({ field, currentField, currentDir }: { field: SortField; currentField: SortField; currentDir: SortDirection }) => {
    if (field !== currentField) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-50" />;
    return currentDir === 'asc' 
      ? <ArrowUp className="w-3 h-3 ml-1" /> 
      : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  // Drag and Drop handlers
  const handleDragStart = useCallback((cardId: CardId) => {
    setDraggedCard(cardId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((targetCardId: CardId) => {
    if (!draggedCard || draggedCard === targetCardId) {
      setDraggedCard(null);
      return;
    }

    setCardOrder(prev => {
      const newOrder = [...prev];
      const draggedIndex = newOrder.indexOf(draggedCard);
      const targetIndex = newOrder.indexOf(targetCardId);
      
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedCard);
      
      return newOrder;
    });
    setDraggedCard(null);
  }, [draggedCard]);

  const handleDragEnd = useCallback(() => {
    setDraggedCard(null);
  }, []);

  // Draggable Card Wrapper
  const DraggableCard = ({ cardId, children }: { cardId: CardId; children: React.ReactNode }) => (
    <div
      draggable
      onDragStart={() => handleDragStart(cardId)}
      onDragOver={handleDragOver}
      onDrop={() => handleDrop(cardId)}
      onDragEnd={handleDragEnd}
      className={`relative group transition-all duration-200 ${
        draggedCard === cardId ? 'opacity-50 scale-[0.98]' : ''
      } ${
        draggedCard && draggedCard !== cardId ? 'ring-2 ring-primary/20 ring-offset-2 rounded-lg' : ''
      }`}
    >
      {/* Drag Handle */}
      <div className="absolute left-2 top-3 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10">
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>
      
      {/* Drop indicator */}
      {draggedCard && draggedCard !== cardId && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/5 rounded-lg pointer-events-none z-10">
          <span className="text-xs font-medium text-primary">Drop here</span>
        </div>
      )}
      
      {children}
    </div>
  );

  // Individual Card Components
  const renderIndustryCard = () => (
    <DraggableCard cardId="industry">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 pl-5">
            <Building2 className="w-4 h-4" />
            Clients by Industry
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {clientsByIndustry.map((industry, index) => (
              <div key={industry.name} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-sm">{industry.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">{industry.value}</span>
                  <span className="text-sm text-muted-foreground w-12 text-right">{industry.percentage}%</span>
                </div>
              </div>
            ))}
            {clientsByIndustry.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
            )}
          </div>
        </CardContent>
      </Card>
    </DraggableCard>
  );

  const renderRolesCard = () => (
    <DraggableCard cardId="roles">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 pl-5">
            <Users className="w-4 h-4" />
            Contractors by Role
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {contractorsByRole.map((role, index) => (
              <div key={role.name} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-sm">{role.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">{role.value}</span>
                  <span className="text-sm text-muted-foreground w-12 text-right">{role.percentage}%</span>
                </div>
              </div>
            ))}
            {contractorsByRole.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
            )}
          </div>
        </CardContent>
      </Card>
    </DraggableCard>
  );

  const renderCountryCard = () => (
    <DraggableCard cardId="country">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 pl-5">
            <Globe className="w-4 h-4" />
            Contractors by Country
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {contractorsByCountry.map((country, index) => (
              <div key={country.name} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-sm">{country.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">{country.value}</span>
                  <span className="text-sm text-muted-foreground w-12 text-right">{country.percentage}%</span>
                </div>
              </div>
            ))}
            {contractorsByCountry.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
            )}
          </div>
        </CardContent>
      </Card>
    </DraggableCard>
  );

  const renderMonthlyHiresCard = () => (
    <DraggableCard cardId="monthlyHires">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 pl-5">
            <TrendingUp className="w-4 h-4" />
            Hires per Month
            <span className="text-xs text-muted-foreground font-normal">(2026+)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyStats}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" angle={-45} textAnchor="end" height={60} />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))' 
                  }} 
                />
                <Bar dataKey="hires" fill="#22c55e" name="Hires" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </DraggableCard>
  );

  const renderSeparationsCard = () => (
    <DraggableCard cardId="separations">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 pl-5">
            <TrendingDown className="w-4 h-4" />
            Separations per Month
            <span className="text-xs text-muted-foreground font-normal">(2026+)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyStats}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" angle={-45} textAnchor="end" height={60} />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))' 
                  }} 
                />
                <Bar dataKey="terminated" fill="#ef4444" name="Terminated" radius={[4, 4, 0, 0]} />
                <Bar dataKey="resigned" fill="#8b5cf6" name="Resigned" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[#ef4444]" />
              <span>Terminated</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[#8b5cf6]" />
              <span>Resigned</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </DraggableCard>
  );

  const renderRetentionCompanyCard = () => (
    <DraggableCard cardId="retentionCompany">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 pl-5">
            <Building2 className="w-4 h-4" />
            Retention Rate by Company
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            <div className="grid grid-cols-[1fr_60px_60px_70px] gap-2 text-xs text-muted-foreground font-medium pb-2 border-b sticky top-0 bg-background">
              <span>Company</span>
              <button 
                onClick={() => handleCompanySort('hired')} 
                className="text-right flex items-center justify-end hover:text-foreground transition-colors"
              >
                Hired
                <SortIcon field="hired" currentField={companySortField} currentDir={companySortDir} />
              </button>
              <button 
                onClick={() => handleCompanySort('active')} 
                className="text-right flex items-center justify-end hover:text-foreground transition-colors"
              >
                Active
                <SortIcon field="active" currentField={companySortField} currentDir={companySortDir} />
              </button>
              <button 
                onClick={() => handleCompanySort('retention')} 
                className="text-right flex items-center justify-end hover:text-foreground transition-colors"
              >
                Retention
                <SortIcon field="retention" currentField={companySortField} currentDir={companySortDir} />
              </button>
            </div>
            {retentionByCompany.map((company) => (
              <div key={company.name} className="grid grid-cols-[1fr_60px_60px_70px] gap-2 items-center">
                <span className="text-sm truncate" title={company.name}>{company.name}</span>
                <span className="text-sm text-right">{company.hired}</span>
                <span className="text-sm text-right">{company.active}</span>
                <span className={`text-sm font-medium text-right ${
                  company.retention >= 80 ? 'text-green-600' : 
                  company.retention >= 50 ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {company.retention}%
                </span>
              </div>
            ))}
            {retentionByCompany.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
            )}
          </div>
        </CardContent>
      </Card>
    </DraggableCard>
  );

  const renderRetentionIndustryCard = () => (
    <DraggableCard cardId="retentionIndustry">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 pl-5">
            <Building2 className="w-4 h-4" />
            Retention Rate by Industry
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            <div className="grid grid-cols-[1fr_60px_60px_70px] gap-2 text-xs text-muted-foreground font-medium pb-2 border-b sticky top-0 bg-background">
              <span>Industry</span>
              <button 
                onClick={() => handleIndustrySort('hired')} 
                className="text-right flex items-center justify-end hover:text-foreground transition-colors"
              >
                Hired
                <SortIcon field="hired" currentField={industrySortField} currentDir={industrySortDir} />
              </button>
              <button 
                onClick={() => handleIndustrySort('active')} 
                className="text-right flex items-center justify-end hover:text-foreground transition-colors"
              >
                Active
                <SortIcon field="active" currentField={industrySortField} currentDir={industrySortDir} />
              </button>
              <button 
                onClick={() => handleIndustrySort('retention')} 
                className="text-right flex items-center justify-end hover:text-foreground transition-colors"
              >
                Retention
                <SortIcon field="retention" currentField={industrySortField} currentDir={industrySortDir} />
              </button>
            </div>
            {retentionByIndustry.map((industry) => (
              <div key={industry.name} className="grid grid-cols-[1fr_60px_60px_70px] gap-2 items-center">
                <span className="text-sm truncate" title={industry.name}>{industry.name}</span>
                <span className="text-sm text-right">{industry.hired}</span>
                <span className="text-sm text-right">{industry.active}</span>
                <span className={`text-sm font-medium text-right ${
                  industry.retention >= 80 ? 'text-green-600' : 
                  industry.retention >= 50 ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {industry.retention}%
                </span>
              </div>
            ))}
            {retentionByIndustry.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
            )}
          </div>
        </CardContent>
      </Card>
    </DraggableCard>
  );

  const cardRenderers: Record<CardId, () => JSX.Element> = {
    industry: renderIndustryCard,
    roles: renderRolesCard,
    country: renderCountryCard,
    monthlyHires: renderMonthlyHiresCard,
    separations: renderSeparationsCard,
    retentionCompany: renderRetentionCompanyCard,
    retentionIndustry: renderRetentionIndustryCard,
  };

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
      </div>

      {/* Draggable Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {cardOrder.map((cardId) => (
          <div key={cardId}>
            {cardRenderers[cardId]()}
          </div>
        ))}
      </div>
    </div>
  );
};
