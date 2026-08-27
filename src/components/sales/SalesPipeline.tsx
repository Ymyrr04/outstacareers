import { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { formatDistanceToNow } from 'date-fns';
import { Plus, Upload, LayoutGrid, List as ListIcon, Trash2, X, ArrowRight, UserPlus, Download, Search, Filter, Check, Building2, Globe, Users, CheckCircle, DollarSign, TrendingUp } from 'lucide-react';
import { StatCard } from '@/components/StatCard';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useSalesLeads, SALES_STAGES, SalesLead, SalesStage, Temperature, ContactType, CONTACT_TYPES, HiringType, HIRING_TYPES, useSalesLeadNotes } from '@/hooks/useSalesLeads';
import { estDealValue, pipelineValue, formatCurrency } from '@/lib/salesPipelineMath';
import { AddClientDialog, AddClientInitialValues } from '@/components/clients/AddClientDialog';
import { supabase } from '@/integrations/supabase/client';

const hiringTypeArr = (l: SalesLead | Partial<SalesLead>): HiringType[] => (Array.isArray((l as any).hiring_type) ? (l as any).hiring_type as HiringType[] : []);

const HiringTypeIcons = ({ types, size = 14 }: { types: HiringType[]; size?: number }) => {
  if (!types || types.length === 0) return null;
  const hasLocal = types.includes('Local');
  const hasRemote = types.includes('Remote');
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex items-center gap-1">
        {hasLocal && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Building2 className="text-amber-500" style={{ width: size, height: size }} />
            </TooltipTrigger>
            <TooltipContent>Local</TooltipContent>
          </Tooltip>
        )}
        {hasRemote && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Globe className="text-teal-500" style={{ width: size, height: size }} />
            </TooltipTrigger>
            <TooltipContent>Remote</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
};

const HiringTypeToggle = ({ value, onChange }: { value: HiringType[]; onChange: (v: HiringType[]) => void }) => {
  const toggle = (t: HiringType) => {
    onChange(value.includes(t) ? value.filter(x => x !== t) : [...value, t]);
  };
  const cls = (active: boolean, color: 'amber' | 'teal') =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs transition ${
      active
        ? color === 'amber'
          ? 'bg-amber-500 text-white border-amber-500'
          : 'bg-teal-500 text-white border-teal-500'
        : 'bg-transparent text-muted-foreground border-border hover:bg-muted'
    }`;
  return (
    <div className="flex gap-2">
      <button type="button" onClick={() => toggle('Local')} className={cls(value.includes('Local'), 'amber')}>
        <Building2 className="w-3.5 h-3.5" /> Local
      </button>
      <button type="button" onClick={() => toggle('Remote')} className={cls(value.includes('Remote'), 'teal')}>
        <Globe className="w-3.5 h-3.5" /> Remote
      </button>
    </div>
  );
};

const normalizeNumericInput = (value: string): string => {
  const digits = value.replace(/[^0-9]/g, '');
  return digits.replace(/^0+/, '');
};

const CONTACT_STAGES: SalesStage[] = ['Contact 1', 'Contact 2', 'Contact 3'];
const stageToContactIdx = (s: SalesStage): 1 | 2 | 3 | null =>
  s === 'Contact 1' ? 1 : s === 'Contact 2' ? 2 : s === 'Contact 3' ? 3 : null;

const contactTypeBadge = (t: ContactType | null) => {
  if (t === 'Email') return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300';
  if (t === 'Text') return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300';
  if (t === 'Call') return 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300';
  return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800/40 dark:text-gray-300';
};
const contactTypeIcon = (t: ContactType | null) =>
  t === 'Email' ? '📧' : t === 'Text' ? '💬' : t === 'Call' ? '📞' : t === 'Other' ? '✏️' : '';

const tempBadge = (t: Temperature) => {
  if (t === 'hot') return 'bg-[#FCEBEB] text-[#A32D2D] border-transparent';
  if (t === 'cold') return 'bg-[#F1EFE8] text-[#5F5E5A] border-transparent';
  return 'bg-[#FAEEDA] text-[#633806] border-transparent';
};

// Visual accents for the sales Kanban columns (styling only — stage names/order unchanged).
const SALES_STAGE_ACCENTS = [
  { bg: '#F1EFE8', text: '#5F5E5A', badgeBg: '#DEDBD2', accent: '#8B887E' },
  { bg: '#E0F7FC', text: '#066F85', badgeBg: '#B2EEF8', accent: '#0ABEDF' },
  { bg: '#E6F1FB', text: '#185FA5', badgeBg: '#C5DDF5', accent: '#185FA5' },
  { bg: '#EEEDFE', text: '#534AB7', badgeBg: '#D9D6F8', accent: '#534AB7' },
  { bg: '#FAEEDA', text: '#633806', badgeBg: '#F3DFB8', accent: '#B45309' },
  { bg: '#FAECE7', text: '#993C1D', badgeBg: '#F3D4C6', accent: '#993C1D' },
  { bg: '#EAF3DE', text: '#3B6D11', badgeBg: '#D6E8BE', accent: '#639922' },
];
const salesStageAccent = (stage: string) => {
  const idx = SALES_STAGES.indexOf(stage as SalesStage);
  return SALES_STAGE_ACCENTS[(idx >= 0 ? idx : 0) % SALES_STAGE_ACCENTS.length];
};

const emptyLead: Partial<SalesLead> = {
  company_name: '', contact_name: '', role_title: '', email: '', phone: '', phone_2: '',
  industry: '', team_size: '', hiring_urgency: '', temperature: 'warm',
  source: 'manual', stage: 'OutSta Lead', original_message: '',
  estimated_hires: 0, likelihood_to_close: 0, hiring_type: [],
};

export const SalesPipeline = () => {
  const { leads, loading, createLead, updateLead, deleteLead, bulkInsert, convertToClient } = useSalesLeads();
  const navigate = useNavigate();
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<SalesLead | null>(null);
  const [confirmConvert, setConfirmConvert] = useState<SalesLead | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SalesLead | null>(null);
  const [search, setSearch] = useState('');
  const [tempFilters, setTempFilters] = useState<Set<Temperature>>(new Set());
  const [sourceFilters, setSourceFilters] = useState<Set<'manual' | 'csv-import'>>(new Set());
  const [industryFilters, setIndustryFilters] = useState<Set<string>>(new Set());
  const [hiringTypeFilter, setHiringTypeFilter] = useState<'all' | 'Local' | 'Remote' | 'Both'>('all');
  const [existingClientIds, setExistingClientIds] = useState<Set<string>>(new Set());
  const [clientPipelineStages, setClientPipelineStages] = useState<Record<string, string>>({});

  // Verify which converted_client_id values actually exist in the clients table
  // and fetch the latest client pipeline stage for each converted client
  useEffect(() => {
    const ids = Array.from(new Set(leads.map(l => l.converted_client_id).filter(Boolean) as string[]));
    if (ids.length === 0) {
      setExistingClientIds(new Set());
      setClientPipelineStages({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('clients').select('id').in('id', ids);
      if (cancelled || error) return;
      const existing = new Set((data || []).map((c: any) => c.id));
      setExistingClientIds(existing);

      // Fetch latest hiring request stage per converted client
      const { data: stageData, error: stageError } = await supabase
        .from('client_hiring_requests')
        .select('client_id, pipeline_stage, created_at')
        .in('client_id', ids)
        .order('client_id', { ascending: true })
        .order('created_at', { ascending: false });

      if (cancelled || stageError) return;

      // Map stage slugs to display names
      const { data: stageNamesData } = await supabase
        .from('pipeline_stages')
        .select('name, slug');

      const stageNameMap: Record<string, string> = {};
      (stageNamesData || []).forEach((s: any) => {
        if (s.slug) stageNameMap[s.slug] = s.name;
      });

      const stageMap: Record<string, string> = {};
      (stageData || []).forEach((row: any) => {
        const clientId = row.client_id as string;
        if (!stageMap[clientId]) {
          const rawStage = (row.pipeline_stage || '').toString();
          stageMap[clientId] = stageNameMap[rawStage] || rawStage.replace(/_/g, ' ');
        }
      });
      setClientPipelineStages(stageMap);
    })();
    return () => { cancelled = true; };
  }, [leads]);

  const openClientInPipeline = (clientId: string) => {
    navigate(`/admin/pipeline?clientId=${clientId}`);
  };

  const industries = useMemo(() => {
    const s = new Set<string>();
    leads.forEach(l => { if (l.industry && l.industry.trim()) s.add(l.industry.trim()); });
    return Array.from(s).sort();
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter(l => {
      if (q && ![l.company_name, l.contact_name, l.email, l.phone, l.phone_2, l.role_title, l.industry, l.source, l.stage]
        .some(v => (v || '').toString().toLowerCase().includes(q))) return false;
      if (tempFilters.size && !tempFilters.has(l.temperature)) return false;
      if (sourceFilters.size && !sourceFilters.has((l.source as any))) return false;
      if (industryFilters.size && !industryFilters.has((l.industry || '').trim())) return false;
      if (hiringTypeFilter !== 'all') {
        const ht = hiringTypeArr(l);
        if (hiringTypeFilter === 'Both') {
          if (!(ht.includes('Local') && ht.includes('Remote'))) return false;
        } else if (!ht.includes(hiringTypeFilter)) return false;
      }
      return true;
    });
  }, [leads, search, tempFilters, sourceFilters, industryFilters, hiringTypeFilter]);

  const activeFilterCount = tempFilters.size + sourceFilters.size + industryFilters.size;
  const toggleFromSet = <T,>(set: Set<T>, val: T, setter: (s: Set<T>) => void) => {
    const n = new Set(set);
    n.has(val) ? n.delete(val) : n.add(val);
    setter(n);
  };

  const grouped = useMemo(() => {
    const g: Record<string, SalesLead[]> = {};
    SALES_STAGES.forEach(s => { g[s] = []; });
    filteredLeads.forEach(l => { (g[l.stage] || (g[l.stage] = [])).push(l); });
    return g;
  }, [filteredLeads]);

  const stats = useMemo(() => {
    let totalEst = 0;
    let totalPipeline = 0;
    leads.forEach(l => {
      totalEst += estDealValue(l.estimated_hires);
      totalPipeline += pipelineValue(l.estimated_hires, l.likelihood_to_close);
    });
    return {
      total: leads.length,
      cold: leads.filter(l => l.temperature === 'cold').length,
      warm: leads.filter(l => l.temperature === 'warm').length,
      hot: leads.filter(l => l.temperature === 'hot').length,
      converted: leads.filter(l => !!l.converted_client_id).length,
      totalEst,
      totalPipeline,
    };
  }, [leads]);

  const onDragEnd = async (r: DropResult) => {
    if (!r.destination) return;
    const newStage = r.destination.droppableId as SalesStage;
    const lead = leads.find(l => l.id === r.draggableId);
    if (!lead || lead.stage === newStage) return;
    if (newStage === 'Converted' && !lead.converted_client_id) {
      setConfirmConvert(lead);
      return;
    }
    const updates: Partial<SalesLead> = { stage: newStage };
    const idx = stageToContactIdx(newStage);
    if (idx) {
      const atKey = `contact_${idx}_at` as keyof SalesLead;
      if (!lead[atKey]) (updates as any)[atKey] = new Date().toISOString();
    }
    updateLead(lead.id, updates);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Sales Pipeline</h1>
          <p className="text-sm text-muted-foreground">Track and manage client leads through your sales pipeline</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border bg-background p-0.5">
            <Button size="sm" variant={view === 'list' ? 'default' : 'ghost'} onClick={() => setView('list')}>
              <ListIcon className="w-4 h-4 mr-1" /> List
            </Button>
            <Button size="sm" variant={view === 'kanban' ? 'default' : 'ghost'} onClick={() => setView('kanban')}>
              <LayoutGrid className="w-4 h-4 mr-1" /> Kanban
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-1" /> Import CSV
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> New Lead
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3.5">
        <StatCard accent="cyan" icon={Users} label="Total Leads" value={stats.total} />
        <TemperatureBreakdownCard cold={stats.cold} warm={stats.warm} hot={stats.hot} />
        <StatCard accent="teal" icon={CheckCircle} label="Converted to Clients" value={stats.converted} />
        <StatCard accent="amber" icon={DollarSign} label="Total Est. Deal Value" value={formatCurrency(stats.totalEst)} />
        <StatCard accent="amber" icon={TrendingUp} label="Total Pipeline Value" value={formatCurrency(stats.totalPipeline)} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">

        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search company, contact, email, phone, role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-9"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-10">
              <Filter className="w-4 h-4 mr-2" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 rounded-full">{activeFilterCount}</Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-0">
            <div className="flex items-center justify-between p-3 border-b">
              <span className="text-sm font-semibold">Filters</span>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => { setTempFilters(new Set()); setSourceFilters(new Set()); setIndustryFilters(new Set()); }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="p-3 space-y-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Temperature</div>
              {(['warm','cold','hot'] as Temperature[]).map(t => {
                const active = tempFilters.has(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleFromSet(tempFilters, t, setTempFilters)}
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted text-sm"
                  >
                    <span className="flex items-center gap-2 capitalize">
                      <span className={`inline-block w-2 h-2 rounded-full ${t === 'hot' ? 'bg-red-500' : t === 'cold' ? 'bg-blue-500' : 'bg-orange-500'}`} />
                      {t}
                    </span>
                    {active && <Check className="w-4 h-4 text-primary" />}
                  </button>
                );
              })}
            </div>

            <Separator />

            <div className="p-3 space-y-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Source</div>
              {([['manual','Manual'], ['csv-import','CSV Import']] as const).map(([val, label]) => {
                const active = sourceFilters.has(val as any);
                return (
                  <button
                    key={val}
                    onClick={() => toggleFromSet(sourceFilters, val as any, setSourceFilters)}
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted text-sm"
                  >
                    <span>{label}</span>
                    {active && <Check className="w-4 h-4 text-primary" />}
                  </button>
                );
              })}
            </div>

            {industries.length > 0 && (
              <>
                <Separator />
                <div className="p-3 space-y-1 max-h-60 overflow-y-auto">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 sticky top-0 bg-popover">Industry</div>
                  {industries.map(ind => {
                    const active = industryFilters.has(ind);
                    return (
                      <button
                        key={ind}
                        onClick={() => toggleFromSet(industryFilters, ind, setIndustryFilters)}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted text-sm"
                      >
                        <span className="truncate">{ind}</span>
                        {active && <Check className="w-4 h-4 text-primary flex-shrink-0 ml-2" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </PopoverContent>
        </Popover>

        <Select value={hiringTypeFilter} onValueChange={(v) => setHiringTypeFilter(v as any)}>
          <SelectTrigger className="h-10 w-[160px]">
            <SelectValue placeholder="Hiring Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Hiring Types</SelectItem>
            <SelectItem value="Local">🏢 Local</SelectItem>
            <SelectItem value="Remote">🌐 Remote</SelectItem>
            <SelectItem value="Both">🏢 🌐 Local + Remote</SelectItem>
          </SelectContent>
        </Select>

        {(search || activeFilterCount > 0) && (
          <span className="text-xs text-muted-foreground">
            {filteredLeads.length} of {leads.length} match
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-12 text-center">Loading…</div>
      ) : view === 'kanban' ? (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {SALES_STAGES.map(stage => (
              <Droppable droppableId={stage} key={stage}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="min-w-[280px] w-[280px] flex-shrink-0 flex flex-col transition-colors"
                  >
                    {(() => { const accent = salesStageAccent(stage); return (
                    <>
                    <div
                      className="flex items-center justify-between px-[9px] py-[7px] rounded-t-[7px]"
                      style={{ backgroundColor: accent.bg }}
                    >
                      <h3 className="text-[10px] font-medium" style={{ color: accent.text }}>{stage}</h3>
                      <span
                        className="text-[10px] font-medium rounded-lg px-1.5 py-px"
                        style={{ backgroundColor: accent.badgeBg, color: accent.text }}
                      >
                        {grouped[stage].length}
                      </span>
                    </div>
                    <div className={`flex-1 flex flex-col gap-[5px] min-h-[300px] bg-white border-[0.5px] border-t-0 rounded-b-[7px] p-1.5 ${snapshot.isDraggingOver ? 'border-primary' : 'border-[#C8F0F8]'}`}>
                      {grouped[stage].length === 0 && (
                        <div className="text-[10px] text-muted-foreground text-center py-5">Empty</div>
                      )}
                      {grouped[stage].map((lead, idx) => (
                        <Draggable draggableId={lead.id} index={idx} key={lead.id}>
                          {(p, s) => (
                            <div
                              ref={p.innerRef}
                              {...p.draggableProps}
                               {...p.dragHandleProps}
                               onClick={() => setSelectedLead(lead)}
                               className={`bg-white border-[0.5px] border-[#C8F0F8] rounded-md px-2 py-[7px] cursor-pointer hover:bg-[#EDF9FC] transition ${s.isDragging ? 'rotate-1 shadow-lg' : ''}`}
                               style={{ ...p.draggableProps.style, borderLeft: `3px solid ${salesStageAccent(stage).accent}` }}
                             >
                              <div className="flex items-start justify-between gap-2 mb-1">
                                {lead.converted_client_id && existingClientIds.has(lead.converted_client_id) ? (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); openClientInPipeline(lead.converted_client_id!); }}
                                    className="font-medium text-[11px] truncate flex-1 text-left text-primary hover:underline"
                                    title="Open in client pipeline"
                                  >
                                    {lead.company_name}
                                  </button>
                                ) : (
                                  <div className="font-medium text-[11px] truncate flex-1">{lead.company_name}</div>
                                )}
                                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                                  <div className="flex items-center gap-1.5">
                                    <HiringTypeIcons types={hiringTypeArr(lead)} size={14} />
                                    {lead.converted_client_id && (
                                      <Badge className="bg-teal-500 hover:bg-teal-500 text-white text-[10px]">converted</Badge>
                                    )}
                                  </div>
                                  {lead.converted_client_id && clientPipelineStages[lead.converted_client_id] && (
                                    <span className="text-[10px] font-semibold text-teal-600 dark:text-teal-400">
                                      Stage: {clientPipelineStages[lead.converted_client_id]}
                                    </span>
                                  )}
                                </div>
                              </div>
                               <div className="text-[9px] text-muted-foreground mb-2">{lead.contact_name || 'N/A'}</div>
                               <div className="flex flex-wrap gap-1 mb-2">
                                 <Badge variant="outline" className={`text-[9px] font-medium px-[7px] py-[2px] rounded-lg capitalize ${tempBadge(lead.temperature)}`}>{lead.temperature}</Badge>
                                 <Badge variant="outline" className="text-[9px]">{lead.source}</Badge>
                              </div>
                              {lead.role_title && <div className="text-xs truncate">{lead.role_title}</div>}
                              {lead.industry && <div className="text-xs text-muted-foreground truncate">{lead.industry}</div>}
                              {lead.email && <div className="text-xs text-muted-foreground truncate">{lead.email}</div>}
                              {(() => {
                                const ci = stageToContactIdx(stage);
                                if (!ci) return null;
                                const typeKey = `contact_${ci}_type` as keyof SalesLead;
                                const notesKey = `contact_${ci}_notes` as keyof SalesLead;
                                const current = lead[typeKey] as ContactType | null;
                                const currentNotes = (lead[notesKey] as string | null) || '';
                                return (
                                  <div className="mt-2 space-y-1" onClick={(e) => e.stopPropagation()}>
                                    <Select
                                      value={current || ''}
                                      onValueChange={(v) => updateLead(lead.id, { [typeKey]: v as ContactType } as any)}
                                    >
                                      <SelectTrigger className={`h-6 text-[10px] px-2 ${current ? contactTypeBadge(current) : 'text-muted-foreground'}`}>
                                        <SelectValue placeholder="Select type">
                                          {current ? `${contactTypeIcon(current)} ${current}` : 'Select type'}
                                        </SelectValue>
                                      </SelectTrigger>
                                      <SelectContent>
                                        {CONTACT_TYPES.map(t => (
                                          <SelectItem key={t} value={t}>{contactTypeIcon(t)} {t}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    {current === 'Other' && (
                                      <OtherReasonInput
                                        value={currentNotes}
                                        onSave={(v) => updateLead(lead.id, { [notesKey]: v } as any)}
                                      />
                                    )}
                                  </div>
                                );
                              })()}
                              {(() => {
                                const hires = lead.estimated_hires || 0;
                                const pct = lead.likelihood_to_close || 0;
                                const dv = estDealValue(hires);
                                const pv = pipelineValue(hires, pct);
                                return (
                                  <div className="mt-2 flex items-center justify-between gap-2 pt-2 border-t border-dashed">
                                    <Badge variant="outline" className="text-[10px] bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300">
                                      {pct > 0 ? `${pct}%` : '—'}
                                    </Badge>
                                    <div className="text-right leading-tight">
                                      <div className="text-[10px] text-muted-foreground">{dv > 0 ? `${formatCurrency(dv)}/yr` : '—'}</div>
                                      <div className="text-[11px] font-semibold">{pv > 0 ? `Pipeline: ${formatCurrency(pv)}` : '—'}</div>
                                    </div>
                                  </div>
                                );
                              })()}
                              <div className="text-[10px] text-muted-foreground mt-2">{formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}</div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                    </>
                    ); })()}
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </DragDropContext>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Temperature</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Hiring Type</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.map(l => (
                  <TableRow key={l.id} className="cursor-pointer" onClick={() => setSelectedLead(l)}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col gap-0.5">
                        {l.converted_client_id && existingClientIds.has(l.converted_client_id) ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openClientInPipeline(l.converted_client_id!); }}
                            className="text-primary hover:underline text-left"
                            title="Open in client pipeline"
                          >
                            {l.company_name}
                          </button>
                        ) : (
                          <span>{l.company_name}</span>
                        )}
                        {l.converted_client_id && clientPipelineStages[l.converted_client_id] && (
                          <span className="text-[10px] font-semibold text-teal-600 dark:text-teal-400">
                            Stage: {clientPipelineStages[l.converted_client_id]}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{l.contact_name || '—'}</TableCell>
                    <TableCell>{l.role_title || '—'}</TableCell>
                    <TableCell>{l.industry || '—'}</TableCell>
                    <TableCell><Badge variant="outline" className={`capitalize ${tempBadge(l.temperature)}`}>{l.temperature}</Badge></TableCell>
                    <TableCell><Badge variant="outline">{l.source}</Badge></TableCell>
                    <TableCell>{l.stage}</TableCell>
                    <TableCell><HiringTypeIcons types={hiringTypeArr(l)} size={16} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(l.updated_at), { addSuffix: true })}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(l)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredLeads.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-12">{leads.length === 0 ? 'No leads yet' : 'No leads match your search'}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <NewLeadDialog open={addOpen} onClose={() => setAddOpen(false)} onSubmit={async (d) => { const ok = await createLead(d); if (ok) setAddOpen(false); }} />
      <ImportCsvDialog open={importOpen} onClose={() => setImportOpen(false)} onImport={bulkInsert} existingLeads={leads} />
      <LeadDetailPanel
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onUpdate={(u) => selectedLead && updateLead(selectedLead.id, u).then(() => setSelectedLead(prev => prev ? { ...prev, ...u } as SalesLead : prev))}
        onDelete={() => selectedLead && setConfirmDelete(selectedLead)}
        onConvert={() => selectedLead && setConfirmConvert(selectedLead)}
      />

      <AddClientDialog
        open={!!confirmConvert}
        onOpenChange={(o) => !o && setConfirmConvert(null)}
        title={confirmConvert ? `Convert lead to client: ${confirmConvert.company_name}` : 'Add New Client'}
        initialValues={confirmConvert ? {
          company_name: confirmConvert.company_name || '',
          industry: confirmConvert.industry || '',
          leads_from: confirmConvert.source || 'sales-pipeline',
          contact_full_name: confirmConvert.contact_name || '',
          email: confirmConvert.email || '',
          phone: confirmConvert.phone || '',
        } as AddClientInitialValues : undefined}
        onClientAdded={async (clientId) => {
          if (confirmConvert && clientId) {
            await updateLead(confirmConvert.id, {
              stage: 'Converted',
              converted_client_id: clientId,
              converted_at: new Date().toISOString(),
            } as any);
          }
          setConfirmConvert(null);
          setSelectedLead(null);
        }}
      />


      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete lead?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (confirmDelete) await deleteLead(confirmDelete.id);
              setConfirmDelete(null);
              setSelectedLead(null);
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const OtherReasonInput = ({ value, onSave }: { value: string; onSave: (v: string) => void }) => {
  const [val, setVal] = useState(value);
  return (
    <Input
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => { if (val !== value) onSave(val); }}
      placeholder="Reason (optional)"
      className="h-6 text-[10px] px-2"
    />
  );
};


const TemperatureBreakdownCard = ({ cold, warm, hot }: { cold: number; warm: number; hot: number }) => (
  <Card>
    <CardContent className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Lead Status</div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-center flex-1">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Cold</div>
          <div className="text-2xl font-bold">{cold}</div>
        </div>
        <div className="text-center flex-1 border-x border-border px-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Warm</div>
          <div className="text-2xl font-bold">{warm}</div>
        </div>
        <div className="text-center flex-1">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Hot</div>
          <div className="text-2xl font-bold">{hot}</div>
        </div>
      </div>
    </CardContent>
  </Card>
);

// --- New Lead Dialog ---
const NewLeadDialog = ({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (d: Partial<SalesLead>) => void }) => {
  const [data, setData] = useState<Partial<SalesLead>>(emptyLead);
  const [hiresInput, setHiresInput] = useState<string>('');
  const [likelihoodInput, setLikelihoodInput] = useState<string>('');
  const set = (k: keyof SalesLead, v: any) => setData(d => ({ ...d, [k]: v }));

  const numericHires = useMemo(() => Math.max(0, parseInt(hiresInput || '0', 10) || 0), [hiresInput]);
  const numericLikelihood = useMemo(() => Math.min(100, Math.max(0, parseInt(likelihoodInput || '0', 10) || 0)), [likelihoodInput]);

  useEffect(() => {
    setData(d => d.estimated_hires === numericHires && d.likelihood_to_close === numericLikelihood ? d : { ...d, estimated_hires: numericHires, likelihood_to_close: numericLikelihood });
  }, [numericHires, numericLikelihood]);

  useEffect(() => {
    if (open) {
      setData(emptyLead);
      setHiresInput('');
      setLikelihoodInput('');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setData(emptyLead); setHiresInput(''); setLikelihoodInput(''); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New Lead</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Company name *"><Input value={data.company_name || ''} onChange={e => set('company_name', e.target.value)} /></Field>
          <Field label="Contact name"><Input value={data.contact_name || ''} onChange={e => set('contact_name', e.target.value)} /></Field>
          <Field label="Role title"><Input value={data.role_title || ''} onChange={e => set('role_title', e.target.value)} /></Field>
          <Field label="Email *"><Input type="email" value={data.email || ''} onChange={e => set('email', e.target.value)} /></Field>
          <Field label="Phone"><Input value={data.phone || ''} onChange={e => set('phone', e.target.value)} /></Field>
          <Field label="Phone 2"><Input value={data.phone_2 || ''} onChange={e => set('phone_2', e.target.value)} /></Field>
          <Field label="Industry"><Input value={data.industry || ''} onChange={e => set('industry', e.target.value)} /></Field>
          <Field label="Team size"><Input value={data.team_size || ''} onChange={e => set('team_size', e.target.value)} /></Field>
          <Field label="Hiring urgency"><Input value={data.hiring_urgency || ''} onChange={e => set('hiring_urgency', e.target.value)} /></Field>
          <Field label="Hiring Type">
            <HiringTypeToggle value={hiringTypeArr(data)} onChange={(v) => set('hiring_type', v)} />
          </Field>
          <Field label="Temperature">
            <Select value={data.temperature} onValueChange={v => set('temperature', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="warm">Warm</SelectItem>
                <SelectItem value="cold">Cold</SelectItem>
                <SelectItem value="hot">Hot</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Source"><Input value={data.source || ''} onChange={e => set('source', e.target.value)} /></Field>
          <Field label="Estimated number of hires">
            <Input
              type="number"
              min={0}
              value={hiresInput}
              onChange={e => setHiresInput(normalizeNumericInput(e.target.value))}
            />
          </Field>
          <Field label="Likelihood to close (%)">
            <Input
              type="number"
              min={0}
              max={100}
              value={likelihoodInput}
              onChange={e => setLikelihoodInput(normalizeNumericInput(e.target.value))}
            />
          </Field>
          <div className="col-span-2 rounded-md border bg-muted/30 p-2 text-xs flex items-center justify-between">
            <span className="text-muted-foreground">Est. Deal Value / yr</span>
            <span className="font-semibold">{estDealValue(numericHires) > 0 ? `${formatCurrency(estDealValue(numericHires))}/yr` : '—'}</span>
          </div>
          <div className="col-span-2 rounded-md border bg-primary/5 p-2 text-xs flex items-center justify-between">
            <span className="text-muted-foreground">Pipeline Value</span>
            <span className="font-semibold text-primary">{pipelineValue(numericHires, numericLikelihood) > 0 ? formatCurrency(pipelineValue(numericHires, numericLikelihood)) : '—'}</span>
          </div>
          <div className="col-span-2"><Field label="Notes / Original message"><Textarea rows={3} value={data.original_message || ''} onChange={e => set('original_message', e.target.value)} /></Field></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!data.company_name || !data.email} onClick={() => onSubmit(data)}>Create Lead</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>
);

// --- Import CSV Dialog ---
const FIELD_OPTIONS: { key: keyof SalesLead; label: string }[] = [
  { key: 'company_name', label: 'Company Name' },
  { key: 'contact_name', label: 'Contact Name' },
  { key: 'role_title', label: 'Role Title' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'phone_2', label: 'Phone 2' },
  { key: 'industry', label: 'Industry' },
  { key: 'team_size', label: 'Team Size' },
  { key: 'hiring_urgency', label: 'Hiring Urgency' },
  { key: 'temperature', label: 'Temperature' },
  { key: 'original_message', label: 'Message / Notes' },
];

const parseCSV = (text: string): { headers: string[]; rows: string[][] } => {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) return { headers: [], rows: [] };
  const parseLine = (line: string) => {
    const out: string[] = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
};

const ImportCsvDialog = ({ open, onClose, onImport, existingLeads }: { open: boolean; onClose: () => void; onImport: (rows: Partial<SalesLead>[]) => Promise<number>; existingLeads: SalesLead[] }) => {
  const [step, setStep] = useState<'upload' | 'map' | 'done'>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [count, setCount] = useState(0);
  const [skipped, setSkipped] = useState({ missing: 0, dupCsv: 0, dupExisting: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setStep('upload'); setHeaders([]); setRows([]); setMapping({}); setCount(0); setSkipped({ missing: 0, dupCsv: 0, dupExisting: 0 }); };

  const handleFile = async (f: File) => {
    const text = await f.text();
    const { headers, rows } = parseCSV(text);
    setHeaders(headers); setRows(rows);
    const auto: Record<string, string> = {};
    headers.forEach(h => {
      const lower = h.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = FIELD_OPTIONS.find(f => f.key.replace(/_/g, '').includes(lower) || lower.includes(f.key.replace(/_/g, '')));
      if (match) auto[h] = match.key;
    });
    setMapping(auto);
    setStep('map');
  };

  const doImport = async () => {
    const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();
    const existingEmails = new Set(existingLeads.map(l => norm(l.email)).filter(Boolean));
    const existingPhones = new Set([...existingLeads.map(l => norm(l.phone)), ...existingLeads.map(l => norm(l.phone_2))].filter(Boolean));
    const existingCompanies = new Set(existingLeads.map(l => norm(l.company_name)).filter(Boolean));
    const seenEmail = new Set<string>();
    const seenPhone = new Set<string>();
    const seenCompany = new Set<string>();
    let missing = 0, dupCsv = 0, dupExisting = 0;

    const payload: Partial<SalesLead>[] = [];
    for (const r of rows) {
      const obj: any = { source: 'csv-import' };
      headers.forEach((h, i) => {
        const field = mapping[h];
        if (field && r[i]) obj[field] = r[i];
      });
      if (!obj.company_name) { missing++; continue; }
      const email = norm(obj.email);
      const phone = norm(obj.phone);
      const phone2 = norm(obj.phone_2);
      const company = norm(obj.company_name);
      const phones = [phone, phone2].filter(Boolean);
      if ((email && existingEmails.has(email)) || phones.some(p => existingPhones.has(p)) || (!email && !phones.length && existingCompanies.has(company))) {
        dupExisting++; continue;
      }
      if ((email && seenEmail.has(email)) || phones.some(p => seenPhone.has(p)) || (!email && !phones.length && seenCompany.has(company))) {
        dupCsv++; continue;
      }
      if (email) seenEmail.add(email);
      phones.forEach(p => seenPhone.add(p));
      seenCompany.add(company);
      payload.push(obj);
    }
    const c = payload.length ? await onImport(payload) : 0;
    setCount(c);
    setSkipped({ missing, dupCsv, dupExisting });
    setStep('done');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Import Leads from CSV</DialogTitle></DialogHeader>
        {step === 'upload' && (
          <div className="space-y-3">
            <div className="py-8 text-center border-2 border-dashed rounded-lg">
              <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-3">Upload a CSV file with your leads</p>
              <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              <Button onClick={() => inputRef.current?.click()}>Choose CSV</Button>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
              <div>
                <p className="text-sm font-medium">Need a starting point?</p>
                <p className="text-xs text-muted-foreground">Download the sample CSV template with the correct headers.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => {
                const headers = FIELD_OPTIONS.map(f => f.label);
                const example = [
                  'Acme Corp','Jane Doe','Head of Talent','jane@acme.com','+1 555 123 4567','+1 555 987 6543',
                  'Technology','50-200','High','warm','Met at conference, looking to hire 5 engineers'
                ];
                const csv = [headers.join(','), example.map(v => `"${v.replace(/"/g,'""')}"`).join(',')].join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'sales_leads_template.csv'; a.click();
                URL.revokeObjectURL(url);
              }}>
                <Download className="w-4 h-4 mr-2" />Template
              </Button>
            </div>
          </div>
        )}
        {step === 'map' && (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <p className="text-sm text-muted-foreground">Map {rows.length} rows. CSV columns → Lead fields.</p>
            {headers.map(h => (
              <div key={h} className="grid grid-cols-2 gap-3 items-center">
                <div className="text-sm font-medium truncate">{h}</div>
                <Select value={mapping[h] || '__skip'} onValueChange={v => setMapping(m => ({ ...m, [h]: v === '__skip' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Skip" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__skip">— Skip —</SelectItem>
                    {FIELD_OPTIONS.map(f => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
        {step === 'done' && (
          <div className="py-6 text-center space-y-2">
            <p className="text-lg font-semibold">{count} leads imported</p>
            {(skipped.missing + skipped.dupCsv + skipped.dupExisting) > 0 && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                {skipped.missing > 0 && <p>{skipped.missing} skipped (missing company name)</p>}
                {skipped.dupExisting > 0 && <p>{skipped.dupExisting} skipped (already in pipeline)</p>}
                {skipped.dupCsv > 0 && <p>{skipped.dupCsv} skipped (duplicate in CSV)</p>}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          {step === 'map' && <Button variant="outline" onClick={reset}>Back</Button>}
          {step === 'map' && <Button onClick={doImport} disabled={!Object.values(mapping).includes('company_name')}>Import</Button>}
          {step === 'done' && <Button onClick={() => { onClose(); reset(); }}>Done</Button>}
          {step === 'upload' && <Button variant="outline" onClick={() => { onClose(); reset(); }}>Cancel</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// --- Lead Detail Panel ---
const LeadDetailPanel = ({ lead, onClose, onUpdate, onDelete, onConvert }: {
  lead: SalesLead | null;
  onClose: () => void;
  onUpdate: (u: Partial<SalesLead>) => void;
  onDelete: () => void;
  onConvert: () => void;
}) => {
  const { notes, addNote } = useSalesLeadNotes(lead?.id || null);
  const [newNote, setNewNote] = useState('');
  const [localHires, setLocalHires] = useState<string>((lead?.estimated_hires ?? 0) ? String(lead?.estimated_hires) : '');
  const [localLikelihood, setLocalLikelihood] = useState<string>((lead?.likelihood_to_close ?? 0) ? String(lead?.likelihood_to_close) : '');
  const currentIdx = lead ? SALES_STAGES.indexOf(lead.stage) : -1;
  const nextStage = currentIdx >= 0 && currentIdx < SALES_STAGES.length - 1 ? SALES_STAGES[currentIdx + 1] : null;

  useEffect(() => {
    const h = lead?.estimated_hires ?? 0;
    const l = lead?.likelihood_to_close ?? 0;
    setLocalHires(h ? String(h) : '');
    setLocalLikelihood(l ? String(l) : '');
  }, [lead?.id]);

  const numericHires = useMemo(() => Math.max(0, parseInt(localHires || '0', 10) || 0), [localHires]);
  const numericLikelihood = useMemo(() => Math.min(100, Math.max(0, parseInt(localLikelihood || '0', 10) || 0)), [localLikelihood]);

  useEffect(() => {
    if (!lead) return;
    const leadHires = lead.estimated_hires ?? 0;
    const leadLikelihood = lead.likelihood_to_close ?? 0;
    if (numericHires === leadHires && numericLikelihood === leadLikelihood) return;
    const t = setTimeout(() => {
      onUpdate({ estimated_hires: numericHires, likelihood_to_close: numericLikelihood });
    }, 500);
    return () => clearTimeout(t);
  }, [numericHires, numericLikelihood, lead, onUpdate]);

  return (
    <Sheet open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[600px] sm:max-w-[600px] overflow-y-auto">
        {lead && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-xl font-bold">{lead.company_name}</h2>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={onDelete}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={`capitalize ${tempBadge(lead.temperature)}`}>{lead.temperature}</Badge>
              <Badge variant="outline">{lead.source}</Badge>
              {lead.converted_client_id && <Badge className="bg-teal-500 text-white">converted</Badge>}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 border-t">
              <DetailRow label="Stage">
                <Select value={lead.stage} onValueChange={v => onUpdate({ stage: v as SalesStage })}>
                  <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{SALES_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </DetailRow>
              <DetailRow label="Temperature">
                <Select value={lead.temperature} onValueChange={v => onUpdate({ temperature: v as Temperature })}>
                  <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warm">Warm</SelectItem>
                    <SelectItem value="cold">Cold</SelectItem>
                    <SelectItem value="hot">Hot</SelectItem>
                  </SelectContent>
                </Select>
              </DetailRow>
              <EditField label="Contact" value={lead.contact_name} onSave={v => onUpdate({ contact_name: v })} />
              <EditField label="Role" value={lead.role_title} onSave={v => onUpdate({ role_title: v })} />
              <EditField label="Email" value={lead.email} onSave={v => onUpdate({ email: v })} />
              <EditField label="Phone" value={lead.phone} onSave={v => onUpdate({ phone: v })} />
              <EditField label="Phone 2" value={lead.phone_2} onSave={v => onUpdate({ phone_2: v })} />
              <EditField label="Industry" value={lead.industry} onSave={v => onUpdate({ industry: v })} />
              <EditField label="Team size" value={lead.team_size} onSave={v => onUpdate({ team_size: v })} />
              <div className="col-span-2"><EditField label="Hiring urgency" value={lead.hiring_urgency} onSave={v => onUpdate({ hiring_urgency: v })} /></div>
              <div className="col-span-2">
                <DetailRow label="Hiring Type">
                  <HiringTypeToggle value={hiringTypeArr(lead)} onChange={(v) => onUpdate({ hiring_type: v })} />
                </DetailRow>
              </div>
              <div className="col-span-2"><EditField label="Source" value={lead.source} onSave={v => onUpdate({ source: v })} /></div>
              <DetailRow label="Estimated number of hires">
                <Input
                  type="number"
                  min={0}
                  className="h-10 text-sm border-2"
                  value={localHires}
                  onChange={e => setLocalHires(normalizeNumericInput(e.target.value))}
                />
              </DetailRow>
              <DetailRow label="Likelihood to close (%)">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="h-10 text-sm border-2"
                  value={localLikelihood}
                  onChange={e => setLocalLikelihood(normalizeNumericInput(e.target.value))}
                />
              </DetailRow>
              <div className="col-span-2 rounded-md border bg-muted/30 p-3 text-sm flex items-center justify-between">
                <span className="text-muted-foreground">Est. Deal Value / yr</span>
                <span className="font-semibold">{estDealValue(numericHires) > 0 ? `${formatCurrency(estDealValue(numericHires))}/yr` : '—'}</span>
              </div>
              <div className="col-span-2 rounded-md border-2 border-primary/30 bg-primary/5 p-3 text-base flex items-center justify-between">
                <span className="font-medium">Pipeline Value</span>
                <span className="font-bold text-primary">{pipelineValue(numericHires, numericLikelihood) > 0 ? formatCurrency(pipelineValue(numericHires, numericLikelihood)) : '—'}</span>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t">
              {[1, 2, 3].map((n) => {
                const typeKey = `contact_${n}_type` as keyof SalesLead;
                const atKey = `contact_${n}_at` as keyof SalesLead;
                const notesKey = `contact_${n}_notes` as keyof SalesLead;
                const t = lead[typeKey] as ContactType | null;
                const atVal = lead[atKey] as string | null;
                const dateLocal = atVal ? new Date(atVal).toISOString().slice(0, 16) : '';
                return (
                  <div key={n} className="rounded-md border bg-muted/20 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Contact {n}</div>
                      {t && <Badge variant="outline" className={`text-xs ${contactTypeBadge(t)}`}>{contactTypeIcon(t)} {t}</Badge>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs uppercase text-muted-foreground">Type</Label>
                        <Select value={t || ''} onValueChange={(v) => onUpdate({ [typeKey]: v as ContactType } as any)}>
                          <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            {CONTACT_TYPES.map(ct => <SelectItem key={ct} value={ct}>{contactTypeIcon(ct)} {ct}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs uppercase text-muted-foreground">Date</Label>
                        <Input
                          type="datetime-local"
                          className="h-10 text-sm border-2"
                          value={dateLocal}
                          onChange={(e) => onUpdate({ [atKey]: e.target.value ? new Date(e.target.value).toISOString() : null } as any)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase text-muted-foreground">Notes</Label>
                      <Textarea
                        rows={2}
                        className="text-sm border-2"
                        value={(lead[notesKey] as string | null) || ''}
                        onChange={(e) => onUpdate({ [notesKey]: e.target.value } as any)}
                        placeholder="Notes for this contact attempt"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Original Message</Label>
              <Textarea
                rows={4}
                className="text-sm border-2"
                value={lead.original_message || ''}
                onChange={e => onUpdate({ original_message: e.target.value })}
                placeholder="No message"
              />
            </div>

            <div className="flex gap-2 pt-2">
              {nextStage && (
                <Button size="sm" variant="outline" className="flex-1 h-10 text-sm" onClick={() => onUpdate({ stage: nextStage })}>
                  <ArrowRight className="w-4 h-4 mr-1" /> Move to {nextStage}
                </Button>
              )}
              {!lead.converted_client_id && (
                <Button size="sm" className="flex-1 h-10 text-sm" onClick={onConvert}>
                  <UserPlus className="w-4 h-4 mr-1" /> Convert to client
                </Button>
              )}
            </div>

            <div className="border-t pt-3">
              <Label className="text-sm font-semibold">Notes</Label>
              <div className="flex gap-2 mt-2">
                <Textarea rows={2} className="text-sm border-2" value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note…" />
              </div>
              <Button size="sm" className="mt-2 h-9 text-sm" disabled={!newNote.trim()} onClick={async () => { await addNote(newNote); setNewNote(''); }}>Add Note</Button>
              <div className="space-y-2 mt-3">
                {notes.length === 0 && <p className="text-sm text-muted-foreground italic">No notes yet</p>}
                {notes.map(n => (
                  <div key={n.id} className="text-sm border rounded p-3 bg-muted/30">
                    <div className="text-muted-foreground mb-1 text-xs">{new Date(n.created_at).toLocaleString()} · {n.created_by_email || 'Admin'}</div>
                    <div className="whitespace-pre-wrap">{n.note}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

const DetailRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5"><Label className="text-xs uppercase text-muted-foreground">{label}</Label>{children}</div>
);

const EditField = ({ label, value, onSave }: { label: string; value: string | null; onSave: (v: string) => void }) => {
  const [v, setV] = useState(value || '');
  return (
    <DetailRow label={label}>
      <Input
        className="h-10 text-sm border-2"
        value={v}
        onChange={e => setV(e.target.value)}
        onBlur={() => v !== (value || '') && onSave(v)}
      />
    </DetailRow>
  );
};

export default SalesPipeline;
