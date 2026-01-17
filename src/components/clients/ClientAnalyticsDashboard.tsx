import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Building2, TrendingUp, TrendingDown, Users, GripVertical } from 'lucide-react';
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

type SectionId = 'industryRoles' | 'monthlyHires' | 'separations' | 'retention';

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

const DEFAULT_SECTION_ORDER: SectionId[] = ['industryRoles', 'monthlyHires', 'separations', 'retention'];

const SECTION_LABELS: Record<SectionId, string> = {
  industryRoles: 'Industry & Roles',
  monthlyHires: 'Monthly Hires',
  separations: 'Separations',
  retention: 'Retention Rates',
};

export const ClientAnalyticsDashboard = () => {
  const { toast } = useToast();
  const [contractors, setContractors] = useState<ContractorData[]>([]);
  const [clients, setClients] = useState<ClientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionOrder, setSectionOrder] = useState<SectionId[]>(() => {
    const saved = localStorage.getItem('analytics-section-order');
    return saved ? JSON.parse(saved) : DEFAULT_SECTION_ORDER;
  });
  const [draggedSection, setDraggedSection] = useState<SectionId | null>(null);

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

  // Save section order to localStorage
  useEffect(() => {
    localStorage.setItem('analytics-section-order', JSON.stringify(sectionOrder));
  }, [sectionOrder]);

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

  // 3. Retention Rate per Company
  const retentionByCompany = useMemo(() => {
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
      .filter(c => c.hired >= 1)
      .sort((a, b) => b.hired - a.hired);
  }, [contractors]);

  // 4. Retention Rate per Industry
  const retentionByIndustry = useMemo(() => {
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
      }))
      .sort((a, b) => b.hired - a.hired);
  }, [contractors]);

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

  // Summary stats
  const activeContractors = contractors.filter(c => c.status === 'active').length;
  const scheduledContractors = contractors.filter(c => c.status === 'scheduled').length;
  const renderingContractors = contractors.filter(c => c.status === 'rendering').length;
  const separatedContractors = contractors.filter(c => c.status === 'terminated' || c.status === 'resigned').length;
  
  const clientsWithActiveContractors = new Set(
    contractors
      .filter(c => c.status === 'active')
      .map(c => c.client_id)
  );
  const totalActiveClients = clientsWithActiveContractors.size;
  
  const clientsWithContractors = new Set(contractors.map(c => c.client_id));
  const clientsLost = clients.filter(c => !clientsWithContractors.has(c.id) && !c.is_hiring).length;
  
  const newClientsHiring = clients.filter(c => c.is_hiring === true).length;

  // Drag and Drop handlers
  const handleDragStart = useCallback((sectionId: SectionId) => {
    setDraggedSection(sectionId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((targetSectionId: SectionId) => {
    if (!draggedSection || draggedSection === targetSectionId) {
      setDraggedSection(null);
      return;
    }

    setSectionOrder(prev => {
      const newOrder = [...prev];
      const draggedIndex = newOrder.indexOf(draggedSection);
      const targetIndex = newOrder.indexOf(targetSectionId);
      
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedSection);
      
      return newOrder;
    });
    setDraggedSection(null);
  }, [draggedSection]);

  const handleDragEnd = useCallback(() => {
    setDraggedSection(null);
  }, []);

  // Section Components
  const renderIndustryRolesSection = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
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
    </div>
  );

  const renderMonthlyHiresSection = () => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
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
  );

  const renderSeparationsSection = () => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
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
  );

  const renderRetentionSection = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Retention Rate by Company
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            <div className="grid grid-cols-[1fr_60px_60px_70px] gap-2 text-xs text-muted-foreground font-medium pb-2 border-b sticky top-0 bg-background">
              <span>Company</span>
              <span className="text-right">Hired</span>
              <span className="text-right">Active</span>
              <span className="text-right">Retention</span>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Retention Rate by Industry
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            <div className="grid grid-cols-[1fr_60px_60px_70px] gap-2 text-xs text-muted-foreground font-medium pb-2 border-b sticky top-0 bg-background">
              <span>Industry</span>
              <span className="text-right">Hired</span>
              <span className="text-right">Active</span>
              <span className="text-right">Retention</span>
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
    </div>
  );

  const sectionRenderers: Record<SectionId, () => JSX.Element> = {
    industryRoles: renderIndustryRolesSection,
    monthlyHires: renderMonthlyHiresSection,
    separations: renderSeparationsSection,
    retention: renderRetentionSection,
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
      </div>

      {/* Draggable Sections */}
      {sectionOrder.map((sectionId) => (
        <div
          key={sectionId}
          draggable
          onDragStart={() => handleDragStart(sectionId)}
          onDragOver={handleDragOver}
          onDrop={() => handleDrop(sectionId)}
          onDragEnd={handleDragEnd}
          className={`relative group transition-all duration-200 ${
            draggedSection === sectionId ? 'opacity-50 scale-[0.98]' : ''
          } ${
            draggedSection && draggedSection !== sectionId ? 'ring-2 ring-primary/20 ring-offset-2 rounded-lg' : ''
          }`}
        >
          {/* Drag Handle */}
          <div className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
            <GripVertical className="w-5 h-5 text-muted-foreground" />
          </div>
          
          {/* Section Label (visible during drag) */}
          {draggedSection && draggedSection !== sectionId && (
            <div className="absolute inset-0 flex items-center justify-center bg-primary/5 rounded-lg pointer-events-none z-10">
              <span className="text-sm font-medium text-primary">Drop here</span>
            </div>
          )}
          
          {sectionRenderers[sectionId]()}
        </div>
      ))}
    </div>
  );
};
