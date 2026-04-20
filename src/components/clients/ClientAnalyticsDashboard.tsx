// Client Analytics Dashboard
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Building2, TrendingUp, TrendingDown, Users, GripVertical, ArrowUpDown, ArrowUp, ArrowDown, Globe, UserPlus, Languages } from 'lucide-react';
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
  notes: string | null;
  applicant: {
    id: string;
    full_name: string | null;
  } | null;
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

type CardId = 'industry' | 'leadsFrom' | 'roles' | 'country' | 'monthlyHires' | 'separations' | 'retentionCompany' | 'retentionIndustry' | 'retentionRole' | 'applicationSources' | 'retentionBilingual';

type SortField = 'hired' | 'active' | 'retention';
type SortDirection = 'asc' | 'desc';

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

const DEFAULT_CARD_ORDER: CardId[] = ['industry', 'leadsFrom', 'applicationSources', 'roles', 'country', 'monthlyHires', 'separations', 'retentionBilingual', 'retentionCompany', 'retentionIndustry', 'retentionRole'];

interface ApplicationSourceData {
  name: string;
  value: number;
  percentage: number;
}

export const ClientAnalyticsDashboard = () => {
  const { toast } = useToast();
  const [contractors, setContractors] = useState<ContractorData[]>([]);
  const [clients, setClients] = useState<ClientData[]>([]);
  const [applicationSources, setApplicationSources] = useState<ApplicationSourceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [cardOrder, setCardOrder] = useState<CardId[]>(() => {
    const saved = localStorage.getItem('analytics-card-order');
    if (saved) {
      const parsed = JSON.parse(saved) as CardId[];
      // Add any new cards that aren't in the saved order
      const missingCards = DEFAULT_CARD_ORDER.filter(id => !parsed.includes(id));
      return [...parsed, ...missingCards];
    }
    return DEFAULT_CARD_ORDER;
  });
  const [draggedCard, setDraggedCard] = useState<CardId | null>(null);
  const [companySortField, setCompanySortField] = useState<SortField>('hired');
  const [companySortDir, setCompanySortDir] = useState<SortDirection>('desc');
  const [industrySortField, setIndustrySortField] = useState<SortField>('hired');
  const [industrySortDir, setIndustrySortDir] = useState<SortDirection>('desc');
  const [roleSortField, setRoleSortField] = useState<SortField>('hired');
  const [roleSortDir, setRoleSortDir] = useState<SortDirection>('desc');

  // Sort & filter for Industry and Roles cards
  type ListSortField = 'name' | 'value' | 'percentage';
  const [industryListSort, setIndustryListSort] = useState<ListSortField>('value');
  const [industryListSortDir, setIndustryListSortDir] = useState<SortDirection>('desc');
  const [industryFilter, setIndustryFilter] = useState('');
  const [roleListSort, setRoleListSort] = useState<ListSortField>('value');
  const [roleListSortDir, setRoleListSortDir] = useState<SortDirection>('desc');
  const [roleFilter, setRoleFilter] = useState('');

  const [hiringRequests, setHiringRequests] = useState<{ client_status: string; client_id: string | null; pipeline_stage: string; start_date: string | null }[]>([]);
  const [lostYearFilter, setLostYearFilter] = useState(2026);

  // Separations drill-down
  const [separationDrillDown, setSeparationDrillDown] = useState<{
    monthKey: string; // e.g. "2026-03"
    monthLabel: string; // e.g. "March 2026"
    type: 'terminated' | 'resigned';
  } | null>(null);
  const lastBarClickRef = useRef<{ key: string; time: number } | null>(null);

  const handleSeparationBarClick = useCallback(
    (data: any, type: 'terminated' | 'resigned') => {
      // Recharts passes the data point's payload directly on Bar onClick
      const payload = data?.payload || data;
      const monthKey: string | undefined = payload?.monthKey;
      const monthLabel: string | undefined = payload?.monthLabel;
      if (!monthKey || !monthLabel) return;
      const id = `${monthKey}-${type}`;
      const now = Date.now();
      const last = lastBarClickRef.current;
      if (last && last.key === id && now - last.time < 400) {
        setSeparationDrillDown({ monthKey, monthLabel, type });
        lastBarClickRef.current = null;
      } else {
        lastBarClickRef.current = { key: id, time: now };
      }
    },
    []
  );

  const fetchData = useCallback(async () => {
    try {
      const [contractorsRes, clientsRes, applicantsRes, hiringRequestsRes] = await Promise.all([
        supabase
          .from('contractor_assignments')
          .select(`*, country, notes, client:clients(id, company_name, industry), applicant:applicants_prescreen(id, full_name)`),
        supabase
          .from('clients')
          .select('id, company_name, industry, leads_from, website, notes, is_hiring'),
        supabase
          .from('applicants_prescreen')
          .select('job_source, full_name, job_title, email')
          .neq('job_source', 'Contractor Import'),
        supabase
          .from('client_hiring_requests')
          .select('client_status, client_id, pipeline_stage, start_date'),
      ]);

      if (contractorsRes.error) throw contractorsRes.error;
      if (clientsRes.error) throw clientsRes.error;

      setContractors(contractorsRes.data || []);
      setClients(clientsRes.data || []);
      setHiringRequests(hiringRequestsRes.data || []);

      // Calculate application source stats with deduplication
      if (!applicantsRes.error && applicantsRes.data) {
        // Deduplicate by email + job_title OR name + job_title combination
        const seenByEmail = new Set<string>();
        const seenByName = new Set<string>();
        const uniqueApplicants: typeof applicantsRes.data = [];
        
        applicantsRes.data.forEach(applicant => {
          const normalizedEmail = (applicant.email || '').toLowerCase().trim();
          const normalizedName = (applicant.full_name || '').toLowerCase().trim();
          const normalizedRole = (applicant.job_title || '').toLowerCase().trim();
          
          const emailKey = normalizedEmail ? `${normalizedEmail}|${normalizedRole}` : '';
          const nameKey = `${normalizedName}|${normalizedRole}`;
          
          // Check if already seen by email or name for the same role
          const isDuplicateByEmail = emailKey && seenByEmail.has(emailKey);
          const isDuplicateByName = seenByName.has(nameKey);
          
          if (!isDuplicateByEmail && !isDuplicateByName) {
            if (emailKey) seenByEmail.add(emailKey);
            seenByName.add(nameKey);
            uniqueApplicants.push(applicant);
          }
        });

        const sourceCounts = new Map<string, number>();
        
        uniqueApplicants.forEach(applicant => {
          let source = applicant.job_source || 'Not specified';
          // Normalize source names
          if (source.toLowerCase().startsWith('other:')) {
            source = source.substring(6).trim() || 'Other';
          }
          sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
        });

        const totalApplicants = uniqueApplicants.length;
        const sourceData: ApplicationSourceData[] = Array.from(sourceCounts.entries())
          .map(([name, value]) => ({
            name,
            value,
            percentage: totalApplicants > 0 ? Math.round((value / totalApplicants) * 100) : 0,
          }))
          .sort((a, b) => b.value - a.value);

        setApplicationSources(sourceData);
      }
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

    const hiringRequestsChannel = supabase
      .channel('analytics-hiring-requests')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'client_hiring_requests' },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(contractorsChannel);
      supabase.removeChannel(clientsChannel);
      supabase.removeChannel(hiringRequestsChannel);
    };
  }, [fetchData]);

  // Save card order to localStorage
  useEffect(() => {
    localStorage.setItem('analytics-card-order', JSON.stringify(cardOrder));
  }, [cardOrder]);

  // Get set of active client IDs (clients with 1+ active contractors)
  const activeClientIds = useMemo(() => {
    const ids = new Set<string>();
    contractors.forEach(c => {
      if (c.status === 'active' && c.client_id) {
        ids.add(c.client_id);
      }
    });
    return ids;
  }, [contractors]);

  // 1. Clients per Industry - ONLY active clients (with 1+ active contractors)
  const clientsByIndustry = useMemo(() => {
    const activeClients = clients.filter(c => activeClientIds.has(c.id));
    const industryMap: Record<string, number> = {};
    activeClients.forEach(c => {
      const industry = c.industry || 'Unknown';
      industryMap[industry] = (industryMap[industry] || 0) + 1;
    });
    const total = activeClients.length;
    return Object.entries(industryMap)
      .map(([name, value]) => ({ 
        name, 
        value, 
        percentage: total > 0 ? Math.round((value / total) * 100) : 0 
      }))
      .sort((a, b) => b.value - a.value);
  }, [clients, activeClientIds]);

  // Clients by Lead Source - ONLY active clients (with 1+ active contractors)
  const clientsByLeadsFrom = useMemo(() => {
    const activeClients = clients.filter(c => activeClientIds.has(c.id));
    const leadsMap: Record<string, number> = {};
    activeClients.forEach(c => {
      const source = c.leads_from || 'Unknown';
      leadsMap[source] = (leadsMap[source] || 0) + 1;
    });
    const total = activeClients.length;
    return Object.entries(leadsMap)
      .map(([name, value]) => ({ 
        name, 
        value, 
        percentage: total > 0 ? Math.round((value / total) * 100) : 0 
      }))
      .sort((a, b) => b.value - a.value);
  }, [clients, activeClientIds]);

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
        const fullMonthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        return {
          month: `${monthNames[parseInt(m) - 1]} ${year.slice(2)}`,
          monthKey: month,
          monthLabel: `${fullMonthNames[parseInt(m) - 1]} ${year}`,
          ...counts,
        };
      });
  }, [contractors]);

  // Compute drill-down rows from contractors when a separation cell is clicked
  const separationDrillDownRows = useMemo(() => {
    if (!separationDrillDown) return [];
    const { monthKey, type } = separationDrillDown;
    return contractors
      .filter((c) => c.status === type)
      .map((c) => {
        const dateStr = c.end_date || c.start_date;
        if (!dateStr) return null;
        const d = new Date(dateStr);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (key !== monthKey) return null;
        return {
          id: c.id,
          name: c.applicant?.full_name || '—',
          type,
          date: dateStr,
          department: c.client?.company_name || c.job_title || '—',
          jobTitle: c.job_title || '—',
          notes: c.notes || '',
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [separationDrillDown, contractors]);

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

  // Retention Rate per Role (raw data without sorting)
  const retentionByRoleRaw = useMemo(() => {
    const roleStats: Record<string, { total: number; active: number }> = {};
    
    contractors.forEach(c => {
      const role = c.job_title || 'Unknown';
      if (!roleStats[role]) {
        roleStats[role] = { total: 0, active: 0 };
      }
      roleStats[role].total += 1;
      if (c.status === 'active') {
        roleStats[role].active += 1;
      }
    });

    return Object.entries(roleStats)
      .map(([name, stats]) => ({
        name,
        hired: stats.total,
        active: stats.active,
        retention: stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0,
      }));
  }, [contractors]);

  // Apply sorting to role retention
  const retentionByRole = useMemo(() => {
    return [...retentionByRoleRaw].sort((a, b) => {
      const multiplier = roleSortDir === 'asc' ? 1 : -1;
      return (a[roleSortField] - b[roleSortField]) * multiplier;
    });
  }, [retentionByRoleRaw, roleSortField, roleSortDir]);

  // Bilingual vs Non-Bilingual Retention
  // Logic: NOT from Philippines = bilingual. From Philippines = check if job_title contains "bilingual"
  const retentionByBilingual = useMemo(() => {
    const isPH = (country: string | null) => {
      if (!country) return true; // default to PH if unknown
      const c = country.toLowerCase().trim();
      return c === 'philippines' || c === 'ph' || c === 'the philippines';
    };
    
    const isBilingual = (contractor: ContractorData) => {
      if (!isPH(contractor.country)) return true; // non-PH = bilingual
      const title = (contractor.job_title || '').toLowerCase();
      return title.includes('bilingual');
    };

    const stats = { bilingual: { total: 0, active: 0 }, nonBilingual: { total: 0, active: 0 } };
    
    contractors.forEach(c => {
      const group = isBilingual(c) ? 'bilingual' : 'nonBilingual';
      stats[group].total += 1;
      if (c.status === 'active') {
        stats[group].active += 1;
      }
    });

    return [
      {
        name: 'Bilingual',
        hired: stats.bilingual.total,
        active: stats.bilingual.active,
        separated: stats.bilingual.total - stats.bilingual.active,
        retention: stats.bilingual.total > 0 ? Math.round((stats.bilingual.active / stats.bilingual.total) * 100) : 0,
      },
      {
        name: 'Non-Bilingual (PH)',
        hired: stats.nonBilingual.total,
        active: stats.nonBilingual.active,
        separated: stats.nonBilingual.total - stats.nonBilingual.active,
        retention: stats.nonBilingual.total > 0 ? Math.round((stats.nonBilingual.active / stats.nonBilingual.total) * 100) : 0,
      },
    ];
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

  // 6. Contractors by Country (active only)
  const contractorsByCountry = useMemo(() => {
    const activeContractorsList = contractors.filter(c => c.status === 'active');
    const countryMap: Record<string, number> = {};
    activeContractorsList.forEach(c => {
      const country = c.country || 'Unknown';
      countryMap[country] = (countryMap[country] || 0) + 1;
    });
    const total = activeContractorsList.length;
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
  
  // Build contractor count per client
  const contractorCountByClient = contractors
    .filter(c => c.status === 'active')
    .reduce((acc, c) => {
      acc[c.client_id] = (acc[c.client_id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  
  // Pipeline stages that count as "actively hiring"
  const ACTIVE_HIRING_STAGES = ['sourcing', 'pitch', 'scheduled_interview'];
  
  // Get unique client IDs that have hiring requests in active stages
  const clientsWithActiveHiringRequests = new Set(
    hiringRequests
      .filter(req => req.client_id && ACTIVE_HIRING_STAGES.includes(req.pipeline_stage))
      .map(req => req.client_id!)
  );
  
  // Clients lost = unique clients with hiring requests in lost stages, filtered by year based on start_date
  // If start_date is empty, default to 2025
  const LOST_STAGES = ['lost_client', 'lost_outsta'];
  const lostRequests = hiringRequests.filter(req => 
    req.client_id && LOST_STAGES.includes(req.pipeline_stage)
  );
  const lostRequestsForYear = lostRequests.filter(req => {
    const year = req.start_date ? new Date(req.start_date).getFullYear() : 2025;
    return year === lostYearFilter;
  });
  const clientsInLostStages = new Set(lostRequestsForYear.map(req => req.client_id!));
  const clientsLost = clientsInLostStages.size;
  
  // Count hiring clients based on having requests in active pipeline stages
  const newClientsHiring = clients.filter(c => 
    clientsWithActiveHiringRequests.has(c.id) && (contractorCountByClient[c.id] || 0) === 0
  ).length;
  const existingClientsHiring = clients.filter(c => 
    clientsWithActiveHiringRequests.has(c.id) && (contractorCountByClient[c.id] || 0) > 0
  ).length;

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

  const handleRoleSort = (field: SortField) => {
    if (roleSortField === field) {
      setRoleSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setRoleSortField(field);
      setRoleSortDir('desc');
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

  // Helper to sort & filter list data
  const sortAndFilterList = (
    data: { name: string; value: number; percentage: number }[],
    filter: string,
    sortField: ListSortField,
    sortDir: SortDirection
  ) => {
    let filtered = data;
    if (filter.trim()) {
      const q = filter.toLowerCase();
      filtered = data.filter(d => d.name.toLowerCase().includes(q));
    }
    return [...filtered].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortField === 'name') return a.name.localeCompare(b.name) * dir;
      return (a[sortField] - b[sortField]) * dir;
    });
  };

  const toggleListSort = (
    field: ListSortField,
    current: ListSortField,
    setField: (f: ListSortField) => void,
    currentDir: SortDirection,
    setDir: (d: SortDirection) => void
  ) => {
    if (current === field) {
      setDir(currentDir === 'asc' ? 'desc' : 'asc');
    } else {
      setField(field);
      setDir(field === 'name' ? 'asc' : 'desc');
    }
  };

  const ListSortButton = ({ field, label, current, currentDir, onClick }: { field: ListSortField; label: string; current: ListSortField; currentDir: SortDirection; onClick: () => void }) => (
    <button onClick={onClick} className="flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors">
      {label}
      {current === field ? (
        currentDir === 'asc' ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />
      ) : (
        <ArrowUpDown className="w-3 h-3 ml-1 opacity-50" />
      )}
    </button>
  );

  const filteredIndustries = useMemo(() => sortAndFilterList(clientsByIndustry, industryFilter, industryListSort, industryListSortDir), [clientsByIndustry, industryFilter, industryListSort, industryListSortDir]);
  const filteredRoles = useMemo(() => sortAndFilterList(contractorsByRole, roleFilter, roleListSort, roleListSortDir), [contractorsByRole, roleFilter, roleListSort, roleListSortDir]);

  // Individual Card Components
  const renderIndustryCard = () => (
    <DraggableCard cardId="industry">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 pl-5">
            <Building2 className="w-4 h-4" />
            Clients by Industry
          </CardTitle>
          <div className="flex items-center gap-2 pl-5 pt-1">
            <input
              type="text"
              placeholder="Filter industries..."
              value={industryFilter}
              onChange={e => setIndustryFilter(e.target.value)}
              className="h-7 text-xs px-2 rounded border border-border bg-background text-foreground placeholder:text-muted-foreground w-full max-w-[180px] focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex items-center gap-1.5 ml-auto">
              <ListSortButton field="name" label="Name" current={industryListSort} currentDir={industryListSortDir} onClick={() => toggleListSort('name', industryListSort, setIndustryListSort, industryListSortDir, setIndustryListSortDir)} />
              <ListSortButton field="value" label="Count" current={industryListSort} currentDir={industryListSortDir} onClick={() => toggleListSort('value', industryListSort, setIndustryListSort, industryListSortDir, setIndustryListSortDir)} />
              <ListSortButton field="percentage" label="%" current={industryListSort} currentDir={industryListSortDir} onClick={() => toggleListSort('percentage', industryListSort, setIndustryListSort, industryListSortDir, setIndustryListSortDir)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {filteredIndustries.map((industry, index) => (
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
            {filteredIndustries.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">{industryFilter ? 'No matches' : 'No data available'}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </DraggableCard>
  );

  const renderRolesCard = () => (
    <DraggableCard cardId="roles">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 pl-5">
            <Users className="w-4 h-4" />
            Contractors by Role
          </CardTitle>
          <div className="flex items-center gap-2 pl-5 pt-1">
            <input
              type="text"
              placeholder="Filter roles..."
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="h-7 text-xs px-2 rounded border border-border bg-background text-foreground placeholder:text-muted-foreground w-full max-w-[180px] focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex items-center gap-1.5 ml-auto">
              <ListSortButton field="name" label="Name" current={roleListSort} currentDir={roleListSortDir} onClick={() => toggleListSort('name', roleListSort, setRoleListSort, roleListSortDir, setRoleListSortDir)} />
              <ListSortButton field="value" label="Count" current={roleListSort} currentDir={roleListSortDir} onClick={() => toggleListSort('value', roleListSort, setRoleListSort, roleListSortDir, setRoleListSortDir)} />
              <ListSortButton field="percentage" label="%" current={roleListSort} currentDir={roleListSortDir} onClick={() => toggleListSort('percentage', roleListSort, setRoleListSort, roleListSortDir, setRoleListSortDir)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {filteredRoles.map((role, index) => (
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
            {filteredRoles.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">{roleFilter ? 'No matches' : 'No data available'}</p>
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
                <Bar
                  dataKey="terminated"
                  fill="#ef4444"
                  name="Terminated"
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  onClick={(data: any) => handleSeparationBarClick(data, 'terminated')}
                />
                <Bar
                  dataKey="resigned"
                  fill="#8b5cf6"
                  name="Resigned"
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  onClick={(data: any) => handleSeparationBarClick(data, 'resigned')}
                />
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

  const renderRetentionRoleCard = () => (
    <DraggableCard cardId="retentionRole">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 pl-5">
            <Users className="w-4 h-4" />
            Retention Rate by Role
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            <div className="grid grid-cols-[1fr_60px_60px_70px] gap-2 text-xs text-muted-foreground font-medium pb-2 border-b sticky top-0 bg-background">
              <span>Role</span>
              <button 
                onClick={() => handleRoleSort('hired')} 
                className="text-right flex items-center justify-end hover:text-foreground transition-colors"
              >
                Hired
                <SortIcon field="hired" currentField={roleSortField} currentDir={roleSortDir} />
              </button>
              <button 
                onClick={() => handleRoleSort('active')} 
                className="text-right flex items-center justify-end hover:text-foreground transition-colors"
              >
                Active
                <SortIcon field="active" currentField={roleSortField} currentDir={roleSortDir} />
              </button>
              <button 
                onClick={() => handleRoleSort('retention')} 
                className="text-right flex items-center justify-end hover:text-foreground transition-colors"
              >
                Retention
                <SortIcon field="retention" currentField={roleSortField} currentDir={roleSortDir} />
              </button>
            </div>
            {retentionByRole.map((role) => (
              <div key={role.name} className="grid grid-cols-[1fr_60px_60px_70px] gap-2 items-center">
                <span className="text-sm truncate" title={role.name}>{role.name}</span>
                <span className="text-sm text-right">{role.hired}</span>
                <span className="text-sm text-right">{role.active}</span>
                <span className={`text-sm font-medium text-right ${
                  role.retention >= 80 ? 'text-green-600' : 
                  role.retention >= 50 ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {role.retention}%
                </span>
              </div>
            ))}
            {retentionByRole.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
            )}
          </div>
        </CardContent>
      </Card>
    </DraggableCard>
  );

  const renderLeadsFromCard = () => (
    <DraggableCard cardId="leadsFrom">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 pl-5">
            <TrendingUp className="w-4 h-4" />
            Clients by Lead Source
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {clientsByLeadsFrom.map((source, index) => (
              <div key={source.name} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-sm truncate" title={source.name}>{source.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">{source.value}</span>
                  <span className="text-sm text-muted-foreground w-12 text-right">{source.percentage}%</span>
                </div>
              </div>
            ))}
            {clientsByLeadsFrom.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
            )}
          </div>
        </CardContent>
      </Card>
    </DraggableCard>
  );

  const renderApplicationSourcesCard = () => (
    <DraggableCard cardId="applicationSources">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 pl-5">
            <UserPlus className="w-4 h-4" />
            Applicant Sources
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {applicationSources.map((source, index) => (
              <div key={source.name} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-sm truncate" title={source.name}>{source.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">{source.value}</span>
                  <span className="text-sm text-muted-foreground w-12 text-right">{source.percentage}%</span>
                </div>
              </div>
            ))}
            {applicationSources.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
            )}
          </div>
        </CardContent>
      </Card>
    </DraggableCard>
  );

  const renderRetentionBilingualCard = () => (
    <DraggableCard cardId="retentionBilingual">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 pl-5">
            <Languages className="w-4 h-4" />
            Retention: Bilingual vs Non-Bilingual
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {retentionByBilingual.map((group) => (
              <div key={group.name} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{group.name}</span>
                  <span className={`text-lg font-bold ${
                    group.retention >= 80 ? 'text-green-600' : 
                    group.retention >= 50 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {group.retention}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5">
                  <div 
                    className={`h-2.5 rounded-full ${
                      group.retention >= 80 ? 'bg-green-500' : 
                      group.retention >= 50 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${group.retention}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Hired: {group.hired}</span>
                  <span>Active: {group.active}</span>
                  <span>Separated: {group.separated}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-4">
            Non-PH contractors and PH contractors with "Bilingual" in title are counted as Bilingual.
          </p>
        </CardContent>
      </Card>
    </DraggableCard>
  );

  const cardRenderers: Record<CardId, () => JSX.Element> = {
    industry: renderIndustryCard,
    leadsFrom: renderLeadsFromCard,
    applicationSources: renderApplicationSourcesCard,
    roles: renderRolesCard,
    country: renderCountryCard,
    monthlyHires: renderMonthlyHiresCard,
    separations: renderSeparationsCard,
    retentionBilingual: renderRetentionBilingualCard,
    retentionCompany: renderRetentionCompanyCard,
    retentionIndustry: renderRetentionIndustryCard,
    retentionRole: renderRetentionRoleCard,
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
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <UserPlus className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{newClientsHiring || 0}</p>
                <p className="text-sm text-muted-foreground">New Client (Hiring)</p>
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
                <p className="text-2xl font-bold">{existingClientsHiring || 0}</p>
                <p className="text-sm text-muted-foreground">Existing Client (Hiring)</p>
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
                <div className="flex items-center gap-2">
                  <select
                    value={lostYearFilter}
                    onChange={(e) => setLostYearFilter(Number(e.target.value))}
                    className="text-xs border rounded px-1 py-0.5 bg-background"
                  >
                    <option value={2025}>2025</option>
                    <option value={2026}>2026</option>
                  </select>
                  <p className="text-sm text-muted-foreground">Clients Lost</p>
                </div>
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

      {/* Separations drill-down dialog */}
      <Dialog
        open={!!separationDrillDown}
        onOpenChange={(open) => !open && setSeparationDrillDown(null)}
      >
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {separationDrillDown && (
                <>
                  <span>{separationDrillDown.monthLabel}</span>
                  <span className="text-muted-foreground">—</span>
                  <Badge
                    variant="outline"
                    className={
                      separationDrillDown.type === 'terminated'
                        ? 'border-red-500/50 text-red-600 bg-red-500/10'
                        : 'border-purple-500/50 text-purple-600 bg-purple-500/10'
                    }
                  >
                    {separationDrillDown.type === 'terminated' ? 'Terminated' : 'Resigned'}
                  </Badge>
                  <span className="text-sm font-normal text-muted-foreground">
                    ({separationDrillDownRows.length})
                  </span>
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto -mx-1 px-1">
            {separationDrillDownRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No records found for this month.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Separation Date</TableHead>
                    <TableHead>Department / Client</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {separationDrillDownRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            row.type === 'terminated'
                              ? 'border-red-500/50 text-red-600 bg-red-500/10'
                              : 'border-purple-500/50 text-purple-600 bg-purple-500/10'
                          }
                        >
                          {row.type === 'terminated' ? 'Terminated' : 'Resigned'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(row.date).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{row.department}</span>
                          {row.jobTitle && row.jobTitle !== row.department && (
                            <span className="text-xs text-muted-foreground">{row.jobTitle}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[260px] whitespace-pre-wrap text-muted-foreground">
                        {row.notes || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
