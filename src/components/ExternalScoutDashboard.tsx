import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2, Globe, SearchIcon, MapPin, Building2, Mail, ExternalLink,
  ChevronDown, ChevronUp, Users, Briefcase, UserPlus, CheckCircle, AlertCircle,
  Filter, FolderOpen, Trash2, ExternalLink as LinkIcon, Sparkles
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { CopyableText } from '@/components/CopyableText';
import { formatDate } from "@/lib/dateFormat";

interface ApolloResult {
  id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  email: string | null;
  email_status: string | null;
  title: string | null;
  headline: string | null;
  linkedin_url: string | null;
  photo_url: string | null;
  location: string;
  organization: {
    name: string;
    website: string | null;
    industry: string | null;
    size: number | null;
  } | null;
  seniority: string | null;
  departments: string[] | null;
}

interface SearchResponse {
  results: ApolloResult[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

const SENIORITY_OPTIONS = [
  { value: 'entry', label: 'Entry Level' },
  { value: 'senior', label: 'Senior' },
  { value: 'manager', label: 'Manager' },
  { value: 'director', label: 'Director' },
  { value: 'vp', label: 'VP' },
  { value: 'c_suite', label: 'C-Suite' },
];

const DEPARTMENT_OPTIONS = [
  { value: 'engineering_technical', label: 'Engineering' },
  { value: 'operations', label: 'Operations' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'sales', label: 'Sales' },
  { value: 'finance', label: 'Finance' },
  { value: 'human_resources', label: 'Human Resources' },
  { value: 'support', label: 'Support' },
  { value: 'information_technology', label: 'IT' },
  { value: 'education', label: 'Education' },
  { value: 'media_communications', label: 'Media & Communications' },
];

const EMPLOYEE_COUNT_OPTIONS = [
  { value: '1,10', label: '1–10' },
  { value: '11,50', label: '11–50' },
  { value: '51,200', label: '51–200' },
  { value: '201,500', label: '201–500' },
  { value: '501,1000', label: '501–1,000' },
  { value: '1001,5000', label: '1,001–5,000' },
  { value: '5001,10000', label: '5,001–10,000' },
  { value: '10001,', label: '10,000+' },
];

const APOLLO_PER_PAGE = 100;

export const ExternalScoutDashboard = () => {
  const { toast } = useToast();
  const [jobTitle, setJobTitle] = useState('');
  const [location, setLocation] = useState('');
  const [seniority, setSeniority] = useState<string[]>([]);
  const [industry, setIndustry] = useState('');
  const [companyDomain, setCompanyDomain] = useState('');
  const [skills, setSkills] = useState('');
  const [tools, setTools] = useState('');
  const [department, setDepartment] = useState<string[]>([]);
  const [employeeCountRange, setEmployeeCountRange] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [resolvingLinkedIn, setResolvingLinkedIn] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('search');
  const [apolloImports, setApolloImports] = useState<any[]>([]);
  const [loadingImports, setLoadingImports] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiParsing, setAiParsing] = useState(false);

  const fetchApolloImports = useCallback(async () => {
    setLoadingImports(true);
    try {
      const { data, error } = await supabase
        .from('applicants_prescreen')
        .select('id, full_name, email, job_title, location, status, candidate_profile, notes, created_at, job_source')
        .eq('job_source', 'Apollo')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setApolloImports(data || []);
    } catch (err) {
      console.error('Error fetching Apollo imports:', err);
    } finally {
      setLoadingImports(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'imports') {
      fetchApolloImports();
    }
  }, [activeTab, fetchApolloImports]);

  const toggleExpanded = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAiOptimize = async () => {
    if (!aiPrompt.trim()) {
      toast({ title: 'Describe who you are looking for', variant: 'destructive' });
      return;
    }
    setAiParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke('apollo-ai-parse', {
        body: { prompt: aiPrompt.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const f = data?.filters ?? {};
      setJobTitle(f.jobTitle || '');
      setLocation(f.location || '');
      setIndustry(f.industry || '');
      setCompanyDomain(f.companyDomain || '');
      setSkills(f.skills || '');
      setTools(f.tools || '');
      setSeniority(Array.isArray(f.seniority) ? f.seniority : []);
      setDepartment(Array.isArray(f.department) ? f.department : []);
      setEmployeeCountRange(Array.isArray(f.employeeCountRange) ? f.employeeCountRange : []);
      if (f.industry || f.companyDomain || f.skills || f.tools || (f.seniority?.length) || (f.department?.length) || (f.employeeCountRange?.length)) {
        setShowAdvanced(true);
      }
      if (!f.skills && !f.jobTitle) {
        toast({ title: 'Add skills', description: 'AI could not detect skills or a job title from your prompt.', variant: 'destructive' });
        return;
      }
      toast({ title: 'Filters applied', description: 'Running search…' });
      await handleSearch(1, f);
    } catch (err: any) {
      console.error('AI optimize error', err);
      toast({ title: 'AI optimize failed', description: err?.message || 'Please try again', variant: 'destructive' });
    } finally {
      setAiParsing(false);
    }
  };



  const handleSearch = async (page = 1, overrides?: {
    jobTitle?: string; location?: string; seniority?: string[]; industry?: string;
    companyDomain?: string; skills?: string; tools?: string; department?: string[];
    employeeCountRange?: string[];
  }) => {
    const eff = {
      jobTitle: overrides?.jobTitle ?? jobTitle,
      location: overrides?.location ?? location,
      seniority: overrides?.seniority ?? seniority,
      industry: overrides?.industry ?? industry,
      companyDomain: overrides?.companyDomain ?? companyDomain,
      skills: overrides?.skills ?? skills,
      tools: overrides?.tools ?? tools,
      department: overrides?.department ?? department,
      employeeCountRange: overrides?.employeeCountRange ?? employeeCountRange,
    };
    if (!eff.skills.trim() && !eff.jobTitle.trim()) {
      toast({ title: 'Skills are required', description: 'Enter at least one skill (or a job title).', variant: 'destructive' });
      return;
    }

    setLoading(true);
    if (page === 1) setResults(null);

    try {
      const { data, error } = await supabase.functions.invoke('search-apollo', {
        body: {
          job_title: eff.jobTitle.trim(),
          location: eff.location.trim() || undefined,
          seniority: eff.seniority.length > 0 ? eff.seniority : undefined,
          industry: eff.industry.trim() || undefined,
          company_domain: eff.companyDomain.trim() || undefined,
          skills: eff.skills.trim() || undefined,
          tools: eff.tools.trim() || undefined,
          department: eff.department.length > 0 ? eff.department : undefined,
          employee_count_range: eff.employeeCountRange.length > 0 ? eff.employeeCountRange : undefined,
          per_page: APOLLO_PER_PAGE,
          page,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      if (page > 1 && Array.isArray(data.results) && data.results.length === 0) {
        setResults(prev => (prev ? { ...prev, total_pages: currentPage } : prev));
        toast({
          title: 'No more candidates',
          description: `You reached the last available Apollo page (${currentPage}).`,
        });
        return;
      }

      const normalizedTotalPages =
        typeof data.total_pages === 'number' && data.total_pages > 1
          ? data.total_pages
          : Array.isArray(data.results) && data.results.length === APOLLO_PER_PAGE
            ? page + 1
            : page;

      const normalizedData = {
        ...data,
        total_pages: normalizedTotalPages,
      };

      setResults(normalizedData);
      setCurrentPage(page);

      toast({
        title: 'Search Complete',
        description: `Found ${data.total} candidates (showing page ${page} of ${normalizedTotalPages}).`,
      });
    } catch (err: any) {
      console.error('Apollo search error:', err);
      toast({
        title: 'Search Failed',
        description: err.message || 'Failed to search Apollo',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (person: ApolloResult) => {
    setImporting(prev => new Set(prev).add(person.id));

    try {
      const emailToUse = person.email || `apollo-pending-${person.id}@unknown.com`;
      
      // Check if applicant with this email already exists
      const { data: existing } = await supabase
        .from('applicants_prescreen')
        .select('id, full_name')
        .eq('email', emailToUse)
        .maybeSingle();

      if (existing) {
        toast({
          title: 'Already exists',
          description: `${existing.full_name} is already in your database.`,
          variant: 'destructive',
        });
        return;
      }

      // Clean masked name (remove asterisks pattern like "Ga***n" → keep as-is for now)
      const cleanName = person.full_name || `${person.first_name || ''} ${person.last_name || ''}`.trim() || 'Unknown';

      const { error } = await supabase.from('applicants_prescreen').insert({
        full_name: cleanName,
        email: emailToUse,
        location: person.location || 'Unknown',
        job_title: person.title || jobTitle,
        apply_url: person.linkedin_url || 'apollo-import',
        status: 'Apollo Import',
        home_office: false,
        noise_canceling_headset: false,
        laptop_or_pc: false,
        good_internet: false,
        internet_speed: 'Unknown',
        power_backup: false,
        can_work_40_50: false,
        us_timezone_ok: false,
        has_experience: true,
        currently_working: true,
        start_availability: 'TBD',
        job_source: 'Apollo',
        candidate_profile: [
          person.headline,
          person.organization ? `Currently at ${person.organization.name}` : null,
          person.organization?.industry ? `Industry: ${person.organization.industry}` : null,
        ].filter(Boolean).join('\n'),
        notes: [
          'Sourced from Apollo.io',
          `LinkedIn: ${person.linkedin_url || 'N/A'}`,
          person.email ? `Email: ${person.email} (${person.email_status || 'Unknown'})` : 'Email: Not revealed on Apollo',
        ].join('\n'),
      });

      if (error) throw error;

      setImported(prev => new Set(prev).add(person.id));
      toast({ title: 'Imported!', description: `${cleanName} added to Apollo Imports.` });
    } catch (err: any) {
      console.error('Import error:', err);
      toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
    } finally {
      setImporting(prev => {
        const next = new Set(prev);
        next.delete(person.id);
        return next;
      });
    }
  };

  const getLinkedInHref = (person: ApolloResult) => {
    if (person.linkedin_url) return person.linkedin_url;

    const query = [person.full_name, person.title]
      .filter(Boolean)
      .join(' ')
      .trim();

    return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
  };

  const handleLinkedInClick = async (
    e: React.MouseEvent<HTMLAnchorElement>,
    person: ApolloResult,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (person.linkedin_url) {
      window.open(person.linkedin_url, '_blank', 'noopener,noreferrer');
      return;
    }

    setResolvingLinkedIn(prev => new Set(prev).add(person.id));

    try {
      const { data, error } = await supabase.functions.invoke('resolve-apollo-linkedin', {
        body: {
          person_id: person.id,
          full_name: person.full_name,
          first_name: person.first_name,
          last_name: person.last_name,
          title: person.title,
          organization_name: person.organization?.name,
          organization_website: person.organization?.website,
        },
      });

      if (error) throw error;

      const exactLinkedIn = typeof data?.linkedin_url === 'string' ? data.linkedin_url : null;

      if (exactLinkedIn) {
        setResults(prev => prev
          ? {
              ...prev,
              results: prev.results.map(candidate =>
                candidate.id === person.id
                  ? { ...candidate, linkedin_url: exactLinkedIn }
                  : candidate
              ),
            }
          : prev
        );

        window.open(exactLinkedIn, '_blank', 'noopener,noreferrer');
        return;
      }

      window.open(getLinkedInHref(person), '_blank', 'noopener,noreferrer');
      toast({
        title: 'Exact profile unavailable',
        description: 'Opened LinkedIn search as fallback.',
      });
    } catch (err) {
      console.error('Resolve LinkedIn error:', err);
      window.open(getLinkedInHref(person), '_blank', 'noopener,noreferrer');
      toast({
        title: 'Using LinkedIn search fallback',
        description: 'Could not fetch the exact profile from Apollo.',
      });
    } finally {
      setResolvingLinkedIn(prev => {
        const next = new Set(prev);
        next.delete(person.id);
        return next;
      });
    }
  };

  const getEmailStatusBadge = (status: string | null) => {
    if (!status) return null;
    switch (status) {
      case 'verified':
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs"><CheckCircle className="w-3 h-3 mr-1" />Verified</Badge>;
      case 'guessed':
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs"><AlertCircle className="w-3 h-3 mr-1" />Guessed</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  const handleDeleteImport = async (id: string) => {
    try {
      const { error } = await supabase.from('applicants_prescreen').delete().eq('id', id);
      if (error) throw error;
      setApolloImports(prev => prev.filter(a => a.id !== id));
      toast({ title: 'Removed', description: 'Candidate removed from Apollo Imports.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Globe className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">External Scout</h2>
          <p className="text-muted-foreground text-sm">
            Search for external candidates via Apollo.io — find talent beyond your existing database
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="search" className="gap-1.5">
            <SearchIcon className="w-3.5 h-3.5" />
            Search
          </TabsTrigger>
          <TabsTrigger value="imports" className="gap-1.5">
            <FolderOpen className="w-3.5 h-3.5" />
            Imports
            {apolloImports.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{apolloImports.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="space-y-6 mt-4">
          {/* AI Search Assistant */}
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <Label className="font-semibold">Describe who you're looking for</Label>
                <Badge variant="secondary" className="text-[10px]">AI · Free</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                e.g. "Automation specialists in the Philippines who know Zapier, Asana and Airtable at small SaaS companies"
              </p>
              <Textarea
                placeholder="Explain the role, skills, tools, seniority, location, company size…"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAiOptimize();
                }}
                rows={2}
                className="resize-none"
              />
              <div className="flex justify-end">
                <Button onClick={handleAiOptimize} disabled={aiParsing || loading} className="gap-2">
                  {aiParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {aiParsing ? 'Optimizing…' : 'Optimize & Search'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Search Form */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="apollo-skills-main" className="font-semibold">Skills *</Label>
                  <Input
                    id="apollo-skills-main"
                    placeholder="e.g. Copywriting, SEO, Bookkeeping, Zapier"
                    value={skills}
                    onChange={(e) => setSkills(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Comma-separated — we match profiles with these skills</p>
                </div>
                <div>
              <Label htmlFor="apollo-location" className="font-semibold">Location</Label>
              <Input
                id="apollo-location"
                placeholder="e.g. Philippines, South Africa"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div>
              <Label className="font-semibold">Seniority</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between font-normal mt-1">
                    {seniority.length === 0
                      ? 'Any level'
                      : seniority.length === 1
                        ? SENIORITY_OPTIONS.find(o => o.value === seniority[0])?.label || seniority[0]
                        : `${seniority.length} selected`}
                    <ChevronDown className="w-4 h-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-2" align="start">
                  <div className="space-y-1">
                    {SENIORITY_OPTIONS.map(opt => (
                      <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                        <Checkbox
                          checked={seniority.includes(opt.value)}
                          onCheckedChange={(checked) => {
                            setSeniority(prev =>
                              checked
                                ? [...prev, opt.value]
                                : prev.filter(s => s !== opt.value)
                            );
                          }}
                        />
                        {opt.label}
                      </label>
                    ))}
                    {seniority.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs mt-1"
                        onClick={() => setSeniority([])}
                      >
                        Clear all
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Advanced Filters Toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <Filter className="w-3.5 h-3.5" />
            {showAdvanced ? 'Hide' : 'Show'} Advanced Filters
            {(jobTitle || industry || companyDomain || tools || department.length > 0 || employeeCountRange.length > 0) && (
              <Badge variant="secondary" className="text-xs ml-1">Active</Badge>
            )}
          </Button>

          {/* Advanced Filters */}
          {showAdvanced && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-lg border bg-muted/30">
              <div>
                <Label htmlFor="apollo-industry" className="font-semibold text-sm">Industry</Label>
                <Input
                  id="apollo-industry"
                  placeholder="e.g. Construction, IT"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <div>
                <Label htmlFor="apollo-company" className="font-semibold text-sm">Company Domain</Label>
                <Input
                  id="apollo-company"
                  placeholder="e.g. microsoft.com"
                  value={companyDomain}
                  onChange={(e) => setCompanyDomain(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <div>
                <Label htmlFor="apollo-title" className="font-semibold text-sm">Job Title (optional)</Label>
                <Input
                  id="apollo-title"
                  placeholder="e.g. Virtual Assistant"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <p className="text-[10px] text-muted-foreground mt-1">Narrows results to a title</p>
              </div>
              <div>
                <Label htmlFor="apollo-tools" className="font-semibold text-sm">Tools</Label>
                <Input
                  id="apollo-tools"
                  placeholder="e.g. HubSpot, QuickBooks, Figma"
                  value={tools}
                  onChange={(e) => setTools(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <p className="text-[10px] text-muted-foreground mt-1">Comma-separated tools</p>
              </div>
              <div>
                <Label className="font-semibold text-sm">Department</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between font-normal mt-1 h-9">
                      {department.length === 0
                        ? 'Any department'
                        : department.length === 1
                          ? DEPARTMENT_OPTIONS.find(o => o.value === department[0])?.label || department[0]
                          : `${department.length} selected`}
                      <ChevronDown className="w-4 h-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[220px] p-2" align="start">
                    <div className="space-y-1 max-h-[250px] overflow-y-auto">
                      {DEPARTMENT_OPTIONS.map(opt => (
                        <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                          <Checkbox
                            checked={department.includes(opt.value)}
                            onCheckedChange={(checked) => {
                              setDepartment(prev =>
                                checked
                                  ? [...prev, opt.value]
                                  : prev.filter(d => d !== opt.value)
                              );
                            }}
                          />
                          {opt.label}
                        </label>
                      ))}
                      {department.length > 0 && (
                        <Button variant="ghost" size="sm" className="w-full text-xs mt-1" onClick={() => setDepartment([])}>
                          Clear all
                        </Button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="font-semibold text-sm">Company Size</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between font-normal mt-1 h-9">
                      {employeeCountRange.length === 0
                        ? 'Any size'
                        : employeeCountRange.length === 1
                          ? EMPLOYEE_COUNT_OPTIONS.find(o => o.value === employeeCountRange[0])?.label || employeeCountRange[0]
                          : `${employeeCountRange.length} selected`}
                      <ChevronDown className="w-4 h-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-2" align="start">
                    <div className="space-y-1">
                      {EMPLOYEE_COUNT_OPTIONS.map(opt => (
                        <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                          <Checkbox
                            checked={employeeCountRange.includes(opt.value)}
                            onCheckedChange={(checked) => {
                              setEmployeeCountRange(prev =>
                                checked
                                  ? [...prev, opt.value]
                                  : prev.filter(r => r !== opt.value)
                              );
                            }}
                          />
                          {opt.label}
                        </label>
                      ))}
                      {employeeCountRange.length > 0 && (
                        <Button variant="ghost" size="sm" className="w-full text-xs mt-1" onClick={() => setEmployeeCountRange([])}>
                          Clear all
                        </Button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          <Button onClick={() => handleSearch(1)} disabled={loading} className="w-full gap-2" size="lg">
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Searching Apollo...</>
            ) : (
              <><SearchIcon className="w-4 h-4" /> Search External Candidates</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="w-4 h-4" />
              <span>{results.total.toLocaleString()} candidates found</span>
              <span>•</span>
              <span>Page {results.page} of {results.total_pages}</span>
            </div>
          </div>

          {results.results.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-lg font-medium">No candidates found</p>
                <p className="text-muted-foreground text-sm mt-1">Try different search terms or broaden your filters.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {results.results.map((person) => (
                <Card
                  key={person.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => toggleExpanded(person.id)}
                >
                  <CardContent className="pt-4 pb-4">
                    {/* Main Row */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {person.photo_url ? (
                          <img
                            src={person.photo_url}
                            alt={person.full_name}
                            className="w-10 h-10 rounded-full object-cover shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <span className="text-sm font-bold text-muted-foreground">
                              {person.first_name?.[0]}{person.last_name?.[0]}
                            </span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-base">{person.full_name}</span>
                            {person.email_status && getEmailStatusBadge(person.email_status)}
                          </div>
                          <p className="text-sm text-muted-foreground">{person.title || 'No title'}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            {person.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {person.location}
                              </span>
                            )}
                            {person.organization && (
                              <span className="flex items-center gap-1">
                                <Building2 className="w-3 h-3" /> {person.organization.name}
                              </span>
                            )}
                            <a
                              href={getLinkedInHref(person)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-flex items-center gap-1 text-primary hover:underline font-medium ${resolvingLinkedIn.has(person.id) ? 'opacity-60 pointer-events-none' : ''}`}
                              onClick={(e) => handleLinkedInClick(e, person)}
                            >
                              {resolvingLinkedIn.has(person.id)
                                ? <><Loader2 className="w-3 h-3 animate-spin" /> Finding profile...</>
                                : <><ExternalLink className="w-3 h-3" /> {person.linkedin_url ? 'LinkedIn' : 'Find on LinkedIn'}</>}
                            </a>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {imported.has(person.id) ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                            <CheckCircle className="w-3 h-3 mr-1" /> Imported
                          </Badge>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            disabled={importing.has(person.id)}
                            onClick={(e) => { e.stopPropagation(); handleImport(person); }}
                          >
                            {importing.has(person.id) ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <UserPlus className="w-3 h-3" />
                            )}
                            Import
                          </Button>
                        )}
                        {expandedCards.has(person.id) ? (
                          <ChevronUp className="w-5 h-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {expandedCards.has(person.id) && (
                      <div className="mt-4 pt-4 border-t space-y-3" onClick={(e) => e.stopPropagation()}>
                        {/* Quick Summary */}
                        <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                          <p className="text-sm font-medium mb-1.5 flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-primary" /> Candidate Summary
                          </p>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            <span className="font-medium text-foreground">{person.full_name}</span>
                            {person.title && <> is a <span className="font-medium text-foreground">{person.title}</span></>}
                            {person.organization && <> at <span className="font-medium text-foreground">{person.organization.name}</span></>}
                            {person.location && <>, based in <span className="font-medium text-foreground">{person.location}</span></>}
                            {person.seniority && <> ({person.seniority} level)</>}
                            .
                            {person.organization?.industry && <> Works in the <span className="font-medium text-foreground">{person.organization.industry}</span> industry.</>}
                            {person.organization?.size && <> Company has ~{person.organization.size.toLocaleString()} employees.</>}
                            {person.departments && person.departments.length > 0 && <> Department: {person.departments.join(', ')}.</>}
                          </p>
                          {person.headline && (
                            <p className="text-sm text-muted-foreground italic mt-1.5 border-t border-primary/10 pt-1.5">"{person.headline}"</p>
                          )}
                        </div>

                        {/* LinkedIn & Contact */}
                        <div className="flex flex-wrap gap-3">
                          <a
                            href={getLinkedInHref(person)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 text-sm font-medium transition-colors ${resolvingLinkedIn.has(person.id) ? 'opacity-60 pointer-events-none' : ''}`}
                            onClick={(e) => handleLinkedInClick(e, person)}
                          >
                            {resolvingLinkedIn.has(person.id)
                              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Finding exact profile...</>
                              : <><ExternalLink className="w-3.5 h-3.5" /> {person.linkedin_url ? 'View LinkedIn Profile' : 'Find on LinkedIn'}</>}
                          </a>
                          {person.email && (
                            <div className="flex items-center gap-2">
                              <CopyableText text={person.email} />
                              {person.email_status && getEmailStatusBadge(person.email_status)}
                            </div>
                          )}
                        </div>

                        {/* Company Details */}
                        {person.organization && (
                          <div className="p-3 rounded-lg bg-muted/50">
                            <p className="text-sm font-medium mb-1 flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5" /> Company
                            </p>
                            <div className="text-sm text-muted-foreground space-y-0.5">
                              <p className="font-medium text-foreground">{person.organization.name}</p>
                              {person.organization.industry && <p>Industry: {person.organization.industry}</p>}
                              {person.organization.size && <p>Size: ~{person.organization.size.toLocaleString()} employees</p>}
                              {person.organization.website && (
                                <a href={person.organization.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                  {person.organization.website}
                                </a>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Tags */}
                        <div className="flex flex-wrap gap-2">
                          {person.seniority && <Badge variant="outline">{person.seniority}</Badge>}
                          {person.departments?.map((dept, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">{dept}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1 || loading}
              onClick={() => handleSearch(currentPage - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground px-2">
              Page {currentPage} of {results.total_pages} ({results.total.toLocaleString()} total)
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= results.total_pages || loading}
              onClick={() => handleSearch(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
        </TabsContent>

        <TabsContent value="imports" className="space-y-4 mt-4">
          {loadingImports ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : apolloImports.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-lg font-medium">No Apollo imports yet</p>
                <p className="text-muted-foreground text-sm mt-1">
                  Search for candidates and click Import to add them here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="w-4 h-4" />
                <span>{apolloImports.length} imported candidate{apolloImports.length !== 1 ? 's' : ''}</span>
              </div>
              {apolloImports.map((person) => (
                <Card key={person.id}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-muted-foreground">
                            {person.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-base">{person.full_name}</span>
                          <p className="text-sm text-muted-foreground">{person.job_title || 'No title'}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            {person.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {person.location}
                              </span>
                            )}
                            {person.email && !person.email.includes('@unknown.com') && (
                              <CopyableText text={person.email} />
                            )}
                            {person.email?.includes('@unknown.com') && (
                              <Badge variant="outline" className="text-xs">No email revealed</Badge>
                            )}
                            {person.apply_url && person.apply_url !== 'apollo-import' && (
                              <a
                                href={person.apply_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-primary hover:underline text-xs font-medium"
                              >
                                <ExternalLink className="w-3 h-3" /> LinkedIn
                              </a>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Imported {formatDate(person.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary" className="text-xs">{person.status}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDeleteImport(person.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
