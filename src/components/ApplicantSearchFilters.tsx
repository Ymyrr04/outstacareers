import { useState, useEffect, useMemo, useCallback, useTransition } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Filter, X, ChevronDown, Briefcase, Wrench, Calendar, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Applicant {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  job_title: string;
  status: string;
  total_score: number | null;
  ranking_status: string | null;
  cv_text: string | null;
  extracted_skills: string[] | null;
  extracted_tools: string[] | null;
  years_of_experience: number | null;
}

interface ApplicantSearchFiltersProps {
  applicants: Applicant[];
  onFilteredApplicants: (filtered: Applicant[]) => void;
  allSkills: string[];
  allTools: string[];
}

const EXPERIENCE_RANGES = [
  { label: '0-1 years', min: 0, max: 1 },
  { label: '2-4 years', min: 2, max: 4 },
  { label: '5-7 years', min: 5, max: 7 },
  { label: '8+ years', min: 8, max: Infinity },
];

export default function ApplicantSearchFilters({
  applicants,
  onFilteredApplicants,
  allSkills,
  allTools,
}: ApplicantSearchFiltersProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearchTerm, setAppliedSearchTerm] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [selectedExperienceRanges, setSelectedExperienceRanges] = useState<string[]>([]);
  
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [experienceOpen, setExperienceOpen] = useState(false);
  
  const [skillSearch, setSkillSearch] = useState('');
  const [toolSearch, setToolSearch] = useState('');
  
  // Use transition for non-blocking filter updates
  const [isPending, startTransition] = useTransition();

  // Handle Enter key to apply search
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setAppliedSearchTerm(searchTerm);
    }
  };

  // Track if search is pending (user typed but hasn't pressed Enter)
  const hasUnappliedSearch = searchTerm !== appliedSearchTerm && searchTerm.trim().length > 0;

  // Track if search/filtering is pending
  const isSearching = isPending;

  // Filter applicants based on all criteria (use applied search term - triggered by Enter)
  const filteredApplicants = useMemo(() => {
    return applicants.filter(applicant => {
      // Search term filter - focuses on name, email, phone, job title only (not CV content)
      if (appliedSearchTerm.trim()) {
        const term = appliedSearchTerm.toLowerCase().trim();
        const matchesFullName = applicant.full_name.toLowerCase().includes(term);
        const matchesEmail = applicant.email.toLowerCase().includes(term);
        const matchesPhone = applicant.phone?.toLowerCase().includes(term) || false;
        const matchesJobTitle = applicant.job_title.toLowerCase().includes(term);
        
        if (!matchesFullName && !matchesEmail && !matchesPhone && !matchesJobTitle) {
          return false;
        }
      }
      
      // Skills filter
      if (selectedSkills.length > 0) {
        const applicantSkills = (applicant.extracted_skills || []).map(s => s.toLowerCase());
        const hasAllSelectedSkills = selectedSkills.every(skill => 
          applicantSkills.some(as => as.includes(skill.toLowerCase()))
        );
        if (!hasAllSelectedSkills) return false;
      }
      
      // Tools filter
      if (selectedTools.length > 0) {
        const applicantTools = (applicant.extracted_tools || []).map(t => t.toLowerCase());
        const hasAllSelectedTools = selectedTools.every(tool => 
          applicantTools.some(at => at.includes(tool.toLowerCase()))
        );
        if (!hasAllSelectedTools) return false;
      }
      
      // Experience filter
      if (selectedExperienceRanges.length > 0) {
        if (applicant.years_of_experience === null) return false;
        const inRange = selectedExperienceRanges.some(rangeLabel => {
          const range = EXPERIENCE_RANGES.find(r => r.label === rangeLabel);
          if (!range) return false;
          return applicant.years_of_experience! >= range.min && 
                 applicant.years_of_experience! <= range.max;
        });
        if (!inRange) return false;
      }
      
      return true;
    });
  }, [applicants, appliedSearchTerm, selectedSkills, selectedTools, selectedExperienceRanges]);

  // Update parent when filters change (use startTransition for non-urgent updates)
  useEffect(() => {
    startTransition(() => {
      onFilteredApplicants(filteredApplicants);
    });
  }, [filteredApplicants, onFilteredApplicants]);

  const clearAllFilters = () => {
    setSearchTerm('');
    setAppliedSearchTerm('');
    setSelectedSkills([]);
    setSelectedTools([]);
    setSelectedExperienceRanges([]);
  };

  const hasActiveFilters = appliedSearchTerm.trim() || selectedSkills.length > 0 || 
                           selectedTools.length > 0 || selectedExperienceRanges.length > 0;

  const toggleSkill = (skill: string) => {
    setSelectedSkills(prev => 
      prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]
    );
  };

  const toggleTool = (tool: string) => {
    setSelectedTools(prev => 
      prev.includes(tool) ? prev.filter(t => t !== tool) : [...prev, tool]
    );
  };

  const toggleExperienceRange = (range: string) => {
    setSelectedExperienceRanges(prev => 
      prev.includes(range) ? prev.filter(r => r !== range) : [...prev, range]
    );
  };

  // Filter skills and tools for search
  const filteredSkills = allSkills.filter(skill => 
    skill.toLowerCase().includes(skillSearch.toLowerCase())
  );
  
  const filteredTools = allTools.filter(tool => 
    tool.toLowerCase().includes(toolSearch.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Main search and filters row */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search input */}
        <div className="relative flex-1 min-w-[300px]">
          {isSearching ? (
            <Loader2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
          ) : (
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          )}
          <Input
            placeholder="Search name, email, phone, job title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className={cn("pl-10", hasUnappliedSearch ? "pr-24" : "pr-10")}
          />
          {hasUnappliedSearch && (
            <span className="absolute right-10 top-1/2 transform -translate-y-1/2 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              Press Enter
            </span>
          )}
          {searchTerm && (
            <button
              onClick={() => {
                setSearchTerm('');
                setAppliedSearchTerm('');
              }}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Skills filter */}
        <Popover open={skillsOpen} onOpenChange={setSkillsOpen}>
          <PopoverTrigger asChild>
            <Button 
              variant="outline" 
              className={cn(
                "min-w-[140px] justify-between",
                selectedSkills.length > 0 && "border-primary"
              )}
            >
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                <span>Skills</span>
                {selectedSkills.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {selectedSkills.length}
                  </Badge>
                )}
              </div>
              <ChevronDown className="w-4 h-4 ml-2" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="start">
            <div className="p-2 border-b">
              <Input
                placeholder="Search skills..."
                value={skillSearch}
                onChange={(e) => setSkillSearch(e.target.value)}
                className="h-8"
              />
            </div>
            <ScrollArea className="h-[250px]">
              <div className="p-2 space-y-1">
                {filteredSkills.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No skills found</p>
                ) : (
                  filteredSkills.map(skill => (
                    <label
                      key={skill}
                      className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedSkills.includes(skill)}
                        onCheckedChange={() => toggleSkill(skill)}
                      />
                      <span className="text-sm">{skill}</span>
                    </label>
                  ))
                )}
              </div>
            </ScrollArea>
            {selectedSkills.length > 0 && (
              <div className="p-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedSkills([])}
                  className="w-full"
                >
                  Clear skills
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Tools filter */}
        <Popover open={toolsOpen} onOpenChange={setToolsOpen}>
          <PopoverTrigger asChild>
            <Button 
              variant="outline" 
              className={cn(
                "min-w-[140px] justify-between",
                selectedTools.length > 0 && "border-primary"
              )}
            >
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4" />
                <span>Tools</span>
                {selectedTools.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {selectedTools.length}
                  </Badge>
                )}
              </div>
              <ChevronDown className="w-4 h-4 ml-2" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="start">
            <div className="p-2 border-b">
              <Input
                placeholder="Search tools..."
                value={toolSearch}
                onChange={(e) => setToolSearch(e.target.value)}
                className="h-8"
              />
            </div>
            <ScrollArea className="h-[250px]">
              <div className="p-2 space-y-1">
                {filteredTools.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No tools found</p>
                ) : (
                  filteredTools.map(tool => (
                    <label
                      key={tool}
                      className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedTools.includes(tool)}
                        onCheckedChange={() => toggleTool(tool)}
                      />
                      <span className="text-sm">{tool}</span>
                    </label>
                  ))
                )}
              </div>
            </ScrollArea>
            {selectedTools.length > 0 && (
              <div className="p-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedTools([])}
                  className="w-full"
                >
                  Clear tools
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Experience filter */}
        <Popover open={experienceOpen} onOpenChange={setExperienceOpen}>
          <PopoverTrigger asChild>
            <Button 
              variant="outline" 
              className={cn(
                "min-w-[160px] justify-between",
                selectedExperienceRanges.length > 0 && "border-primary"
              )}
            >
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>Experience</span>
                {selectedExperienceRanges.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {selectedExperienceRanges.length}
                  </Badge>
                )}
              </div>
              <ChevronDown className="w-4 h-4 ml-2" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-2" align="start">
            <div className="space-y-1">
              {EXPERIENCE_RANGES.map(range => (
                <label
                  key={range.label}
                  className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer"
                >
                  <Checkbox
                    checked={selectedExperienceRanges.includes(range.label)}
                    onCheckedChange={() => toggleExperienceRange(range.label)}
                  />
                  <span className="text-sm">{range.label}</span>
                </label>
              ))}
            </div>
            {selectedExperienceRanges.length > 0 && (
              <div className="pt-2 mt-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedExperienceRanges([])}
                  className="w-full"
                >
                  Clear experience
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Clear all filters */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters}>
            <X className="w-4 h-4 mr-1" />
            Clear all
          </Button>
        )}
      </div>

      {/* Active filter badges */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="w-4 h-4 text-muted-foreground" />
          
          {appliedSearchTerm.trim() && (
            <Badge variant="secondary" className="gap-1">
              Search: "{appliedSearchTerm}"
              <button onClick={() => { setSearchTerm(''); setAppliedSearchTerm(''); }} className="ml-1 hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          
          {selectedSkills.map(skill => (
            <Badge key={skill} variant="secondary" className="gap-1 bg-blue-100 dark:bg-blue-900/30">
              {skill}
              <button onClick={() => toggleSkill(skill)} className="ml-1 hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          
          {selectedTools.map(tool => (
            <Badge key={tool} variant="secondary" className="gap-1 bg-green-100 dark:bg-green-900/30">
              {tool}
              <button onClick={() => toggleTool(tool)} className="ml-1 hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          
          {selectedExperienceRanges.map(range => (
            <Badge key={range} variant="secondary" className="gap-1 bg-purple-100 dark:bg-purple-900/30">
              {range}
              <button onClick={() => toggleExperienceRange(range)} className="ml-1 hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}

          <span className="text-sm text-muted-foreground ml-2">
            {filteredApplicants.length} result{filteredApplicants.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
}
