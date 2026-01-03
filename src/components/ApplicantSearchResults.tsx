import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Users, 
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
  Loader2
} from 'lucide-react';

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
  notes: string | null;
  extracted_skills: string[] | null;
  extracted_tools: string[] | null;
  years_of_experience: number | null;
}

interface ApplicantSearchResultsProps {
  applicants: Applicant[];
  statusOptions: readonly string[];
  onUpdateStatus: (applicantId: string, newStatus: string) => void;
  onViewDetails: (applicantId: string) => void;
  onDelete: (applicantId: string) => void;
  onPreviewCv: (applicantId: string, cvPath: string, name: string, cvText: string | null) => void;
  onShowNotes: (id: string, name: string, notes: string) => void;
  expandedApplicant: string | null;
  loadingPreview: boolean;
}

export default function ApplicantSearchResults({
  applicants,
  statusOptions,
  onUpdateStatus,
  onViewDetails,
  onDelete,
  onPreviewCv,
  onShowNotes,
  expandedApplicant,
  loadingPreview,
}: ApplicantSearchResultsProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

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
                  <h3 className="font-semibold truncate">{applicant.full_name}</h3>
                  
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
                      Score: {applicant.total_score}/100
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
                      <Badge key={skill} variant="secondary" className="text-xs bg-blue-50 dark:bg-blue-900/20">
                        {skill}
                      </Badge>
                    ))}
                    {applicant.extracted_tools?.slice(0, 3).map(tool => (
                      <Badge key={tool} variant="secondary" className="text-xs bg-green-50 dark:bg-green-900/20">
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
                  
                  {applicant.vocaroo_link && (
                    <a
                      href={applicant.vocaroo_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      Voice
                    </a>
                  )}
                  
                  <button
                    onClick={() => onShowNotes(applicant.id, applicant.full_name, applicant.notes || '')}
                    className={`flex items-center gap-1 cursor-pointer hover:underline ${applicant.notes ? 'text-amber-600' : 'text-muted-foreground'}`}
                  >
                    <StickyNote className="w-3.5 h-3.5" />
                    Notes
                  </button>
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
                
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onDelete(applicant.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
