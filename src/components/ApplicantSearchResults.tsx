import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InterviewResultsView } from '@/components/InterviewResultsView';
import { 
  Mail, 
  Phone, 
  Briefcase, 
  Star, 
  FileText, 
  Mic, 
  StickyNote,
  Trash2,
  Search,
  MapPin,
  Clock,
  Loader2,
  User,
  Pencil,
  Save,
  Download,
  CheckCircle,
  XCircle,
  Zap,
  Check,
  X,
  AlertTriangle,
  CalendarPlus,
  Send,
  History,
  ClipboardList
} from 'lucide-react';

interface ToolMatch {
  tool: string;
  found: boolean;
  context?: string;
}

interface ExperienceHighlight {
  role: string;
  company?: string;
  duration?: string;
  relevance: string;
}

interface AssessmentDetails {
  matched_tools: ToolMatch[];
  missing_tools: string[];
  experience_highlights: ExperienceHighlight[];
  strengths: string[];
  concerns: string[];
}

interface InterviewSession {
  id: string;
  status: string;
  experience_score: number | null;
  technical_score: number | null;
  communication_score: number | null;
  situational_score: number | null;
  personality_score: number | null;
  overall_score: number | null;
  ai_summary: string | null;
  ai_strengths: string[] | null;
  ai_concerns: string[] | null;
  completed_at: string | null;
}

interface Applicant {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  job_title: string;
  location: string;
  status: string;
  submitted_at: string;
  total_score: number | null;
  ranking_status: string | null;
  cv_file_url: string | null;
  cv_text: string | null;
  vocaroo_link: string | null;
  voice_recording_url: string | null;
  notes: string | null;
  extracted_skills: string[] | null;
  extracted_tools: string[] | null;
  years_of_experience: number | null;
  interview_session?: InterviewSession | null;
  // Additional fields for details view
  home_office?: boolean;
  noise_canceling_headset?: boolean;
  laptop_or_pc?: boolean;
  good_internet?: boolean;
  power_backup?: boolean;
  can_work_40_50?: boolean;
  us_timezone_ok?: boolean;
  has_experience?: boolean;
  currently_working?: boolean;
  internet_speed?: string;
  start_availability?: string;
  role_experience_score?: number | null;
  skills_tools_score?: number | null;
  availability_setup_score?: number | null;
  bonus_red_flag_score?: number | null;
  ai_summary?: string | null;
  ai_assessment_details?: AssessmentDetails | null;
  // Bench availability fields
  is_available?: boolean | null;
  availability_checked_at?: string | null;
  // Details viewed tracking
  details_viewed_at?: string | null;
  // Star/favorite
  is_starred?: boolean;
}

interface ApplicantSearchResultsProps {
  applicants: Applicant[];
  statusOptions: readonly string[];
  onUpdateStatus: (applicantId: string, newStatus: string) => void;
  onViewDetails: (applicantId: string) => void;
  onDelete: (applicantId: string) => void;
  onPreviewCv: (applicantId: string, cvPath: string, name: string, cvText: string | null) => void;
  onShowNotes: (id: string, name: string, notes: string) => void;
  onDownloadCv?: (applicantId: string, cvPath: string) => void;
  onUpdateApplicant?: (applicantId: string, data: { full_name: string; email: string; phone: string | null; notes: string | null }) => Promise<void>;
  onSendInvite?: (applicant: { full_name: string; email: string; job_title: string }) => void;
  onSendEmail?: (applicant: { id: string; full_name: string; email: string; job_title: string; status: string }) => void;
  onViewHistory?: (applicant: { id: string; name: string; email: string }) => void;
  onCheckAvailability?: (applicant: { id: string; email: string; full_name: string; is_available: boolean | null; availability_checked_at: string | null }) => void;
  onToggleStar?: (applicantId: string) => void;
  expandedApplicant: string | null;
  loadingPreview: boolean;
  downloadingCv?: string | null;
}

export default function ApplicantSearchResults({
  applicants,
  statusOptions,
  onUpdateStatus,
  onViewDetails,
  onDelete,
  onPreviewCv,
  onShowNotes,
  onDownloadCv,
  onUpdateApplicant,
  onSendInvite,
  onSendEmail,
  onViewHistory,
  onCheckAvailability,
  onToggleStar,
  expandedApplicant,
  loadingPreview,
  downloadingCv,
}: ApplicantSearchResultsProps) {
  const [editingApplicant, setEditingApplicant] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', email: '', phone: '', notes: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleStartEdit = (applicant: Applicant) => {
    setEditingApplicant(applicant.id);
    setEditForm({
      full_name: applicant.full_name,
      email: applicant.email,
      phone: applicant.phone || '',
      notes: applicant.notes || '',
    });
  };

  const handleCancelEdit = () => {
    setEditingApplicant(null);
    setEditForm({ full_name: '', email: '', phone: '', notes: '' });
  };

  const handleSaveEdit = async (applicantId: string) => {
    if (!onUpdateApplicant) return;
    setSavingEdit(true);
    await onUpdateApplicant(applicantId, {
      full_name: editForm.full_name.trim(),
      email: editForm.email.trim(),
      phone: editForm.phone.trim() || null,
      notes: editForm.notes.trim() || null,
    });
    setSavingEdit(false);
    setEditingApplicant(null);
  };

  const BooleanBadge = ({ value, label }: { value: boolean | undefined; label: string }) => (
    <div className="flex items-center gap-1.5 text-sm">
      {value ? (
        <CheckCircle className="w-4 h-4 text-green-500" />
      ) : (
        <XCircle className="w-4 h-4 text-red-500" />
      )}
      <span className={value ? 'text-green-700' : 'text-red-700'}>{label}</span>
    </div>
  );

  if (applicants.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Search className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No applicants found</h3>
          <p className="text-muted-foreground">
            Try adjusting your search terms or filters to find what you're looking for.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {applicants.map((applicant) => (
        <Card key={applicant.id} className="hover:shadow-md transition-shadow">
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {/* Header row with name and badges */}
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {/* Star button */}
                  {onToggleStar && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleStar(applicant.id);
                      }}
                      className={`flex-shrink-0 p-0.5 rounded transition-colors ${
                        applicant.is_starred 
                          ? 'text-yellow-500 hover:text-yellow-600' 
                          : 'text-gray-300 hover:text-yellow-400'
                      }`}
                      title={applicant.is_starred ? 'Remove star' : 'Add star'}
                    >
                      <Star className={`w-4 h-4 ${applicant.is_starred ? 'fill-current' : ''}`} />
                    </button>
                  )}
                  <h3 className="font-semibold truncate">{applicant.full_name}</h3>
                  
                  {applicant.status === 'For Review' && !applicant.details_viewed_at && (
                    <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-xs">
                      NEW
                    </Badge>
                  )}
                  
                  {applicant.ranking_status && (
                    <Badge 
                      variant={
                        applicant.ranking_status === 'Strong Match' ? 'default' :
                        applicant.ranking_status === 'Partial Match' ? 'secondary' :
                        'outline'
                      }
                      className={
                        applicant.ranking_status === 'Strong Match' ? 'bg-green-600' :
                        applicant.ranking_status === 'Partial Match' ? 'bg-blue-600 text-white' :
                        ''
                      }
                    >
                      <Star className="w-3 h-3 mr-1" />
                      {applicant.ranking_status}
                    </Badge>
                  )}
                  
                  {applicant.total_score !== null && (
                    <Badge variant="outline" className="font-mono">
                      CV: {applicant.total_score}/100
                    </Badge>
                  )}

                  {applicant.interview_session?.status === 'completed' && applicant.interview_session.overall_score !== null && (
                    <Badge variant="outline" className="font-mono bg-purple-50 border-purple-300 text-purple-700">
                      Interview: {applicant.interview_session.overall_score}/100
                    </Badge>
                  )}

                  {applicant.interview_session?.status === 'in_progress' && (
                    <Badge variant="outline" className="text-yellow-600 border-yellow-300">
                      Interview in progress
                    </Badge>
                  )}

                  {applicant.years_of_experience !== null && (
                    <Badge variant="outline" className="text-purple-600 border-purple-300">
                      {applicant.years_of_experience}+ yrs exp
                    </Badge>
                  )}
                  
                  <Badge variant="outline" className="text-muted-foreground">
                    {applicant.status}
                  </Badge>
                </div>

                {/* Contact info row */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5" />
                    {applicant.email}
                  </span>
                  
                  {applicant.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" />
                      {applicant.phone}
                    </span>
                  )}
                </div>

                {/* Job and location row */}
                <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Briefcase className="w-3.5 h-3.5" />
                    {applicant.job_title}
                  </span>
                  
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {applicant.location}
                  </span>
                  
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {formatDate(applicant.submitted_at)}
                  </span>
                </div>

                {/* Skills and tools preview */}
                {((applicant.extracted_skills?.length ?? 0) > 0 || (applicant.extracted_tools?.length ?? 0) > 0) && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {applicant.extracted_skills?.slice(0, 3).map(skill => (
                      <Badge key={skill} variant="secondary" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 border border-blue-200 dark:border-blue-800">
                        {skill}
                      </Badge>
                    ))}
                    {applicant.extracted_tools?.slice(0, 3).map(tool => (
                      <Badge key={tool} variant="secondary" className="text-xs bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200 border border-teal-200 dark:border-teal-800">
                        {tool}
                      </Badge>
                    ))}
                    {((applicant.extracted_skills?.length ?? 0) + (applicant.extracted_tools?.length ?? 0)) > 6 && (
                      <Badge variant="outline" className="text-xs">
                        +{(applicant.extracted_skills?.length ?? 0) + (applicant.extracted_tools?.length ?? 0) - 6} more
                      </Badge>
                    )}
                  </div>
                )}

                {/* Quick actions row */}
                <div className="flex items-center gap-4 mt-2 text-sm flex-wrap">
                  {applicant.cv_file_url && (
                    <button
                      onClick={() => onPreviewCv(applicant.id, applicant.cv_file_url!, applicant.full_name, applicant.cv_text)}
                      disabled={loadingPreview}
                      className="flex items-center gap-1 text-primary hover:underline cursor-pointer disabled:opacity-50"
                    >
                      {loadingPreview ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <FileText className="w-3.5 h-3.5" />
                      )}
                      CV
                    </button>
                  )}
                  
                  {(applicant.vocaroo_link || applicant.voice_recording_url) && (
                    applicant.voice_recording_url ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Mic className="w-3.5 h-3.5 text-primary" />
                        <audio controls className="h-8 w-32" src={applicant.voice_recording_url}>
                          Your browser does not support audio.
                        </audio>
                      </div>
                    ) : (
                      <a
                        href={applicant.vocaroo_link!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        <Mic className="w-3.5 h-3.5" />
                        Voice
                      </a>
                    )
                  )}
                  
                  <button
                    onClick={() => onShowNotes(applicant.id, applicant.full_name, applicant.notes || '')}
                    className={`flex items-center gap-1 cursor-pointer hover:underline ${applicant.notes ? 'text-amber-600' : 'text-muted-foreground'}`}
                  >
                    <StickyNote className="w-3.5 h-3.5" />
                    Notes
                  </button>

                  {/* CV Assessment quick link */}
                  {applicant.total_score !== null && (
                    <button
                      onClick={() => onViewDetails(applicant.id)}
                      className="flex items-center gap-1 text-green-600 hover:underline cursor-pointer"
                    >
                      <Star className="w-3.5 h-3.5" />
                      CV Assessment
                    </button>
                  )}

                  {/* Interview Results quick link */}
                  {applicant.interview_session?.status === 'completed' && (
                    <button
                      onClick={() => onViewDetails(applicant.id)}
                      className="flex items-center gap-1 text-purple-600 hover:underline cursor-pointer"
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                      Interview Results
                    </button>
                  )}

                  {/* Check Availability button for Bench candidates */}
                  {applicant.status === 'Bench' && onCheckAvailability && (
                    <button
                      onClick={() => onCheckAvailability({
                        id: applicant.id,
                        email: applicant.email,
                        full_name: applicant.full_name,
                        is_available: applicant.is_available ?? null,
                        availability_checked_at: applicant.availability_checked_at ?? null
                      })}
                      className="flex items-center gap-1 text-blue-600 hover:underline cursor-pointer"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      Check Availability
                      {applicant.is_available !== null && applicant.is_available !== undefined && (
                        <Badge 
                          variant="secondary" 
                          className={`ml-1 text-xs ${applicant.is_available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                        >
                          {applicant.is_available ? 'Available' : 'Not Available'}
                        </Badge>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Actions column */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <Select
                  value={applicant.status}
                  onValueChange={(value) => onUpdateStatus(applicant.id, value)}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onViewDetails(applicant.id)}
                >
                  {expandedApplicant === applicant.id ? 'Hide' : 'Details'}
                </Button>
                
                {onSendInvite && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSendInvite({
                      full_name: applicant.full_name,
                      email: applicant.email,
                      job_title: applicant.job_title
                    })}
                    title="Send Interview Invite"
                  >
                    <CalendarPlus className="w-4 h-4" />
                  </Button>
                )}

                {onSendEmail && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSendEmail({
                      id: applicant.id,
                      full_name: applicant.full_name,
                      email: applicant.email,
                      job_title: applicant.job_title,
                      status: applicant.status
                    })}
                    title="Send Email"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                )}

                {onViewHistory && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onViewHistory({
                      id: applicant.id,
                      name: applicant.full_name,
                      email: applicant.email
                    })}
                    title="Communication History"
                  >
                    <History className="w-4 h-4" />
                  </Button>
                )}
                
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onDelete(applicant.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Expanded Details Section */}
            {expandedApplicant === applicant.id && (
              <div className="mt-4 pt-4 border-t border-border">
                {/* Assessment Tabs - CV vs Interview */}
                <Tabs defaultValue="cv" className="mb-6">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="cv" className="flex items-center gap-2">
                      <Star className="w-4 h-4" />
                      CV Assessment
                      {applicant.total_score !== null && (
                        <Badge variant="secondary" className="ml-1">{applicant.total_score}/100</Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="interview" className="flex items-center gap-2">
                      <ClipboardList className="w-4 h-4" />
                      Interview Results
                      {applicant.interview_session?.status === 'completed' && applicant.interview_session.overall_score !== null && (
                        <Badge variant="secondary" className="ml-1 bg-purple-100 text-purple-700">{applicant.interview_session.overall_score}/100</Badge>
                      )}
                    </TabsTrigger>
                  </TabsList>

                  {/* CV Assessment Tab */}
                  <TabsContent value="cv" className="mt-4">
                    {applicant.total_score !== null ? (
                      <div className="p-4 bg-muted/50 rounded-lg">
                        <h4 className="font-semibold mb-3 flex items-center gap-2">
                          <Star className="w-4 h-4" />
                          AI CV Assessment
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                          <div className="text-center p-2 bg-background rounded">
                            <p className="text-xs text-muted-foreground">Role Experience</p>
                            <p className="text-lg font-bold">{applicant.role_experience_score ?? '-'}/40</p>
                          </div>
                          <div className="text-center p-2 bg-background rounded">
                            <p className="text-xs text-muted-foreground">Skills & Tools</p>
                            <p className="text-lg font-bold">{applicant.skills_tools_score ?? '-'}/40</p>
                          </div>
                          <div className="text-center p-2 bg-background rounded">
                            <p className="text-xs text-muted-foreground">Availability</p>
                            <p className="text-lg font-bold">{applicant.availability_setup_score ?? '-'}/10</p>
                          </div>
                          <div className="text-center p-2 bg-background rounded">
                            <p className="text-xs text-muted-foreground">Bonus/Red Flags</p>
                            <p className="text-lg font-bold">{applicant.bonus_red_flag_score ?? '-'}/10</p>
                          </div>
                          <div className="text-center p-2 bg-primary/10 rounded border border-primary/20">
                            <p className="text-xs text-muted-foreground">Total Score</p>
                            <p className="text-xl font-bold text-primary">{applicant.total_score}/100</p>
                          </div>
                        </div>
                        {applicant.ai_summary && (
                          <div className="mt-3">
                            <p className="text-sm font-medium mb-1">AI Summary</p>
                            <p className="text-sm text-muted-foreground">{applicant.ai_summary}</p>
                          </div>
                        )}

                        {/* Detailed Assessment Breakdown */}
                        {applicant.ai_assessment_details && (
                          <div className="mt-4 space-y-4">
                            {/* Skills & Tools Match */}
                            {(applicant.ai_assessment_details.matched_tools?.length > 0 || 
                              applicant.ai_assessment_details.missing_tools?.length > 0) && (
                              <div>
                                <p className="text-sm font-medium mb-2 flex items-center gap-2">
                                  <Zap className="w-4 h-4" />
                                  Skills & Tools Match
                                </p>
                                <div className="space-y-2">
                                  {applicant.ai_assessment_details.matched_tools?.map((tool, idx) => (
                                    <div key={idx} className="flex items-start gap-2 p-2 bg-green-50 dark:bg-green-950/30 rounded text-sm">
                                      <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                                      <div>
                                        <span className="font-medium text-green-700 dark:text-green-400">{tool.tool}</span>
                                        {tool.context && (
                                          <p className="text-xs text-muted-foreground mt-0.5">"{tool.context}"</p>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                  {applicant.ai_assessment_details.missing_tools?.map((tool, idx) => (
                                    <div key={idx} className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-950/30 rounded text-sm">
                                      <X className="w-4 h-4 text-red-600 flex-shrink-0" />
                                      <span className="text-red-700 dark:text-red-400">{tool}</span>
                                      <span className="text-xs text-muted-foreground ml-1">(not found)</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Relevant Experience */}
                            {applicant.ai_assessment_details.experience_highlights?.length > 0 && (
                              <div>
                                <p className="text-sm font-medium mb-2 flex items-center gap-2">
                                  <Briefcase className="w-4 h-4" />
                                  Relevant Experience
                                </p>
                                <div className="space-y-2">
                                  {applicant.ai_assessment_details.experience_highlights.map((exp, idx) => (
                                    <div key={idx} className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded text-sm">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium text-blue-700 dark:text-blue-400">{exp.role}</span>
                                        {exp.company && (
                                          <span className="text-muted-foreground">at {exp.company}</span>
                                        )}
                                        {exp.duration && (
                                          <Badge variant="outline" className="text-xs">{exp.duration}</Badge>
                                        )}
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-1">{exp.relevance}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Strengths & Concerns */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {applicant.ai_assessment_details.strengths?.length > 0 && (
                                <div>
                                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                    Strengths
                                  </p>
                                  <ul className="space-y-1">
                                    {applicant.ai_assessment_details.strengths.map((strength, idx) => (
                                      <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                                        <span className="text-green-600">•</span>
                                        {strength}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {applicant.ai_assessment_details.concerns?.length > 0 && (
                                <div>
                                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                                    Concerns
                                  </p>
                                  <ul className="space-y-1">
                                    {applicant.ai_assessment_details.concerns.map((concern, idx) => (
                                      <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                                        <span className="text-amber-600">•</span>
                                        {concern}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-6 bg-muted/30 rounded-lg text-center">
                        <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-muted-foreground">No CV assessment available</p>
                      </div>
                    )}
                  </TabsContent>

                  {/* Interview Results Tab */}
                  <TabsContent value="interview" className="mt-4">
                    {applicant.interview_session ? (
                      <div className="p-4 bg-purple-50/50 dark:bg-purple-950/20 rounded-lg border border-purple-200/50 dark:border-purple-800/30">
                        <InterviewResultsView 
                          sessionId={applicant.interview_session.id}
                          session={applicant.interview_session}
                        />
                      </div>
                    ) : (
                      <div className="p-6 bg-muted/30 rounded-lg text-center">
                        <ClipboardList className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-muted-foreground">No interview completed yet</p>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>

                {/* Editable Contact Info Section */}
                <div className="mb-6 p-4 bg-muted/30 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Contact Information
                    </h4>
                    {editingApplicant === applicant.id ? (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCancelEdit}
                          disabled={savingEdit}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSaveEdit(applicant.id)}
                          disabled={savingEdit || !onUpdateApplicant}
                        >
                          {savingEdit ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-1" />
                          ) : (
                            <Save className="w-4 h-4 mr-1" />
                          )}
                          Save
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStartEdit(applicant)}
                      >
                        <Pencil className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                    )}
                  </div>
                  
                  {editingApplicant === applicant.id ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-name" className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          Full Name
                        </Label>
                        <Input
                          id="edit-name"
                          value={editForm.full_name}
                          onChange={(e) => setEditForm(prev => ({ ...prev, full_name: e.target.value }))}
                          placeholder="Full name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-email" className="flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5" />
                          Email
                        </Label>
                        <Input
                          id="edit-email"
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                          placeholder="Email address"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-phone" className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" />
                          Phone
                        </Label>
                        <Input
                          id="edit-phone"
                          type="tel"
                          value={editForm.phone}
                          onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                          placeholder="Phone number"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{applicant.full_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <a href={`mailto:${applicant.email}`} className="text-sm text-primary hover:underline">
                          {applicant.email}
                        </a>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        {applicant.phone ? (
                          <a href={`tel:${applicant.phone}`} className="text-sm text-primary hover:underline">
                            {applicant.phone}
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground">Not provided</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Notes Section */}
                <div className="mb-6 p-4 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg border border-amber-200/50 dark:border-amber-800/30">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold flex items-center gap-2">
                      <StickyNote className="w-4 h-4 text-amber-600" />
                      Notes
                    </h4>
                    {editingApplicant !== applicant.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStartEdit(applicant)}
                        className="text-amber-700 hover:text-amber-800 hover:bg-amber-100"
                      >
                        <Pencil className="w-4 h-4 mr-1" />
                        {applicant.notes ? 'Edit Note' : 'Add Note'}
                      </Button>
                    )}
                  </div>
                  
                  {editingApplicant === applicant.id ? (
                    <Textarea
                      value={editForm.notes}
                      onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Add notes about this applicant..."
                      className="min-h-[100px] bg-background"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {applicant.notes || 'No notes yet. Click "Add Note" to add observations about this applicant.'}
                    </p>
                  )}
                </div>

                {/* CV and Vocaroo Links */}
                <div className="flex flex-wrap gap-3 mb-4">
                  {applicant.cv_file_url && onDownloadCv && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onDownloadCv(applicant.id, applicant.cv_file_url!)}
                      disabled={downloadingCv === applicant.id}
                      className="inline-flex items-center gap-2 bg-primary/10 text-primary hover:bg-primary/20"
                    >
                      {downloadingCv === applicant.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      Download CV
                    </Button>
                  )}
                  {(applicant.vocaroo_link || applicant.voice_recording_url) && (
                    applicant.voice_recording_url ? (
                      <div className="inline-flex items-center gap-2 px-3 py-2 bg-orange-500/10 text-orange-600 rounded-md text-sm">
                        <Mic className="w-4 h-4" />
                        <audio controls className="h-8" src={applicant.voice_recording_url}>
                          Your browser does not support audio.
                        </audio>
                      </div>
                    ) : (
                      <a 
                        href={applicant.vocaroo_link!} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-2 bg-orange-500/10 text-orange-600 rounded-md text-sm hover:bg-orange-500/20 transition-colors"
                      >
                        <Mic className="w-4 h-4" />
                        Listen to Voice Recording
                      </a>
                    )
                  )}
                </div>

                {/* Pre-screening Questions */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <BooleanBadge value={applicant.home_office} label="Home Office Setup" />
                  <BooleanBadge value={applicant.noise_canceling_headset} label="Noise-Canceling Headset" />
                  <BooleanBadge value={applicant.laptop_or_pc} label="Laptop/PC" />
                  <BooleanBadge value={applicant.good_internet} label="Good Internet" />
                  <BooleanBadge value={applicant.power_backup} label="Power Backup" />
                  <BooleanBadge value={applicant.can_work_40_50} label="40-50 hrs/week" />
                  <BooleanBadge value={applicant.us_timezone_ok} label="US Timezone OK" />
                  <BooleanBadge value={applicant.has_experience} label="Has Experience" />
                  <BooleanBadge value={!applicant.currently_working} label="Currently Working" />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <p className="text-sm font-medium">Internet Speed</p>
                    <p className="text-sm text-muted-foreground">{applicant.internet_speed || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Start Availability</p>
                    <p className="text-sm text-muted-foreground">{applicant.start_availability || 'Not specified'}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
