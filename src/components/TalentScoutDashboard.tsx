import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, SearchIcon, Target, Users, MapPin, Star, FileText, CheckCircle, XCircle, Sparkles, Plus, X, ChevronDown, ChevronUp, History, Trash2, ShieldAlert, BarChart3, AlertTriangle, Briefcase, Eye } from 'lucide-react';
import { CopyableText } from '@/components/CopyableText';
import { CandidateDetailDialog } from '@/components/CandidateDetailDialog';
import { CVImagePreview } from '@/components/CVImagePreview';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useStageSettings } from '@/hooks/useStageSettings';
import { formatDate, formatTime } from "@/lib/dateFormat";

interface ScoreBreakdown {
  experience_relevance: number;
  skills_match: number;
  tools_match: number;
  industry_fit: number;
  overall_potential: number;
}

interface ScoutResult {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  whatsapp: string | null;
  job_title: string;
  location: string;
  status: string;
  years_of_experience: number | null;
  existing_score: number | null;
  cv_file_url: string | null;
  is_starred: boolean;
  match_score: number;
  match_tier: string;
  matched_requirements: string[];
  missing_requirements: string[];
  ai_reasoning: string;
  score_breakdown: ScoreBreakdown | null;
}

interface ScoutResponse {
  results: ScoutResult[];
  total_scanned: number;
  shortlisted_count: number;
  failed_must_have_count?: number;
  ai_evaluated: boolean;
  message?: string;
  error?: string;
}

interface CachedSearch {
  id: string;
  job_title: string;
  searched_at: string;
  requirements: string[];
  must_have_requirements: string[];
  preferred_skills: string[];
  status_filter: string[];
  max_results: number;
  job_description: string;
  response: ScoutResponse;
}

const CACHE_KEY = 'talent_scout_search_history';
const MAX_CACHED_SEARCHES = 10;

const loadCachedSearches = (): CachedSearch[] => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const saveCachedSearches = (searches: CachedSearch[]) => {
  localStorage.setItem(CACHE_KEY, JSON.stringify(searches.slice(0, MAX_CACHED_SEARCHES)));
};

const STATUS_OPTIONS = [
  'For Review', 'For Interview', 'SIV', 'Pitch', 'Client Interview',
  'Hired', 'Bench', 'Reject', 'Archive', 'Archived', 'Talent Pool'
];

const DEFAULT_STATUSES = ['Talent Pool', 'Bench'];

const SCORE_CATEGORIES = [
  { key: 'experience_relevance', label: 'Experience Relevance', max: 35, color: 'bg-blue-500' },
  { key: 'skills_match', label: 'Skills Match', max: 30, color: 'bg-emerald-500' },
  { key: 'tools_match', label: 'Tools Match', max: 20, color: 'bg-violet-500' },
  { key: 'industry_fit', label: 'Industry Fit', max: 10, color: 'bg-amber-500' },
  { key: 'overall_potential', label: 'Overall Potential', max: 5, color: 'bg-pink-500' },
] as const;

export const TalentScoutDashboard = () => {
  const { toast } = useToast();
  const { getDisplayName, orderStages } = useStageSettings();
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [requirements, setRequirements] = useState<string[]>(['']);
  const [mustHaveRequirements, setMustHaveRequirements] = useState<string[]>([]);
  const [preferredSkills, setPreferredSkills] = useState<string[]>(['']);
  const [statusFilter, setStatusFilter] = useState<string[]>(DEFAULT_STATUSES);
  const [maxResults, setMaxResults] = useState(20);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScoutResponse | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [rawJD, setRawJD] = useState('');
  const [cachedSearches, setCachedSearches] = useState<CachedSearch[]>(loadCachedSearches());
  const [showHistory, setShowHistory] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [cvPreview, setCvPreview] = useState<{ url: string; name: string } | null>(null);
  const [postedJobs, setPostedJobs] = useState<{ id: string; title: string; description: string | null; qualifications: string[] | null; responsibilities: string[] | null }[]>([]);

  // Fetch posted jobs on mount
  useEffect(() => {
    const fetchJobs = async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, title, description, qualifications, responsibilities')
        .eq('is_active', true)
        .order('title', { ascending: true });
      if (data) setPostedJobs(data);
    };
    fetchJobs();
  }, []);

  const handleJobSelect = (jobId: string) => {
    if (jobId === 'none') return;
    const job = postedJobs.find(j => j.id === jobId);
    if (!job) return;
    setJobTitle(job.title);
    if (job.description) setJobDescription(job.description);
    const reqs = [
      ...(job.qualifications || []),
      ...(job.responsibilities || []),
    ].filter(Boolean);
    if (reqs.length > 0) setRequirements(reqs);
    toast({ title: 'Job loaded', description: `Auto-filled from "${job.title}"` });
  };

  const addRequirement = () => setRequirements(prev => [...prev, '']);
  const removeRequirement = (idx: number) => setRequirements(prev => prev.filter((_, i) => i !== idx));
  const updateRequirement = (idx: number, val: string) => setRequirements(prev => prev.map((r, i) => i === idx ? val : r));

  const addMustHave = () => setMustHaveRequirements(prev => [...prev, '']);
  const removeMustHave = (idx: number) => setMustHaveRequirements(prev => prev.filter((_, i) => i !== idx));
  const updateMustHave = (idx: number, val: string) => setMustHaveRequirements(prev => prev.map((r, i) => i === idx ? val : r));

  const addSkill = () => setPreferredSkills(prev => [...prev, '']);
  const removeSkill = (idx: number) => setPreferredSkills(prev => prev.filter((_, i) => i !== idx));
  const updateSkill = (idx: number, val: string) => setPreferredSkills(prev => prev.map((s, i) => i === idx ? val : s));

  const toggleStatus = (status: string) => {
    setStatusFilter(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const toggleExpanded = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const loadCachedSearch = (cached: CachedSearch) => {
    setJobTitle(cached.job_title);
    setJobDescription(cached.job_description);
    setRequirements(cached.requirements.length ? cached.requirements : ['']);
    setMustHaveRequirements(cached.must_have_requirements || []);
    setPreferredSkills(cached.preferred_skills.length ? cached.preferred_skills : ['']);
    setStatusFilter(cached.status_filter);
    setMaxResults(cached.max_results);
    setResults(cached.response);
    setShowHistory(false);
    toast({ title: 'Loaded cached results', description: `Showing saved results for "${cached.job_title}"` });
  };

  const deleteCachedSearch = (id: string) => {
    const updated = cachedSearches.filter(c => c.id !== id);
    setCachedSearches(updated);
    saveCachedSearches(updated);
  };

  const clearAllCache = () => {
    setCachedSearches([]);
    localStorage.removeItem(CACHE_KEY);
    toast({ title: 'Search history cleared' });
  };

  const handleParseJD = async () => {
    if (!rawJD.trim()) {
      toast({ title: 'Paste a job description first', variant: 'destructive' });
      return;
    }
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-job-description', {
        body: { content: rawJD.trim() }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const parsed = data.data || data;

      if (parsed.title) {
        setJobTitle(parsed.title);
      } else {
        const firstLine = rawJD.trim().split('\n')[0].trim();
        const possibleTitle = firstLine.length < 80 ? firstLine.replace(/^(job\s*title|position|role)\s*[:|-]\s*/i, '') : '';
        if (possibleTitle) setJobTitle(possibleTitle);
      }

      if (parsed.qualifications?.length) {
        setRequirements(parsed.qualifications);
      }
      if (parsed.responsibilities?.length) {
        setPreferredSkills(parsed.responsibilities.slice(0, 5));
      }
      if (parsed.description) {
        setJobDescription(parsed.description);
      }

      toast({ title: 'Parsed!', description: `Extracted ${parsed.qualifications?.length || 0} requirements and ${parsed.responsibilities?.length || 0} responsibilities.` });
    } catch (err: any) {
      console.error('Parse error:', err);
      toast({ title: 'Parse failed', description: err.message, variant: 'destructive' });
    } finally {
      setParsing(false);
    }
  };

  const initiateScout = () => {
    if (!jobTitle.trim()) {
      toast({ title: 'Job title required', variant: 'destructive' });
      return;
    }

    const filteredReqs = requirements.filter(r => r.trim());
    const filteredMustHaves = mustHaveRequirements.filter(r => r.trim());

    if (filteredReqs.length === 0 && filteredMustHaves.length === 0 && !jobDescription.trim()) {
      toast({ title: 'Add requirements or a job description', variant: 'destructive' });
      return;
    }

    // If Reject is in the filter, show confirmation dialog
    if (statusFilter.includes('Reject')) {
      setShowRejectConfirm(true);
      return;
    }

    handleScout();
  };

  const handleScoutWithoutReject = () => {
    setShowRejectConfirm(false);
    const filteredStatuses = statusFilter.filter(s => s !== 'Reject');
    setStatusFilter(filteredStatuses);
    // Run scout with filtered statuses directly
    handleScout(filteredStatuses);
  };

  const handleScoutWithReject = () => {
    setShowRejectConfirm(false);
    handleScout();
  };

  const handleScout = async (overrideStatuses?: string[]) => {
    const filteredReqs = requirements.filter(r => r.trim());
    const filteredMustHaves = mustHaveRequirements.filter(r => r.trim());
    const filteredSkills = preferredSkills.filter(s => s.trim());

    setLoading(true);
    setResults(null);

    try {
      const { data, error } = await supabase.functions.invoke('scout-talent', {
        body: {
          job_title: jobTitle.trim(),
          job_description: jobDescription.trim(),
          requirements: filteredReqs,
          must_have_requirements: filteredMustHaves,
          preferred_skills: filteredSkills,
          status_filter: overrideStatuses || statusFilter,
          max_results: maxResults,
        }
      });

      if (error) throw error;

      if (data.error) {
        toast({ title: 'Scout Error', description: data.error, variant: 'destructive' });
        return;
      }

      setResults(data);

      const cachedEntry: CachedSearch = {
        id: crypto.randomUUID(),
        job_title: jobTitle.trim(),
        searched_at: new Date().toISOString(),
        requirements: filteredReqs,
        must_have_requirements: filteredMustHaves,
        preferred_skills: filteredSkills,
        status_filter: statusFilter,
        max_results: maxResults,
        job_description: jobDescription.trim(),
        response: data,
      };
      const updated = [cachedEntry, ...cachedSearches.filter(c => c.job_title.toLowerCase() !== jobTitle.trim().toLowerCase())].slice(0, MAX_CACHED_SEARCHES);
      setCachedSearches(updated);
      saveCachedSearches(updated);

      toast({
        title: 'Scouting Complete',
        description: `Found ${data.results.length} matching candidates from ${data.total_scanned} scanned.`,
      });
    } catch (err: any) {
      console.error('Scout error:', err);
      toast({ title: 'Error', description: err.message || 'Failed to scout talent', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const getMatchColor = (tier: string) => {
    switch (tier) {
      case 'Strong Match': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30';
      case 'Partial Match': return 'bg-amber-500/10 text-amber-600 border-amber-500/30';
      default: return 'bg-red-500/10 text-red-600 border-red-500/30';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 50) return 'text-amber-600';
    return 'text-red-500';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Target className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Talent Scout</h2>
          <p className="text-muted-foreground text-sm">
            Paste a job description and find matching candidates from your applicant database
          </p>
        </div>
      </div>

      {/* Search History */}
      {cachedSearches.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
                className="gap-2 text-muted-foreground"
              >
                <History className="w-4 h-4" />
                Previous Searches ({cachedSearches.length})
                {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
              {showHistory && (
                <Button variant="ghost" size="sm" onClick={clearAllCache} className="gap-1 text-xs text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-3 h-3" /> Clear All
                </Button>
              )}
            </div>
            {showHistory && (
              <div className="mt-3 space-y-2">
                {cachedSearches.map(cached => (
                  <div
                    key={cached.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => loadCachedSearch(cached)}>
                      <p className="font-medium text-sm truncate">{cached.job_title}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>{cached.response.results.length} matches</span>
                        <span>•</span>
                        <span>{cached.response.total_scanned} scanned</span>
                        <span>•</span>
                        <span>{formatDate(cached.searched_at)} {formatTime(cached.searched_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => loadCachedSearch(cached)} title="Load cached results">
                        <SearchIcon className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteCachedSearch(cached.id)} title="Delete from history">
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Parse */}
      <Card className="border-dashed border-2">
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <Label className="font-semibold text-base">Quick Parse — Paste a Job Description</Label>
          </div>
          <p className="text-sm text-muted-foreground">
            Paste the full job posting below and click "Parse" to auto-fill the title, requirements, and skills.
          </p>
          <Textarea
            placeholder="Paste job description here... (e.g. from a job board, email, or client brief)"
            value={rawJD}
            onChange={(e) => setRawJD(e.target.value)}
            rows={6}
          />
          <Button onClick={handleParseJD} disabled={parsing || !rawJD.trim()} className="gap-2">
            {parsing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Parsing...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Parse &amp; Auto-Fill</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Input Form */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          {/* Quick-fill from posted jobs */}
          {postedJobs.length > 0 && (
            <div>
              <Label className="font-semibold flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                Load from Posted Jobs
              </Label>
              <Select onValueChange={handleJobSelect}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a job to auto-fill..." />
                </SelectTrigger>
                <SelectContent>
                  {postedJobs.map(job => (
                    <SelectItem key={job.id} value={job.id}>{job.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="scout-title" className="font-semibold">Job Title *</Label>
            <Input
              id="scout-title"
              placeholder="e.g. Virtual Assistant, Customer Service Rep"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="scout-desc" className="font-semibold">Job Description</Label>
            <Textarea
              id="scout-desc"
              placeholder="Paste the full job description here..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={5}
            />
          </div>

          {/* Must-Have Requirements */}
          <div className="p-4 border-2 border-red-500/20 rounded-lg bg-red-500/5">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="w-5 h-5 text-red-500" />
              <Label className="font-semibold text-red-600 dark:text-red-400">Must-Have Requirements</Label>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Candidates missing ANY of these will be automatically disqualified. Use for non-negotiable requirements.
            </p>
            <div className="space-y-2">
              {mustHaveRequirements.map((req, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    placeholder={`e.g. Salesforce experience, Spanish fluency`}
                    value={req}
                    onChange={(e) => updateMustHave(idx, e.target.value)}
                    className="border-red-500/20 focus-visible:ring-red-500/30"
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeMustHave(idx)} className="text-red-500 hover:text-red-600">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addMustHave} className="gap-1 border-red-500/20 text-red-600 hover:bg-red-500/5">
                <Plus className="w-3 h-3" /> Add Must-Have
              </Button>
            </div>
          </div>

          <div>
            <Label className="font-semibold">Key Requirements</Label>
            <p className="text-xs text-muted-foreground mb-1">Important but not deal-breakers — candidates will be scored on these.</p>
            <div className="space-y-2 mt-1">
              {requirements.map((req, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    placeholder={`e.g. 2+ years customer service experience`}
                    value={req}
                    onChange={(e) => updateRequirement(idx, e.target.value)}
                  />
                  {requirements.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeRequirement(idx)}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addRequirement} className="gap-1">
                <Plus className="w-3 h-3" /> Add Requirement
              </Button>
            </div>
          </div>

          <div>
            <Label className="font-semibold">Preferred Skills / Tools</Label>
            <div className="space-y-2 mt-1">
              {preferredSkills.map((skill, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    placeholder={`e.g. Salesforce, HubSpot, Spanish`}
                    value={skill}
                    onChange={(e) => updateSkill(idx, e.target.value)}
                  />
                  {preferredSkills.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeSkill(idx)}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addSkill} className="gap-1">
                <Plus className="w-3 h-3" /> Add Skill
              </Button>
            </div>
          </div>

          {/* Include Rejected toggle - visible by default */}
          <div className="flex items-center gap-3 p-3 border rounded-lg border-amber-500/30 bg-amber-500/5">
            <Checkbox
              id="include-reject"
              checked={statusFilter.includes('Reject')}
              onCheckedChange={() => toggleStatus('Reject')}
            />
            <label htmlFor="include-reject" className="flex items-center gap-2 text-sm cursor-pointer">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>Include rejected candidates in search</span>
            </label>
          </div>

          {/* Filters Toggle */}
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-1 text-muted-foreground"
            >
              {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Advanced Filters
            </Button>

            {showFilters && (
              <div className="mt-2 space-y-3 p-4 border rounded-lg bg-muted/30">
                <div>
                  <Label className="text-sm font-medium">Search in statuses:</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {orderStages(STATUS_OPTIONS.filter(s => s !== 'Reject')).map(status => (
                      <label key={status} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <Checkbox
                          checked={statusFilter.includes(status)}
                          onCheckedChange={() => toggleStatus(status)}
                        />
                        {getDisplayName(status)}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium whitespace-nowrap">Max results:</Label>
                  <Input
                    type="number"
                    value={maxResults}
                    onChange={(e) => setMaxResults(Number(e.target.value) || 20)}
                    className="w-20"
                    min={5}
                    max={50}
                  />
                </div>
              </div>
            )}
          </div>

          <Button onClick={initiateScout} disabled={loading} className="w-full gap-2" size="lg">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Scouting talent...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Scout Matching Candidates
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="flex flex-wrap gap-4">
            <Card className="flex-1 min-w-[130px]">
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <Users className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{results.total_scanned}</p>
                  <p className="text-xs text-muted-foreground">CVs Scanned</p>
                </div>
              </CardContent>
            </Card>
            {(results.failed_must_have_count ?? 0) > 0 && (
              <Card className="flex-1 min-w-[130px] border-red-500/20">
                <CardContent className="pt-4 pb-4 flex items-center gap-3">
                  <ShieldAlert className="w-5 h-5 text-red-500" />
                  <div>
                    <p className="text-2xl font-bold text-red-500">{results.failed_must_have_count}</p>
                    <p className="text-xs text-muted-foreground">Disqualified</p>
                  </div>
                </CardContent>
              </Card>
            )}
            <Card className="flex-1 min-w-[130px]">
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <SearchIcon className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{results.shortlisted_count}</p>
                  <p className="text-xs text-muted-foreground">Keyword Matches</p>
                </div>
              </CardContent>
            </Card>
            <Card className="flex-1 min-w-[130px]">
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <Target className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{results.results.length}</p>
                  <p className="text-xs text-muted-foreground">Final Matches</p>
                </div>
              </CardContent>
            </Card>
            <Card className="flex-1 min-w-[130px]">
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{results.ai_evaluated ? 'Yes' : 'No'}</p>
                  <p className="text-xs text-muted-foreground">AI Evaluated</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {results.results.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-lg font-medium">No matching candidates found</p>
                <p className="text-muted-foreground text-sm mt-1">
                  {results.message || 'Try broadening your requirements or including more statuses.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {results.results.map((result, index) => (
                <Card
                  key={result.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => toggleExpanded(result.id)}
                >
                  <CardContent className="pt-4 pb-4">
                    {/* Main Row */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold shrink-0 ${getScoreColor(result.match_score)} bg-muted`}>
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-base">{result.full_name}</span>
                            {result.is_starred && <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />}
                            <Badge variant="outline" className="text-xs">{getDisplayName(result.status)}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{result.job_title}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            {result.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {result.location}
                              </span>
                            )}
                            {result.years_of_experience && (
                              <span>{result.years_of_experience} yrs exp</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className={`text-2xl font-bold ${getScoreColor(result.match_score)}`}>
                            {result.match_score}%
                          </p>
                          <Badge className={`text-xs ${getMatchColor(result.match_tier)}`}>
                            {result.match_tier}
                          </Badge>
                        </div>
                        {expandedCards.has(result.id) ? (
                          <ChevronUp className="w-5 h-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {expandedCards.has(result.id) && (
                      <div className="mt-4 pt-4 border-t space-y-4" onClick={(e) => e.stopPropagation()}>
                        {/* AI Reasoning */}
                        {result.ai_reasoning && (
                          <div className="p-3 rounded-lg bg-muted/50">
                            <p className="text-sm font-medium mb-1 flex items-center gap-1">
                              <Sparkles className="w-3.5 h-3.5" /> AI Assessment
                            </p>
                            <p className="text-sm text-muted-foreground">{result.ai_reasoning}</p>
                          </div>
                        )}

                        {/* Score Breakdown */}
                        {result.score_breakdown && (
                          <div className="p-4 rounded-lg border bg-muted/20">
                            <p className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                              <BarChart3 className="w-4 h-4 text-primary" /> Score Breakdown
                            </p>
                            <div className="space-y-3">
                              {SCORE_CATEGORIES.map(cat => {
                                const value = result.score_breakdown![cat.key as keyof ScoreBreakdown] || 0;
                                const percentage = (value / cat.max) * 100;
                                return (
                                  <div key={cat.key}>
                                    <div className="flex items-center justify-between text-xs mb-1">
                                      <span className="text-muted-foreground">{cat.label}</span>
                                      <span className="font-semibold">{value}/{cat.max}</span>
                                    </div>
                                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${cat.color}`}
                                        style={{ width: `${Math.min(100, percentage)}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                              <div className="pt-2 border-t mt-2 flex items-center justify-between text-sm">
                                <span className="font-medium">Total Score</span>
                                <span className={`font-bold text-lg ${getScoreColor(result.match_score)}`}>
                                  {result.match_score}/100
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Contact Info */}
                        <div className="flex flex-wrap gap-4 text-sm">
                          <CopyableText text={result.email} />
                          {result.phone && <CopyableText text={result.phone} />}
                        </div>

                        {/* Matched / Missing Requirements */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {result.matched_requirements.length > 0 && (
                            <div>
                              <p className="text-sm font-medium mb-1 flex items-center gap-1 text-emerald-600">
                                <CheckCircle className="w-3.5 h-3.5" /> Matched
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {result.matched_requirements.map((req, i) => (
                                  <Badge key={i} variant="outline" className="text-xs bg-emerald-500/5 border-emerald-500/20">
                                    {req}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {result.missing_requirements.length > 0 && (
                            <div>
                              <p className="text-sm font-medium mb-1 flex items-center gap-1 text-red-500">
                                <XCircle className="w-3.5 h-3.5" /> Missing
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {result.missing_requirements.map((req, i) => (
                                  <Badge key={i} variant="outline" className="text-xs bg-red-500/5 border-red-500/20">
                                    {req}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* CV Link & Full Profile */}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="default"
                            size="sm"
                            className="gap-1"
                            onClick={() => setSelectedCandidateId(result.id)}
                          >
                            <Eye className="w-3.5 h-3.5" /> View Full Profile
                          </Button>
                          {result.cv_file_url && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              onClick={() => setCvPreview({ url: result.cv_file_url!, name: result.full_name })}
                            >
                              <FileText className="w-3.5 h-3.5" /> View CV
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
      <AlertDialog open={showRejectConfirm} onOpenChange={setShowRejectConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Include Rejected Candidates?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You have <strong>"Reject"</strong> included in your status filter. Scanning rejected candidates may return lower-quality matches and increase processing time. Do you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowRejectConfirm(false)}>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={handleScoutWithoutReject}>
              Skip Rejected
            </Button>
            <AlertDialogAction onClick={handleScoutWithReject}>
              Include Rejected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <CandidateDetailDialog
        open={!!selectedCandidateId}
        onOpenChange={(open) => { if (!open) setSelectedCandidateId(null); }}
        applicantId={selectedCandidateId}
      />
      {cvPreview && (
        <Dialog open={!!cvPreview} onOpenChange={(open) => { if (!open) setCvPreview(null); }}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>CV Preview — {cvPreview.name}</DialogTitle>
            </DialogHeader>
            <CVImagePreview pdfUrl={cvPreview.url} fileName={cvPreview.name + '.pdf'} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
