import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  FileText, Search, MessageCircle, Users, CheckCircle, UserCheck,
  Mail, Zap, ArrowRight, ChevronDown, ChevronUp, Pencil, Save, X,
  Clock, Bot, Send, AlertTriangle, Archive, Target, Presentation
} from 'lucide-react';

interface StageConfig {
  name: string;
  icon: React.ElementType;
  color: string;
  borderColor: string;
  description: string;
  automations: string[];
  emailTemplates: EmailTemplate[];
  actions: string[];
}

interface EmailTemplate {
  id?: string;
  name: string;
  subject: string;
  status_trigger: string;
  is_enabled: boolean;
  delay_hours: number | null;
}

const STAGES: StageConfig[] = [
  {
    name: 'For Review',
    icon: FileText,
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    borderColor: 'border-blue-500/30',
    description: 'New applications land here. CV is auto-scored by AI. Admins review applicant details, pre-screening answers, and CV quality.',
    automations: [
      'AI CV scoring runs automatically on submission',
      'Duplicate detection checks email & phone',
      'Application source tracking (job board, referral, talent pool)',
    ],
    actions: [
      'View pre-screening answers',
      'Review AI score breakdown',
      'Star promising candidates',
      'Move to For Interview or Reject',
    ],
    emailTemplates: [],
  },
  {
    name: 'For Interview',
    icon: MessageCircle,
    color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    borderColor: 'border-purple-500/30',
    description: 'Candidates selected for AI-powered interview assessment. An interview invite email is sent with a unique link.',
    automations: [
      'Interview invite email sent automatically',
      'Reminder emails at 20min and 2hr if not started',
      'AI generates role-specific interview questions',
    ],
    actions: [
      'Send interview invite',
      'Send manual follow-up email',
      'View interview results when completed',
      'Move to SIV or Reject',
    ],
    emailTemplates: [],
  },
  {
    name: 'SIV',
    icon: Search,
    color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
    borderColor: 'border-cyan-500/30',
    description: 'Structured Internal Vetting — detailed internal review of the candidate by the recruitment team based on interview results and CV.',
    automations: [
      'Interview score summary available',
      'AI assessment with strengths & concerns',
    ],
    actions: [
      'Review full interview transcript',
      'Add structured interview notes',
      'Build candidate profile for client',
      'Move to Pitch or Reject',
    ],
    emailTemplates: [],
  },
  {
    name: 'Pitch',
    icon: Presentation,
    color: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400',
    borderColor: 'border-fuchsia-500/30',
    description: 'Candidate profile is prepared and pitched to the client. The recruiter presents the candidate\'s strengths, experience, and fit.',
    automations: [],
    actions: [
      'Prepare candidate profile document',
      'Share profile with client contact',
      'Schedule client introduction',
      'Move to Client Interview or back to SIV',
    ],
    emailTemplates: [],
  },
  {
    name: 'Client Interview',
    icon: Users,
    color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    borderColor: 'border-orange-500/30',
    description: 'Candidate interviews directly with the client. Recruiter coordinates scheduling and follows up on feedback.',
    automations: [
      'Calendly integration for scheduling',
    ],
    actions: [
      'Schedule client interview via Calendly',
      'Send prep email to candidate',
      'Collect client feedback',
      'Move to Hired or Reject',
    ],
    emailTemplates: [],
  },
  {
    name: 'Hired',
    icon: CheckCircle,
    color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    borderColor: 'border-emerald-500/30',
    description: 'Candidate is hired! A contractor assignment is created linking them to the client. They enter the post-hire pipeline.',
    automations: [
      'Contractor assignment dialog triggers on status change',
      'Auto-enters post-hire pipeline (Onboarding stage)',
      'Client notification can be triggered',
    ],
    actions: [
      'Create contractor assignment (client, rate, start date)',
      'Set up timesheet link',
      'Add to post-hire milestone tracking',
    ],
    emailTemplates: [],
  },
  {
    name: 'Bench',
    icon: Clock,
    color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    borderColor: 'border-amber-500/30',
    description: 'Qualified candidates waiting for a suitable placement. Availability is periodically checked via automated emails.',
    automations: [
      'Availability check emails with magic-link responses',
      'Auto-tracks availability status (Available / Not Available)',
    ],
    actions: [
      'Send availability check email',
      'Reprofile to a different role',
      'Move to active pipeline when opportunity arises',
    ],
    emailTemplates: [],
  },
  {
    name: 'Reject',
    icon: AlertTriangle,
    color: 'bg-red-500/10 text-red-600 dark:text-red-400',
    borderColor: 'border-red-500/30',
    description: 'Candidates who did not meet requirements. A rejection email is sent. They can reapply in the future.',
    automations: [
      'Rejection email sent automatically (configurable delay)',
    ],
    actions: [
      'Send rejection email',
      'Move back to pipeline if reconsidered',
    ],
    emailTemplates: [],
  },
  {
    name: 'Talent Pool',
    icon: Target,
    color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    borderColor: 'border-indigo-500/30',
    description: 'General talent pool for candidates who applied without a specific role. Can be matched to future openings via Talent Scout.',
    automations: [
      'Talent Scout AI matching against open jobs',
      'Boolean search across all talent pool candidates',
    ],
    actions: [
      'Run Talent Scout matching',
      'Reprofile to a specific job',
      'Send opportunity emails',
    ],
    emailTemplates: [],
  },
];

export const WorkflowBoard = () => {
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [editingDescription, setEditingDescription] = useState<string | null>(null);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const { toast } = useToast();

  useEffect(() => {
    const fetchTemplates = async () => {
      const { data } = await supabase
        .from('email_templates')
        .select('id, name, subject, status_trigger, is_enabled, delay_hours')
        .order('template_order', { ascending: true });
      if (data) setEmailTemplates(data as EmailTemplate[]);
    };
    fetchTemplates();

    // Initialize descriptions
    const descs: Record<string, string> = {};
    STAGES.forEach(s => { descs[s.name] = s.description; });
    setDescriptions(descs);
  }, []);

  const getTemplatesForStage = (stageName: string): EmailTemplate[] => {
    const triggerMap: Record<string, string[]> = {
      'For Review': ['For Review'],
      'For Interview': ['For Interview', 'interview_invite'],
      'SIV': ['SIV'],
      'Pitch': ['Pitch'],
      'Client Interview': ['Client Interview'],
      'Hired': ['Hired'],
      'Bench': ['Bench'],
      'Reject': ['Reject', 'Rejected'],
      'Talent Pool': ['Talent Pool'],
    };
    const triggers = triggerMap[stageName] || [stageName];
    return emailTemplates.filter(t => triggers.some(tr => 
      t.status_trigger.toLowerCase() === tr.toLowerCase()
    ));
  };

  const toggleStage = (name: string) => {
    setExpandedStage(expandedStage === name ? null : name);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Recruitment Workflow</h2>
        <p className="text-muted-foreground mt-1">
          Interactive view of the recruitment pipeline — stages, automations, email triggers, and available actions.
        </p>
      </div>

      {/* Visual flow overview */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {STAGES.filter(s => !['Bench', 'Reject', 'Talent Pool'].includes(s.name)).map((stage, i, arr) => {
          const Icon = stage.icon;
          return (
            <div key={stage.name} className="flex items-center">
              <button
                onClick={() => toggleStage(stage.name)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all hover:scale-105 ${
                  expandedStage === stage.name 
                    ? `${stage.color} ${stage.borderColor} border-2 shadow-md` 
                    : 'bg-card border-border hover:border-primary/30'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm font-medium whitespace-nowrap">{stage.name}</span>
              </button>
              {i < arr.length - 1 && (
                <ArrowRight className="w-4 h-4 text-muted-foreground mx-1 flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Side tracks */}
      <div className="flex gap-3">
        {STAGES.filter(s => ['Bench', 'Reject', 'Talent Pool'].includes(s.name)).map(stage => {
          const Icon = stage.icon;
          return (
            <button
              key={stage.name}
              onClick={() => toggleStage(stage.name)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all hover:scale-105 ${
                expandedStage === stage.name 
                  ? `${stage.color} ${stage.borderColor} border-2 shadow-md` 
                  : 'bg-card border-border hover:border-primary/30'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{stage.name}</span>
            </button>
          );
        })}
      </div>

      {/* Stage details */}
      <div className="space-y-4">
        {STAGES.map(stage => {
          const Icon = stage.icon;
          const isExpanded = expandedStage === stage.name;
          const templates = getTemplatesForStage(stage.name);

          return (
            <Card 
              key={stage.name} 
              className={`transition-all ${isExpanded ? `${stage.borderColor} border-2` : 'border'}`}
            >
              <CardHeader 
                className="cursor-pointer py-4" 
                onClick={() => toggleStage(stage.name)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${stage.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{stage.name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {descriptions[stage.name]?.slice(0, 80)}...
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {templates.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        <Mail className="w-3 h-3 mr-1" />
                        {templates.length} email{templates.length > 1 ? 's' : ''}
                      </Badge>
                    )}
                    {stage.automations.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        <Zap className="w-3 h-3 mr-1" />
                        {stage.automations.length} auto
                      </Badge>
                    )}
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="pt-0 space-y-6">
                  {/* Description */}
                  <div className="bg-muted/50 rounded-lg p-4">
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Stage Description
                    </h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {descriptions[stage.name]}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Automations */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-500" />
                        Automations
                      </h4>
                      {stage.automations.length > 0 ? (
                        <ul className="space-y-2">
                          {stage.automations.map((auto, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                              <Bot className="w-4 h-4 mt-0.5 text-amber-500 flex-shrink-0" />
                              {auto}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No automations at this stage</p>
                      )}
                    </div>

                    {/* Email Templates */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Mail className="w-4 h-4 text-blue-500" />
                        Email Templates
                      </h4>
                      {templates.length > 0 ? (
                        <ul className="space-y-2">
                          {templates.map((tpl) => (
                            <li key={tpl.id} className="p-2 bg-card rounded-lg border text-sm">
                              <div className="flex items-center justify-between">
                                <span className="font-medium">{tpl.name || tpl.subject}</span>
                                <Badge 
                                  variant={tpl.is_enabled ? 'default' : 'secondary'}
                                  className="text-xs"
                                >
                                  {tpl.is_enabled ? 'Active' : 'Disabled'}
                                </Badge>
                              </div>
                              <p className="text-muted-foreground text-xs mt-1">
                                Subject: {tpl.subject}
                              </p>
                              {tpl.delay_hours && tpl.delay_hours > 0 && (
                                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {tpl.delay_hours}h delay
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No email templates configured</p>
                      )}
                    </div>

                    {/* Available Actions */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                        Available Actions
                      </h4>
                      <ul className="space-y-2">
                        {stage.actions.map((action, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <ArrowRight className="w-4 h-4 mt-0.5 text-emerald-500 flex-shrink-0" />
                            {action}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};
