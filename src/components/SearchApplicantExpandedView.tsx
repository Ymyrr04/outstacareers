import { useState, useCallback } from 'react';
import { getErrorMessageSync } from "@/lib/errors";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Star, Check, X, RefreshCw, Loader2, Download, Mic, Phone, Mail, MessageCircle, User, Zap, Briefcase, CheckCircle, AlertTriangle, ClipboardList, FileText, Pencil, Save, Target } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { InterviewResultsFetcher } from '@/components/InterviewResultsFetcher';
import { CandidateProfileSection } from '@/components/CandidateProfileSection';
import { RoleHistorySection } from '@/components/RoleHistorySection';
import { ApplicationHistorySection } from '@/components/ApplicationHistorySection';
import { FormattedNotes } from '@/components/FormattedNotes';
import { CVImagePreview } from '@/components/CVImagePreview';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { PaginatedApplicant } from '@/hooks/usePaginatedApplicants';

interface SearchApplicantExpandedViewProps {
  applicant: PaginatedApplicant;
  onRescoreCv: (id: string) => void;
  onDownloadCv: (id: string, path: string, name: string) => void;
  rescoring: string | null;
  downloadingCv: string | null;
  onApplicantUpdated?: () => void;
}

const BooleanBadge = ({ value, label }: { value: boolean; label: string }) => (
  <div className={`flex items-center gap-2 p-2 rounded text-sm ${value ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400'}`}>
    {value ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
    {label}
  </div>
);

export const SearchApplicantExpandedView = ({
  applicant,
  onRescoreCv,
  onDownloadCv,
  rescoring,
  downloadingCv,
  onApplicantUpdated,
}: SearchApplicantExpandedViewProps) => {
  const [activeTab, setActiveTab] = useState<'cv' | 'interview'>('cv');
  const [showCvPreview, setShowCvPreview] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    full_name: applicant.full_name,
    email: applicant.email,
    phone: applicant.phone || '',
    whatsapp: applicant.whatsapp || '',
  });

  const handleSaveContact = useCallback(async () => {
    setSavingContact(true);
    try {
      const { error } = await supabase
        .from('applicants_prescreen')
        .update({
          full_name: contactForm.full_name,
          email: contactForm.email,
          phone: contactForm.phone || null,
          whatsapp: contactForm.whatsapp || null,
        })
        .eq('id', applicant.id);
      if (error) throw error;
      toast.success('Contact information updated');
      setEditingContact(false);
      onApplicantUpdated?.();
    } catch (err: any) {
      toast.error(getErrorMessageSync(err, 'Failed to update applicant'));
    } finally {
      setSavingContact(false);
    }
  }, [contactForm, applicant.id, onApplicantUpdated]);

  return (
    <div onMouseDown={(e) => e.stopPropagation()}>
      <div className="mb-6">
        <PreScreeningResponsesCard
          responses={(applicant as any).pre_screening_responses}
          flagged={(applicant as any).pre_screening_flagged}
        />
      </div>
      {/* Assessment Tabs */}

      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'cv' | 'interview')} className="mb-6">
        <TabsList className="grid w-full grid-cols-2" onMouseDown={(e) => e.stopPropagation()}>
          <TabsTrigger value="cv" className="flex items-center gap-2">
            <Star className="w-4 h-4" />
            CV Assessment
            {applicant.total_score !== null && (
              <Badge className="ml-1 bg-blue-600 text-white hover:bg-blue-600">{applicant.total_score}/100</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="interview" className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            Interview Results
            {applicant.interview_session?.overall_score != null && (
              <Badge className="ml-1 bg-purple-600 text-white hover:bg-purple-600">{applicant.interview_session.overall_score}/100</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* CV Assessment Tab */}
        <TabsContent value="cv" className="mt-4">
          {applicant.total_score !== null ? (
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <Star className="w-4 h-4" />
                  AI CV Assessment
                </h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRescoreCv(applicant.id)}
                  disabled={rescoring === applicant.id}
                  className="gap-1"
                >
                  {rescoring === applicant.id ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Rescoring...</>
                  ) : (
                    <><RefreshCw className="w-3 h-3" /> Rescore CV</>
                  )}
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center p-2 bg-background rounded">
                  <p className="text-xs text-muted-foreground">Role Experience</p>
                  <p className="text-lg font-bold">{applicant.role_experience_score ?? '-'}/50</p>
                </div>
                <div className="text-center p-2 bg-background rounded">
                  <p className="text-xs text-muted-foreground">Skills & Tools</p>
                  <p className="text-lg font-bold">{applicant.skills_tools_score ?? '-'}/45</p>
                </div>
                <div className="text-center p-2 bg-background rounded">
                  <p className="text-xs text-muted-foreground">Availability</p>
                  <p className="text-lg font-bold">{applicant.availability_setup_score ?? '-'}/5</p>
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
                  {(applicant.ai_assessment_details.matched_tools?.length > 0 || 
                    applicant.ai_assessment_details.missing_tools?.length > 0) && (
                    <div>
                      <p className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Zap className="w-4 h-4" /> Skills & Tools Match
                      </p>
                      <div className="space-y-2">
                        {applicant.ai_assessment_details.matched_tools?.map((tool, idx) => (
                          <div key={idx} className="flex items-start gap-2 p-2 bg-green-50 dark:bg-green-950/30 rounded text-sm">
                            <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <span className="font-medium text-green-700 dark:text-green-400">{tool.tool}</span>
                              {tool.context && <p className="text-xs text-muted-foreground mt-0.5">"{tool.context}"</p>}
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

                  {applicant.ai_assessment_details.experience_highlights?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Briefcase className="w-4 h-4" /> Relevant Experience
                      </p>
                      <div className="space-y-2">
                        {applicant.ai_assessment_details.experience_highlights.map((exp, idx) => (
                          <div key={idx} className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded text-sm">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-blue-700 dark:text-blue-400">{exp.role}</span>
                              {exp.company && <span className="text-muted-foreground">at {exp.company}</span>}
                              {exp.duration && <Badge variant="outline" className="text-xs">{exp.duration}</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{exp.relevance}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {applicant.ai_assessment_details.strengths?.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2 flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600" /> Strengths
                        </p>
                        <ul className="space-y-1">
                          {applicant.ai_assessment_details.strengths.map((s, idx) => (
                            <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                              <span className="text-green-600">•</span> {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {applicant.ai_assessment_details.concerns?.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600" /> Concerns
                        </p>
                        <ul className="space-y-1">
                          {applicant.ai_assessment_details.concerns.map((c, idx) => (
                            <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                              <span className="text-amber-600">•</span> {c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {applicant.ai_assessment_details.recommended_roles?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Target className="w-4 h-4 text-purple-600" /> Other Roles They May Fit
                      </p>
                      <div className="space-y-2">
                        {applicant.ai_assessment_details.recommended_roles.map((r, idx) => (
                          <div key={idx} className="p-2 bg-purple-50 dark:bg-purple-950/30 rounded text-sm">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-purple-700 dark:text-purple-400">{r.role}</span>
                              <Badge variant="outline" className="text-xs">{r.fit_score}/100 fit</Badge>
                            </div>
                            {r.reason && <p className="text-xs text-muted-foreground mt-1">{r.reason}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 bg-muted/30 rounded-lg text-center">
              <Star className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">No CV assessment available yet</p>
              {applicant.cv_file_url && (
                <Button
                  variant="default"
                  onClick={() => onRescoreCv(applicant.id)}
                  disabled={rescoring === applicant.id}
                  className="gap-2"
                >
                  {rescoring === applicant.id ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Processing with AI Vision...</>
                  ) : (
                    <><RefreshCw className="w-4 h-4" /> Score CV with AI Vision</>
                  )}
                </Button>
              )}
            </div>
          )}
        </TabsContent>

        {/* Interview Results Tab */}
        <TabsContent value="interview" className="mt-4">
          <InterviewResultsFetcher 
            applicantId={applicant.id}
            cachedSession={applicant.interview_session}
          />
        </TabsContent>
      </Tabs>

      {/* Contact Info */}
      <div className="mb-6 p-4 bg-muted/30 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold flex items-center gap-2">
            <User className="w-4 h-4" /> Contact Information
          </h4>
          {editingContact ? (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setEditingContact(false); setContactForm({ full_name: applicant.full_name, email: applicant.email, phone: applicant.phone || '', whatsapp: applicant.whatsapp || '' }); }}>
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={handleSaveContact} disabled={savingContact}>
                {savingContact ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />} Save
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setEditingContact(true)}>
              <Pencil className="w-4 h-4 mr-1" /> Edit
            </Button>
          )}
        </div>
        {editingContact ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Full Name</label>
              <Input value={contactForm.full_name} onChange={(e) => setContactForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Email</label>
              <Input value={contactForm.email} onChange={(e) => setContactForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Phone</label>
              <Input value={contactForm.phone} onChange={(e) => setContactForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">WhatsApp</label>
              <Input value={contactForm.whatsapp} onChange={(e) => setContactForm(f => ({ ...f, whatsapp: e.target.value }))} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">{applicant.full_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <a href={`mailto:${applicant.email}`} className="text-sm text-primary hover:underline">{applicant.email}</a>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-muted-foreground" />
              {applicant.phone ? (
                <a href={`tel:${applicant.phone}`} className="text-sm text-primary hover:underline">{applicant.phone}</a>
              ) : (
                <span className="text-sm text-muted-foreground">Not provided</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-green-600" />
              {applicant.whatsapp ? (
                <a href={`https://wa.me/${applicant.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-sm text-green-600 hover:underline">
                  {applicant.whatsapp}
                </a>
              ) : applicant.phone ? (
                <a href={`https://wa.me/${applicant.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-sm text-green-600 hover:underline">
                  {applicant.phone} <span className="text-xs text-muted-foreground">(phone)</span>
                </a>
              ) : (
                <span className="text-sm text-muted-foreground">Not provided</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      {applicant.notes && (
        <div className="mb-6 p-4 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg border border-amber-200/50 dark:border-amber-800/30">
          <h4 className="font-semibold flex items-center gap-2 mb-3">Notes</h4>
          <FormattedNotes content={applicant.notes} />
        </div>
      )}

      {/* Candidate Profile */}
      <CandidateProfileSection
        applicantId={applicant.id}
        candidateProfile={applicant.candidate_profile}
        onUpdate={() => {}}
      />

      {/* Role History */}
      <div className="my-4">
        <RoleHistorySection
          currentJobTitle={applicant.job_title}
          originalJobTitle={applicant.original_job_title}
          reprofiledAt={applicant.reprofiled_at}
        />
        <ApplicationHistorySection email={applicant.email} currentId={applicant.id} phone={applicant.phone} />
      </div>

      {/* CV and Voice Links */}
      <div className="flex flex-wrap gap-3 mb-4">
        {applicant.cv_file_url && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCvPreview(true)}
              className="inline-flex items-center gap-2 bg-primary/10 text-primary hover:bg-primary/20"
            >
              <FileText className="w-4 h-4" />
              Preview CV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDownloadCv(applicant.id, applicant.cv_file_url!, applicant.full_name)}
              disabled={downloadingCv === applicant.id}
              className="inline-flex items-center gap-2 bg-primary/10 text-primary hover:bg-primary/20"
            >
              {downloadingCv === applicant.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Download CV
            </Button>
          </>
        )}
        {(applicant.vocaroo_link || applicant.voice_recording_url) && (
          applicant.voice_recording_url ? (
            <div className="inline-flex items-center gap-2 px-3 py-2 bg-orange-500/10 text-orange-600 rounded-md text-sm">
              <Mic className="w-4 h-4" />
              <audio controls className="h-8" src={applicant.voice_recording_url}>Your browser does not support audio.</audio>
            </div>
          ) : (
            <a href={applicant.vocaroo_link!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-2 bg-orange-500/10 text-orange-600 rounded-md text-sm hover:bg-orange-500/20 transition-colors">
              <Mic className="w-4 h-4" /> Listen to Voice Recording
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
        <BooleanBadge value={!applicant.currently_working} label={applicant.currently_working ? `Employment Status: ${(applicant as any).employment_status || 'Employed'}` : 'Availability: Available'} />
      </div>
      <div className="grid grid-cols-2 gap-4 mt-4">
        <div>
          <p className="text-sm font-medium">Internet Speed</p>
          <p className="text-sm text-muted-foreground">{applicant.internet_speed}</p>
        </div>
        <div>
          <p className="text-sm font-medium">Start Availability</p>
          <p className="text-sm text-muted-foreground">{applicant.start_availability}</p>
        </div>
        {(applicant as any).employment_status && (
          <div>
            <p className="text-sm font-medium">Employment Status</p>
            <p className="text-sm text-muted-foreground">{(applicant as any).employment_status}</p>
          </div>
        )}
        {(applicant as any).last_day_with_employer && (
          <div>
            <p className="text-sm font-medium">Last Day With Employer</p>
            <p className="text-sm text-muted-foreground">{(applicant as any).last_day_with_employer}</p>
          </div>
        )}
        {(applicant as any).upcoming_plans && (
          <div className="col-span-2">
            <p className="text-sm font-medium">Plans Next 3 Months</p>
            <p className="text-sm text-muted-foreground">{(applicant as any).upcoming_plans}</p>
          </div>
        )}
      </div>

      {/* CV Preview */}
      {showCvPreview && applicant.cv_file_url && (
        <div className="mt-4">
          <CVImagePreview
            pdfUrl={applicant.cv_file_url}
            fileName={`${applicant.full_name} CV.pdf`}
          />
        </div>
      )}
    </div>
  );
};
