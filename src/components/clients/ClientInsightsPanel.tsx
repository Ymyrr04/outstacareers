import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Building2, Briefcase, Megaphone, ChevronDown, ChevronUp, Download, ShieldCheck } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { type Client, type ContractorAssignment } from './ClientsDashboard';
import { parseDateOnly } from '@/lib/dateOnly';

interface HiringRequestBasic {
  id?: string;
  client_id: string | null;
  client_status: string;
  job_title: string;
  pipeline_stage: string;
  start_date: string | null;
  industry?: string | null;
  closed_at?: string | null;
}

interface ClientInsightsPanelProps {
  clients: Client[];
  contractors: { client_id: string; start_date: string | null; status: string | null }[];
  hiringRequests: HiringRequestBasic[];
}

export const ClientInsightsPanel = ({ clients, contractors, hiringRequests }: ClientInsightsPanelProps) => {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const currentYear = new Date().getFullYear();
  const [onboardedYear, setOnboardedYear] = useState<number>(currentYear);
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const [placementsFrom, setPlacementsFrom] = useState<string>(threeMonthsAgo.toISOString().split('T')[0]);
  const [placementsTo, setPlacementsTo] = useState<string>(new Date().toISOString().split('T')[0]);
  const [sourceYear, setSourceYear] = useState<number>(currentYear);
  const [retentionYear, setRetentionYear] = useState<number>(currentYear);

  // 1. New clients onboarded by industry (based on earliest contractor start_date per client)
  const clientOnboardedByIndustry = useMemo(() => {
    // Find earliest contractor start_date per client
    const earliestByClient: Record<string, string> = {};
    contractors.forEach(c => {
      if (!c.start_date) return;
      if (!earliestByClient[c.client_id] || c.start_date < earliestByClient[c.client_id]) {
        earliestByClient[c.client_id] = c.start_date;
      }
    });

    // Filter clients whose earliest start_date falls in selected year
    const clientsMap = new Map(clients.map(c => [c.id, c]));
    const byIndustry: Record<string, string[]> = {};

    Object.entries(earliestByClient).forEach(([clientId, startDate]) => {
      const year = new Date(startDate).getFullYear();
      if (year !== onboardedYear) return;
      const client = clientsMap.get(clientId);
      if (!client) return;
      const industry = client.industry || 'Unknown';
      if (!byIndustry[industry]) byIndustry[industry] = [];
      byIndustry[industry].push(client.company_name);
    });

    return Object.entries(byIndustry)
      .sort((a, b) => b[1].length - a[1].length);
  }, [clients, contractors, onboardedYear]);

  const totalOnboarded = clientOnboardedByIndustry.reduce((sum, [, list]) => sum + list.length, 0);

  // 2. Roles filled by industry (closed hiring requests in past N months)
  const rolesByIndustry = useMemo(() => {
    const fromDate = new Date(placementsFrom);
    const toDate = new Date(placementsTo);
    toDate.setHours(23, 59, 59, 999);

    const byIndustry: Record<string, string[]> = {};

    hiringRequests.forEach(r => {
      if (r.pipeline_stage !== 'closed' || !r.closed_at) return;
      const closedDate = new Date(r.closed_at);
      if (closedDate < fromDate || closedDate > toDate) return;
      const industry = r.industry || 'Unknown';
      if (!byIndustry[industry]) byIndustry[industry] = [];
      byIndustry[industry].push(r.job_title);
    });

    return Object.entries(byIndustry)
      .sort((a, b) => b[1].length - a[1].length);
  }, [hiringRequests, placementsFrom, placementsTo]);

  const totalPlaced = rolesByIndustry.reduce((sum, [, list]) => sum + list.length, 0);

  // 3. Client source/marketing (based on earliest contractor start_date year + leads_from)
  const clientsBySource = useMemo(() => {
    const earliestByClient: Record<string, string> = {};
    contractors.forEach(c => {
      if (!c.start_date) return;
      if (!earliestByClient[c.client_id] || c.start_date < earliestByClient[c.client_id]) {
        earliestByClient[c.client_id] = c.start_date;
      }
    });

    const clientsMap = new Map(clients.map(c => [c.id, c]));
    const bySource: Record<string, string[]> = {};

    Object.entries(earliestByClient).forEach(([clientId, startDate]) => {
      const year = new Date(startDate).getFullYear();
      if (year !== sourceYear) return;
      const client = clientsMap.get(clientId);
      if (!client) return;
      const source = client.leads_from || 'Unknown';
      if (!bySource[source]) bySource[source] = [];
      bySource[source].push(client.company_name);
    });

    return Object.entries(bySource)
      .sort((a, b) => b[1].length - a[1].length);
  }, [clients, contractors, sourceYear]);

  const totalFromSource = clientsBySource.reduce((sum, [, list]) => sum + list.length, 0);

  // 4. Retention rate by industry and client
  const retentionData = useMemo(() => {
    const clientsMap = new Map(clients.map(c => [c.id, c]));
    const industryStats: Record<string, { active: number; total: number; clients: Record<string, { active: number; total: number }> }> = {};
    
    // Filter contractors whose start_date falls in the selected year
    const filtered = contractors.filter(c => {
      if (!c.start_date) return false;
      return parseDateOnly(c.start_date).getFullYear() === retentionYear;
    });

    filtered.forEach(c => {
      const client = clientsMap.get(c.client_id);
      if (!client) return;
      const industry = client.industry || 'Unknown';
      if (!industryStats[industry]) industryStats[industry] = { active: 0, total: 0, clients: {} };
      if (!industryStats[industry].clients[client.company_name]) {
        industryStats[industry].clients[client.company_name] = { active: 0, total: 0 };
      }
      industryStats[industry].total++;
      industryStats[industry].clients[client.company_name].total++;
      if (c.status === 'active') {
        industryStats[industry].active++;
        industryStats[industry].clients[client.company_name].active++;
      }
    });

    return Object.entries(industryStats)
      .map(([industry, stats]) => ({
        industry,
        active: stats.active,
        total: stats.total,
        rate: stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0,
        clients: Object.entries(stats.clients)
          .map(([name, s]) => ({ name, active: s.active, total: s.total, rate: s.total > 0 ? Math.round((s.active / s.total) * 100) : 0 }))
          .sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => b.total - a.total);
  }, [clients, contractors, retentionYear]);

  const retentionFiltered = useMemo(() => {
    return contractors.filter(c => c.start_date && parseDateOnly(c.start_date).getFullYear() === retentionYear);
  }, [contractors, retentionYear]);

  const overallRetention = useMemo(() => {
    const totalAll = retentionFiltered.length;
    const activeAll = retentionFiltered.filter(c => c.status === 'active').length;
    return totalAll > 0 ? Math.round((activeAll / totalAll) * 100) : 0;
  }, [retentionFiltered]);

  const toggle = (section: string) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  const { toast } = useToast();

  const handleExport = useCallback(() => {
    const rows: string[][] = [];
    
    // Section 1: New Clients Onboarded
    const maxOnboarded = Math.max(...clientOnboardedByIndustry.map(([, c]) => c.length), 0);
    rows.push([`New Clients Onboarded (${onboardedYear})`, '', ...Array(maxOnboarded).fill('')]);
    rows.push(['Industry', 'Count', ...Array.from({ length: maxOnboarded }, (_, i) => `Company ${i + 1}`)]);
    clientOnboardedByIndustry.forEach(([industry, companies]) => {
      rows.push([industry, companies.length.toString(), ...companies, ...Array(maxOnboarded - companies.length).fill('')]);
    });
    rows.push([`Total`, totalOnboarded.toString(), ...Array(maxOnboarded).fill('')]);
    rows.push(['', '', ...Array(maxOnboarded).fill('')]);

    // Section 2: Roles Filled
    const maxRoles = Math.max(...rolesByIndustry.map(([, roles]) => roles.length), 0);
    rows.push([`Roles Filled (${placementsFrom} to ${placementsTo})`, '', ...Array(maxRoles).fill('')]);
    rows.push(['Industry', 'Count', ...Array.from({ length: maxRoles }, (_, i) => `Role ${i + 1}`)]);
    rolesByIndustry.forEach(([industry, roles]) => {
      rows.push([industry, roles.length.toString(), ...roles, ...Array(maxRoles - roles.length).fill('')]);
    });
    rows.push([`Total`, totalPlaced.toString(), ...Array(maxRoles).fill('')]);
    rows.push(['', '', '']);

    // Section 3: Client Sources
    const maxSources = Math.max(...clientsBySource.map(([, c]) => c.length), 0);
    rows.push([`Client Sources (${sourceYear})`, '', ...Array(maxSources).fill('')]);
    rows.push(['Source', 'Count', ...Array.from({ length: maxSources }, (_, i) => `Company ${i + 1}`)]);
    clientsBySource.forEach(([source, companies]) => {
      rows.push([source, companies.length.toString(), ...companies, ...Array(maxSources - companies.length).fill('')]);
    });
    rows.push([`Total`, totalFromSource.toString(), ...Array(maxSources).fill('')]);
    rows.push(['', '', '']);

    // Section 4: Retention Rate
    rows.push([`Retention Rate (${retentionYear})`, '', '', '', '']);
    rows.push(['Industry', 'Client', 'Active', 'Total', 'Rate']);
    retentionData.forEach(ind => {
      rows.push([ind.industry, '', ind.active.toString(), ind.total.toString(), `${ind.rate}%`]);
      ind.clients.forEach(cl => {
        rows.push(['', cl.name, cl.active.toString(), cl.total.toString(), `${cl.rate}%`]);
      });
    });
    rows.push(['Overall', '', retentionFiltered.filter(c => c.status === 'active').length.toString(), retentionFiltered.length.toString(), `${overallRetention}%`]);

    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `client-insights-${onboardedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({ title: 'Exported', description: 'Client insights downloaded as CSV' });
  }, [clientOnboardedByIndustry, rolesByIndustry, clientsBySource, retentionData, retentionFiltered, totalOnboarded, totalPlaced, totalFromSource, overallRetention, onboardedYear, placementsFrom, placementsTo, sourceYear, retentionYear, toast]);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={handleExport} className="text-xs gap-1.5 text-muted-foreground">
          <Download className="w-3.5 h-3.5" />
          Export Insights
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* New Clients Onboarded by Industry */}
      <Card
        className={cn(
          "cursor-pointer transition-all hover:shadow-md",
          expandedSection === 'onboarded' && "ring-2 ring-primary/40"
        )}
        onClick={() => toggle('onboarded')}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-500/10 rounded-lg">
                <Building2 className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-sm font-medium">New Clients Onboarded</span>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={onboardedYear.toString()}
                onValueChange={(v) => setOnboardedYear(parseInt(v))}
              >
                <SelectTrigger
                  className="h-6 w-[60px] text-[10px] px-1.5"
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
              {expandedSection === 'onboarded' ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </div>
          <p className="text-2xl font-bold">{totalOnboarded}</p>
          {expandedSection === 'onboarded' && clientOnboardedByIndustry.length > 0 && (
            <div className="mt-3 pt-3 border-t space-y-3">
              {clientOnboardedByIndustry.map(([industry, companyNames]) => (
                <div key={industry}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">{industry}</span>
                    <Badge variant="secondary" className="text-[10px] py-0 ml-2">{companyNames.length}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {companyNames.map((name, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] py-0">{name}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {expandedSection !== 'onboarded' && clientOnboardedByIndustry.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {clientOnboardedByIndustry.slice(0, 3).map(([industry, list]) => (
                <Badge key={industry} variant="outline" className="text-[10px] py-0">
                  {industry} ({list.length})
                </Badge>
              ))}
              {clientOnboardedByIndustry.length > 3 && (
                <Badge variant="outline" className="text-[10px] py-0">
                  +{clientOnboardedByIndustry.length - 3}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Roles Filled by Industry */}
      <Card
        className={cn(
          "cursor-pointer transition-all hover:shadow-md",
          expandedSection === 'placements' && "ring-2 ring-primary/40"
        )}
        onClick={() => toggle('placements')}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-green-500/10 rounded-lg">
                <Briefcase className="w-4 h-4 text-green-600" />
              </div>
              <span className="text-sm font-medium">Roles Filled</span>
            </div>
            <div className="flex items-center gap-1">
              <Input
                type="date"
                value={placementsFrom}
                onChange={(e) => setPlacementsFrom(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="h-6 w-[110px] text-[10px] px-1.5"
              />
              <span className="text-[10px] text-muted-foreground">–</span>
              <Input
                type="date"
                value={placementsTo}
                onChange={(e) => setPlacementsTo(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="h-6 w-[110px] text-[10px] px-1.5"
              />
              {expandedSection === 'placements' ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </div>
          <p className="text-2xl font-bold">{totalPlaced}</p>
          {expandedSection === 'placements' && rolesByIndustry.length > 0 && (
            <div className="mt-3 pt-3 border-t space-y-2">
              {rolesByIndustry.map(([industry, roles]) => (
                <div key={industry}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{industry}</span>
                    <Badge variant="secondary" className="text-[10px] py-0">{roles.length}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {roles.slice(0, 3).map((role, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] py-0">{role}</Badge>
                    ))}
                    {roles.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">+{roles.length - 3} more</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {expandedSection !== 'placements' && rolesByIndustry.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {rolesByIndustry.slice(0, 3).map(([industry, list]) => (
                <Badge key={industry} variant="outline" className="text-[10px] py-0">
                  {industry} ({list.length})
                </Badge>
              ))}
              {rolesByIndustry.length > 3 && (
                <Badge variant="outline" className="text-[10px] py-0">
                  +{rolesByIndustry.length - 3}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Client Source / Marketing */}
      <Card
        className={cn(
          "cursor-pointer transition-all hover:shadow-md",
          expandedSection === 'source' && "ring-2 ring-primary/40"
        )}
        onClick={() => toggle('source')}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-500/10 rounded-lg">
                <Megaphone className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-sm font-medium">Client Sources</span>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={sourceYear.toString()}
                onValueChange={(v) => setSourceYear(parseInt(v))}
              >
                <SelectTrigger
                  className="h-6 w-[60px] text-[10px] px-1.5"
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
              {expandedSection === 'source' ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </div>
          <p className="text-2xl font-bold">{totalFromSource}</p>
          {expandedSection === 'source' && clientsBySource.length > 0 && (
            <div className="mt-3 pt-3 border-t space-y-3">
              {clientsBySource.map(([source, companyNames]) => (
                <div key={source}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">{source}</span>
                    <Badge variant="secondary" className="text-[10px] py-0 ml-2">{companyNames.length}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {companyNames.map((name, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] py-0">{name}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {expandedSection !== 'source' && clientsBySource.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {clientsBySource.slice(0, 3).map(([source, list]) => (
                <Badge key={source} variant="outline" className="text-[10px] py-0">
                  {source} ({list.length})
                </Badge>
              ))}
              {clientsBySource.length > 3 && (
                <Badge variant="outline" className="text-[10px] py-0">
                  +{clientsBySource.length - 3}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Retention Rate by Industry & Client */}
      <Card
        className={cn(
          "cursor-pointer transition-all hover:shadow-md",
          expandedSection === 'retention' && "ring-2 ring-primary/40"
        )}
        onClick={() => toggle('retention')}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-purple-500/10 rounded-lg">
                <ShieldCheck className="w-4 h-4 text-purple-600" />
              </div>
              <span className="text-sm font-medium">Retention Rate</span>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={retentionYear.toString()}
                onValueChange={(v) => setRetentionYear(parseInt(v))}
              >
                <SelectTrigger
                  className="h-6 w-[60px] text-[10px] px-1.5"
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
              {expandedSection === 'retention' ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold">{overallRetention}%</p>
            <span className="text-xs text-muted-foreground">
              ({retentionFiltered.filter(c => c.status === 'active').length}/{retentionFiltered.length})
            </span>
          </div>
          {expandedSection === 'retention' && retentionData.length > 0 && (
            <div className="mt-3 pt-3 border-t space-y-3">
              {retentionData.map(ind => (
                <div key={ind.industry}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">{ind.industry}</span>
                    <span className="text-[10px] text-muted-foreground">{ind.active}/{ind.total} ({ind.rate}%)</span>
                  </div>
                  <Progress
                    value={ind.rate}
                    className={cn("h-1.5 mb-2", ind.rate >= 80 ? '[&>div]:bg-green-500' : ind.rate >= 50 ? '[&>div]:bg-amber-500' : '[&>div]:bg-red-500')}
                  />
                  <div className="space-y-1 ml-2">
                    {ind.clients.map(cl => (
                      <div key={cl.name} className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground truncate max-w-[60%]">{cl.name}</span>
                        <span className={cn("text-[10px] font-medium", cl.rate >= 80 ? 'text-green-600' : cl.rate >= 50 ? 'text-amber-600' : 'text-red-600')}>
                          {cl.active}/{cl.total} ({cl.rate}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {expandedSection !== 'retention' && retentionData.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {retentionData.slice(0, 3).map(ind => (
                <Badge key={ind.industry} variant="outline" className="text-[10px] py-0">
                  {ind.industry} ({ind.rate}%)
                </Badge>
              ))}
              {retentionData.length > 3 && (
                <Badge variant="outline" className="text-[10px] py-0">
                  +{retentionData.length - 3}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
};
