import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, SearchIcon, Target, Users, MapPin, Star, FileText, Mail, Phone, CheckCircle, XCircle, Sparkles, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { CopyableText } from '@/components/CopyableText';

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
}

interface ScoutResponse {
  results: ScoutResult[];
  total_scanned: number;
  shortlisted_count: number;
  ai_evaluated: boolean;
  message?: string;
  error?: string;
}

const STATUS_OPTIONS = [
  'For Review', 'For Interview', 'SIV', 'Client Interview',
  'Hired', 'Bench', 'Reject', 'Archive', 'Talent Pool'
];

const DEFAULT_STATUSES = ['For Review', 'For Interview', 'SIV', 'Bench', 'Talent Pool'];

export const TalentScoutDashboard = () => {
  const { toast } = useToast();
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [requirements, setRequirements] = useState<string[]>(['']);
  const [preferredSkills, setPreferredSkills] = useState<string[]>(['']);
  const [statusFilter, setStatusFilter] = useState<string[]>(DEFAULT_STATUSES);
  const [maxResults, setMaxResults] = useState(20);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScoutResponse | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [rawJD, setRawJD] = useState('');

  const addRequirement = () => setRequirements(prev => [...prev, '']);
  const removeRequirement = (idx: number) => setRequirements(prev => prev.filter((_, i) => i !== idx));
  const updateRequirement = (idx: number, val: string) => setRequirements(prev => prev.map((r, i) => i === idx ? val : r));

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

      // Extract title from first line or use parsed description
      const firstLine = rawJD.trim().split('\n')[0].trim();
      const possibleTitle = firstLine.length < 80 ? firstLine.replace(/^(job\s*title|position|role)\s*[:|-]\s*/i, '') : '';
      if (possibleTitle && !jobTitle) setJobTitle(possibleTitle);

      if (data.qualifications?.length) {
        setRequirements(data.qualifications);
      }
      if (data.responsibilities?.length) {
        // Use responsibilities as preferred skills context
        setPreferredSkills(data.responsibilities.slice(0, 5));
      }
      if (data.description && !jobDescription) {
        setJobDescription(data.description);
      }

      toast({ title: 'Parsed!', description: `Extracted ${data.qualifications?.length || 0} requirements and ${data.responsibilities?.length || 0} responsibilities.` });
    } catch (err: any) {
      console.error('Parse error:', err);
      toast({ title: 'Parse failed', description: err.message, variant: 'destructive' });
    } finally {
      setParsing(false);
    }
  };

  const handleScout = async () => {
    if (!jobTitle.trim()) {
      toast({ title: 'Job title required', variant: 'destructive' });
      return;
    }

    const filteredReqs = requirements.filter(r => r.trim());
    const filteredSkills = preferredSkills.filter(s => s.trim());

    if (filteredReqs.length === 0 && !jobDescription.trim()) {
      toast({ title: 'Add requirements or a job description', variant: 'destructive' });
      return;
    }

    setLoading(true);
    setResults(null);

    try {
      const { data, error } = await supabase.functions.invoke('scout-talent', {
        body: {
          job_title: jobTitle.trim(),
          job_description: jobDescription.trim(),
          requirements: filteredReqs,
          preferred_skills: filteredSkills,
          status_filter: statusFilter,
          max_results: maxResults,
        }
      });

      if (error) throw error;

      if (data.error) {
        toast({ title: 'Scout Error', description: data.error, variant: 'destructive' });
        return;
      }

      setResults(data);
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

      {/* Input Form */}
      <Card>
        <CardContent className="pt-6 space-y-4">
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

          <div>
            <Label className="font-semibold">Key Requirements</Label>
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
                    {STATUS_OPTIONS.map(status => (
                      <label key={status} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <Checkbox
                          checked={statusFilter.includes(status)}
                          onCheckedChange={() => toggleStatus(status)}
                        />
                        {status}
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

          <Button onClick={handleScout} disabled={loading} className="w-full gap-2" size="lg">
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
            <Card className="flex-1 min-w-[150px]">
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <Users className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{results.total_scanned}</p>
                  <p className="text-xs text-muted-foreground">CVs Scanned</p>
                </div>
              </CardContent>
            </Card>
            <Card className="flex-1 min-w-[150px]">
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <SearchIcon className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{results.shortlisted_count}</p>
                  <p className="text-xs text-muted-foreground">Keyword Matches</p>
                </div>
              </CardContent>
            </Card>
            <Card className="flex-1 min-w-[150px]">
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <Target className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{results.results.length}</p>
                  <p className="text-xs text-muted-foreground">Final Matches</p>
                </div>
              </CardContent>
            </Card>
            <Card className="flex-1 min-w-[150px]">
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
                            <Badge variant="outline" className="text-xs">{result.status}</Badge>
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

                        {/* CV Link */}
                        {result.cv_file_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            onClick={() => window.open(result.cv_file_url!, '_blank')}
                          >
                            <FileText className="w-3.5 h-3.5" /> View CV
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
