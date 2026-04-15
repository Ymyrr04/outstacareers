import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import {
  FileText, Search, MessageCircle, Users, CheckCircle,
  Mail, Zap, Clock, Bot, AlertTriangle, Target, Presentation,
  ArrowRight, ArrowDown, Eye, Fingerprint, Upload, Brain,
  ScanSearch, Star, Calendar, UserCheck, ClipboardCheck,
  Shield, Mic, Bell, Send, RotateCw, Link2, MousePointerClick
} from 'lucide-react';

interface EmailTemplate {
  id?: string;
  name: string;
  subject: string;
  status_trigger: string;
  is_enabled: boolean;
  delay_hours: number | null;
}

type AutomationType = 'ai' | 'email' | 'system' | 'manual' | 'trigger';

interface AutomationNode {
  id: string;
  label: string;
  description: string;
  type: AutomationType;
  icon: React.ElementType;
}

interface StageDefinition {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  borderColor: string;
  description: string;
  automations: AutomationNode[];
  outputs: AutomationNode[];
  emailTriggers: string[];
}

const TYPE_STYLES: Record<AutomationType, { bg: string; iconBg: string; border: string }> = {
  ai: { bg: 'bg-violet-500/5', iconBg: 'bg-violet-500', border: 'border-violet-500/20' },
  email: { bg: 'bg-blue-500/5', iconBg: 'bg-blue-500', border: 'border-blue-500/20' },
  system: { bg: 'bg-amber-500/5', iconBg: 'bg-amber-500', border: 'border-amber-500/20' },
  manual: { bg: 'bg-emerald-500/5', iconBg: 'bg-emerald-500', border: 'border-emerald-500/20' },
  trigger: { bg: 'bg-rose-500/5', iconBg: 'bg-rose-500', border: 'border-rose-500/20' },
};

const STAGES: StageDefinition[] = [
  {
    id: 'application',
    label: 'Application Submitted',
    icon: FileText,
    color: 'bg-blue-500',
    borderColor: 'border-blue-500',
    description: 'Candidate submits application via job page or talent pool form.',
    automations: [
      { id: 'a1', label: 'Pre-screening Validation', description: 'Validates all required fields, checks honeypot for spam bots', type: 'system', icon: Shield },
      { id: 'a2', label: 'CV Upload to Storage', description: 'PDF file uploaded to secure cloud storage bucket', type: 'system', icon: Upload },
      { id: 'a3', label: 'Duplicate Detection', description: 'Checks email & phone against existing applicants to flag repeat applications', type: 'system', icon: Fingerprint },
      { id: 'a4', label: 'Source Tracking', description: 'Records where the application came from (job board, referral, talent pool, direct)', type: 'system', icon: Link2 },
    ],
    outputs: [
      { id: 'o1', label: 'Trigger AI Scoring', description: 'Passes CV to AI scoring pipeline', type: 'trigger', icon: ArrowRight },
    ],
    emailTriggers: [],
  },
  {
    id: 'ai-scoring',
    label: 'AI CV Scoring',
    icon: Brain,
    color: 'bg-violet-500',
    borderColor: 'border-violet-500',
    description: 'AI automatically analyzes and scores the CV against job requirements.',
    automations: [
      { id: 'b1', label: 'CV Text Extraction', description: 'Uses Vision API to extract text from PDF, handles scanned documents', type: 'ai', icon: Eye },
      { id: 'b2', label: 'Role Experience Score', description: 'AI evaluates years of experience and relevance to the job description', type: 'ai', icon: Brain },
      { id: 'b3', label: 'Skills & Tools Score', description: 'Extracts and matches skills/tools against job requirements', type: 'ai', icon: ScanSearch },
      { id: 'b4', label: 'Availability & Setup Score', description: 'Scores based on timezone, internet, equipment, and start date', type: 'ai', icon: CheckCircle },
      { id: 'b5', label: 'Red Flag Detection', description: 'Identifies concerns: short tenures, gaps, mismatched experience', type: 'ai', icon: AlertTriangle },
      { id: 'b6', label: 'Total Score Calculation', description: 'Combines all 4 category scores into a weighted total (0-100)', type: 'system', icon: ClipboardCheck },
    ],
    outputs: [
      { id: 'o2', label: 'Move to For Review', description: 'Applicant appears in admin dashboard with AI score', type: 'trigger', icon: ArrowRight },
    ],
    emailTriggers: [],
  },
  {
    id: 'for-review',
    label: 'For Review',
    icon: Search,
    color: 'bg-cyan-500',
    borderColor: 'border-cyan-500',
    description: 'Admins review AI-scored applications, pre-screening answers, and CV quality.',
    automations: [
      { id: 'c1', label: 'New Applicant Badge', description: 'Unviewed applicants show "new" badge with count in tab header', type: 'system', icon: Bell },
      { id: 'c2', label: 'Details Viewed Tracking', description: 'Records when admin first opens the applicant details', type: 'system', icon: Eye },
    ],
    outputs: [
      { id: 'o3', label: 'Star Candidate', description: 'Flag promising candidates for quick filtering', type: 'manual', icon: Star },
      { id: 'o4', label: 'Move to For Interview', description: 'Admin approves candidate for interview stage', type: 'manual', icon: ArrowRight },
      { id: 'o5', label: 'Move to Reject', description: 'Not qualified — triggers rejection flow', type: 'manual', icon: AlertTriangle },
      { id: 'o6', label: 'Move to Talent Pool', description: 'Good candidate but no current matching role', type: 'manual', icon: Target },
    ],
    emailTriggers: ['For Review'],
  },
  {
    id: 'for-interview',
    label: 'For Interview',
    icon: MessageCircle,
    color: 'bg-purple-500',
    borderColor: 'border-purple-500',
    description: 'Candidates receive an AI-powered interview invite with role-specific questions.',
    automations: [
      { id: 'd1', label: 'Interview Invite Email', description: 'Automated email with unique interview link sent to candidate', type: 'email', icon: Send },
      { id: 'd2', label: 'AI Question Generation', description: 'Generates role-specific interview questions (MCQ + text + voice)', type: 'ai', icon: Brain },
      { id: 'd3', label: '20-min Reminder', description: 'If interview not started after 20 minutes, reminder email sent', type: 'email', icon: Clock },
      { id: 'd4', label: '2-hour Reminder', description: 'Second reminder if still not started after 2 hours', type: 'email', icon: Clock },
    ],
    outputs: [
      { id: 'o7', label: 'Candidate Starts Interview', description: 'Interview session begins — candidate answers questions', type: 'trigger', icon: ArrowRight },
    ],
    emailTriggers: ['For Interview'],
  },
  {
    id: 'ai-interview',
    label: 'AI Interview Assessment',
    icon: Bot,
    color: 'bg-violet-500',
    borderColor: 'border-violet-500',
    description: 'Candidate completes the AI interview; system processes and scores responses.',
    automations: [
      { id: 'e1', label: 'Paste Detection', description: 'Monitors for pasted content in text answers — flags integrity issues', type: 'system', icon: Shield },
      { id: 'e2', label: 'Voice Recording', description: 'Records and stores voice answers in cloud storage', type: 'system', icon: Mic },
      { id: 'e3', label: 'AI Assessment', description: 'Scores each answer across 5 dimensions: technical, experience, communication, situational, personality', type: 'ai', icon: Brain },
      { id: 'e4', label: 'Strengths & Concerns', description: 'AI generates list of candidate strengths and potential concerns', type: 'ai', icon: ClipboardCheck },
      { id: 'e5', label: 'Admin Notification', description: 'Notifies admin team when interview is completed and scored', type: 'email', icon: Bell },
    ],
    outputs: [
      { id: 'o8', label: 'Move to SIV', description: 'Results ready for internal vetting', type: 'trigger', icon: ArrowRight },
    ],
    emailTriggers: [],
  },
  {
    id: 'siv',
    label: 'SIV (Internal Vetting)',
    icon: Search,
    color: 'bg-cyan-500',
    borderColor: 'border-cyan-500',
    description: 'Structured Internal Vetting — recruiter reviews interview results and builds candidate profile.',
    automations: [
      { id: 'f1', label: 'Score Summary Dashboard', description: 'Displays interview scores, AI assessment, and category breakdown', type: 'system', icon: ClipboardCheck },
      { id: 'f2', label: 'AI Summary Generation', description: 'Generates a concise candidate summary from interview data', type: 'ai', icon: Brain },
    ],
    outputs: [
      { id: 'o9', label: 'Build Candidate Profile', description: 'Recruiter creates client-facing profile document', type: 'manual', icon: FileText },
      { id: 'o10', label: 'Add Interview Notes', description: 'Structured timestamped notes from recruiter review', type: 'manual', icon: ClipboardCheck },
      { id: 'o11', label: 'Move to Pitch', description: 'Candidate approved for client presentation', type: 'manual', icon: ArrowRight },
    ],
    emailTriggers: ['SIV'],
  },
  {
    id: 'pitch',
    label: 'Pitch to Client',
    icon: Presentation,
    color: 'bg-fuchsia-500',
    borderColor: 'border-fuchsia-500',
    description: 'Candidate profile is presented to the client for consideration.',
    automations: [],
    outputs: [
      { id: 'o12', label: 'Share Candidate Profile', description: 'Send profile document to client contact', type: 'manual', icon: Send },
      { id: 'o13', label: 'Schedule Introduction', description: 'Arrange initial call between candidate and client', type: 'manual', icon: Calendar },
      { id: 'o14', label: 'Move to Client Interview', description: 'Client interested — proceed to formal interview', type: 'manual', icon: ArrowRight },
    ],
    emailTriggers: ['Pitch'],
  },
  {
    id: 'client-interview',
    label: 'Client Interview',
    icon: Users,
    color: 'bg-orange-500',
    borderColor: 'border-orange-500',
    description: 'Candidate interviews directly with the client.',
    automations: [
      { id: 'g1', label: 'Calendly Scheduling', description: 'Integrated Calendly link for booking interview slots', type: 'system', icon: Calendar },
    ],
    outputs: [
      { id: 'o15', label: 'Send Prep Email', description: 'Interview preparation details sent to candidate', type: 'manual', icon: Send },
      { id: 'o16', label: 'Collect Client Feedback', description: 'Record client decision and feedback', type: 'manual', icon: ClipboardCheck },
      { id: 'o17', label: 'Move to Hired', description: 'Client approves — trigger hiring flow', type: 'manual', icon: CheckCircle },
      { id: 'o18', label: 'Move to Bench', description: 'Good but client wants to wait', type: 'manual', icon: Clock },
    ],
    emailTriggers: ['Client Interview'],
  },
  {
    id: 'hired',
    label: 'Hired',
    icon: CheckCircle,
    color: 'bg-emerald-500',
    borderColor: 'border-emerald-500',
    description: 'Candidate is hired — contractor assignment created and enters post-hire pipeline.',
    automations: [
      { id: 'h1', label: 'Assignment Dialog', description: 'Popup captures client, rate, start date, hours/week, timesheet link', type: 'system', icon: ClipboardCheck },
      { id: 'h2', label: 'Create Contractor Record', description: 'Contractor assignment record created in database', type: 'system', icon: UserCheck },
      { id: 'h3', label: 'Enter Post-Hire Pipeline', description: 'Auto-placed in Onboarding stage of post-hire milestone tracker', type: 'system', icon: Target },
    ],
    outputs: [
      { id: 'o19', label: 'Trigger Post-Hire Flow', description: 'Starts milestone-based tracking', type: 'trigger', icon: ArrowRight },
    ],
    emailTriggers: ['Hired'],
  },
  {
    id: 'post-hire',
    label: 'Post-Hire Pipeline',
    icon: Target,
    color: 'bg-teal-500',
    borderColor: 'border-teal-500',
    description: 'Milestone-based tracking from onboarding to settled (120 days).',
    automations: [
      { id: 'i1', label: 'Auto-Advance Stages', description: 'Daily cron job checks days elapsed from start_date and moves contractors to next milestone', type: 'system', icon: RotateCw },
      { id: 'i2', label: 'Client Check-in Email', description: 'At each milestone, email sent to client asking about contractor performance', type: 'email', icon: Send },
      { id: 'i3', label: 'Contractor Welcome Email', description: 'Welcome/onboarding email sent to the contractor', type: 'email', icon: Mail },
      { id: 'i4', label: 'Stage Email Templates', description: 'Each milestone has configurable email templates for both client and contractor', type: 'email', icon: FileText },
    ],
    outputs: [
      { id: 'o20', label: 'Settled', description: 'Contractor completes 120-day milestone — fully onboarded', type: 'trigger', icon: CheckCircle },
    ],
    emailTriggers: [],
  },
  {
    id: 'reject',
    label: 'Reject',
    icon: AlertTriangle,
    color: 'bg-red-500',
    borderColor: 'border-red-500',
    description: 'Candidates who did not meet requirements.',
    automations: [
      { id: 'j1', label: 'Rejection Email', description: 'Automated rejection email with configurable delay (hours)', type: 'email', icon: Send },
      { id: 'j2', label: 'Status History Logged', description: 'Records the from → to status transition with timestamp and admin', type: 'system', icon: ClipboardCheck },
    ],
    outputs: [
      { id: 'o21', label: 'Reconsider', description: 'Admin can move candidate back into pipeline', type: 'manual', icon: RotateCw },
    ],
    emailTriggers: ['Reject', 'Rejected'],
  },
  {
    id: 'bench',
    label: 'Bench',
    icon: Clock,
    color: 'bg-amber-500',
    borderColor: 'border-amber-500',
    description: 'Qualified candidates waiting for a suitable placement.',
    automations: [
      { id: 'k1', label: 'Availability Check Email', description: 'Magic-link email with "Available" / "Not Available" buttons — no login required', type: 'email', icon: Send },
      { id: 'k2', label: 'Response Tracking', description: 'Automatically records availability response and timestamp', type: 'system', icon: MousePointerClick },
      { id: 'k3', label: 'Status Badge Update', description: 'Shows green/red availability badge on applicant card', type: 'system', icon: CheckCircle },
    ],
    outputs: [
      { id: 'o22', label: 'Reprofile', description: 'Move to a different role when opportunity arises', type: 'manual', icon: RotateCw },
      { id: 'o23', label: 'Re-enter Pipeline', description: 'Move back to active pipeline for matching role', type: 'manual', icon: ArrowRight },
    ],
    emailTriggers: ['Bench'],
  },
  {
    id: 'talent-pool',
    label: 'Talent Pool',
    icon: Target,
    color: 'bg-indigo-500',
    borderColor: 'border-indigo-500',
    description: 'General pool for candidates without a specific role.',
    automations: [
      { id: 'l1', label: 'Talent Scout AI Matching', description: 'AI matches pool candidates against open job descriptions — ranks by fit', type: 'ai', icon: Brain },
      { id: 'l2', label: 'Boolean Search', description: 'Advanced search with AND/OR/NOT operators across skills, tools, experience', type: 'system', icon: ScanSearch },
    ],
    outputs: [
      { id: 'o24', label: 'Reprofile to Job', description: 'Match found — move candidate to specific job pipeline', type: 'manual', icon: ArrowRight },
      { id: 'o25', label: 'Send Opportunity Email', description: 'Notify candidate about matching opportunity', type: 'manual', icon: Send },
    ],
    emailTriggers: ['Talent Pool'],
  },
];

// ─── Sub-components ─────────────────────────────────────────────

const AutomationMiniNode = ({ node }: { node: AutomationNode }) => {
  const styles = TYPE_STYLES[node.type];
  const Icon = node.icon;
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${styles.border} ${styles.bg} transition-all hover:shadow-sm`}>
      <div className={`w-8 h-8 rounded-lg ${styles.iconBg} flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground leading-tight">{node.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{node.description}</p>
      </div>
    </div>
  );
};

const MiniConnector = () => (
  <div className="flex justify-center py-0.5">
    <div className="w-0.5 h-3 bg-muted-foreground/20 rounded-full" />
  </div>
);

const StageFlowCard = ({
  stage,
  isExpanded,
  onToggle,
  templates,
}: {
  stage: StageDefinition;
  isExpanded: boolean;
  onToggle: () => void;
  templates: EmailTemplate[];
}) => {
  const Icon = stage.icon;
  const matchedTemplates = templates.filter(t =>
    stage.emailTriggers.some(tr => t.status_trigger.toLowerCase() === tr.toLowerCase())
  );
  const autoCount = stage.automations.length;
  const outputCount = stage.outputs.length;

  return (
    <div className={`rounded-xl border-2 transition-all ${isExpanded ? `${stage.borderColor} shadow-lg` : 'border-border hover:border-primary/20'}`}>
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 text-left"
      >
        <div className={`w-11 h-11 rounded-xl ${stage.color} flex items-center justify-center shadow-md flex-shrink-0`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-foreground">{stage.label}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{stage.description}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {autoCount > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0.5">
              <Zap className="w-3 h-3" />
              {autoCount}
            </Badge>
          )}
          {matchedTemplates.length > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0.5">
              <Mail className="w-3 h-3" />
              {matchedTemplates.length}
            </Badge>
          )}
          {outputCount > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0.5">
              <ArrowRight className="w-3 h-3" />
              {outputCount}
            </Badge>
          )}
          <ArrowDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Expanded detail — n8n-style automation flow */}
      {isExpanded && (
        <div className="px-4 pb-5 pt-0 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* Column 1: Automations flow */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded bg-amber-500/10 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <span className="text-sm font-semibold text-foreground">Automations</span>
              </div>
              {stage.automations.length > 0 ? (
                stage.automations.map((auto, i) => (
                  <div key={auto.id}>
                    <AutomationMiniNode node={auto} />
                    {i < stage.automations.length - 1 && <MiniConnector />}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground italic p-3">Manual stage — no automations</p>
              )}
            </div>

            {/* Column 2: Email templates */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded bg-blue-500/10 flex items-center justify-center">
                  <Mail className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <span className="text-sm font-semibold text-foreground">Email Templates</span>
              </div>
              {matchedTemplates.length > 0 ? (
                matchedTemplates.map((tpl, i) => (
                  <div key={tpl.id}>
                    <div className="flex items-start gap-3 p-3 rounded-lg border border-blue-500/20 bg-blue-500/5">
                      <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                        <Mail className="w-4 h-4 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-foreground leading-tight truncate">{tpl.name || tpl.subject}</p>
                          <Badge variant={tpl.is_enabled ? 'default' : 'secondary'} className="text-[9px] px-1.5 py-0 flex-shrink-0">
                            {tpl.is_enabled ? 'Active' : 'Off'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">Subject: {tpl.subject}</p>
                        {tpl.delay_hours && tpl.delay_hours > 0 && (
                          <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                            <Clock className="w-3 h-3" />
                            {tpl.delay_hours}h delay after status change
                          </p>
                        )}
                      </div>
                    </div>
                    {i < matchedTemplates.length - 1 && <MiniConnector />}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground italic p-3">No email templates for this stage</p>
              )}
            </div>

            {/* Column 3: Output actions */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded bg-emerald-500/10 flex items-center justify-center">
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <span className="text-sm font-semibold text-foreground">Outputs & Actions</span>
              </div>
              {stage.outputs.map((output, i) => (
                <div key={output.id}>
                  <AutomationMiniNode node={output} />
                  {i < stage.outputs.length - 1 && <MiniConnector />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Top-level visual flow ──────────────────────────────────────

const FlowNodePill = ({
  stage,
  isActive,
  onClick,
}: {
  stage: StageDefinition;
  isActive: boolean;
  onClick: () => void;
}) => {
  const Icon = stage.icon;
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all text-xs font-semibold whitespace-nowrap
        ${isActive
          ? `${stage.borderColor} border-2 bg-card shadow-md scale-105`
          : 'border-border bg-card/50 hover:bg-card hover:border-primary/20'
        }
      `}
    >
      <div className={`w-6 h-6 rounded-md ${stage.color} flex items-center justify-center`}>
        <Icon className="w-3.5 h-3.5 text-white" />
      </div>
      <span className={isActive ? 'text-foreground' : 'text-muted-foreground'}>{stage.label}</span>
    </button>
  );
};

// ─── Main component ─────────────────────────────────────────────

export const WorkflowBoard = () => {
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);

  useEffect(() => {
    const fetchTemplates = async () => {
      const { data } = await supabase
        .from('email_templates')
        .select('id, name, subject, status_trigger, is_enabled, delay_hours')
        .order('template_order', { ascending: true });
      if (data) setEmailTemplates(data as EmailTemplate[]);
    };
    fetchTemplates();
  }, []);

  const mainStageIds = ['application', 'ai-scoring', 'for-review', 'for-interview', 'ai-interview', 'siv', 'pitch', 'client-interview', 'hired', 'post-hire'];
  const branchStageIds = ['reject', 'bench', 'talent-pool'];

  const scrollToStage = (id: string) => {
    setExpandedStage(expandedStage === id ? null : id);
    setTimeout(() => {
      document.getElementById(`stage-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Recruitment Workflow</h2>
        <p className="text-muted-foreground mt-1">
          Click any stage to see its automations, email triggers, and output actions broken down step-by-step.
        </p>
      </div>

      {/* Quick nav — main flow */}
      <div className="bg-muted/30 rounded-xl border p-4 space-y-3">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {mainStageIds.map((id, i) => {
            const stage = STAGES.find(s => s.id === id)!;
            return (
              <div key={id} className="flex items-center">
                <FlowNodePill stage={stage} isActive={expandedStage === id} onClick={() => scrollToStage(id)} />
                {i < mainStageIds.length - 1 && (
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 mx-0.5 flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>
        {/* Branch paths */}
        <div className="flex items-center gap-3 pl-2">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Branches:</span>
          {branchStageIds.map(id => {
            const stage = STAGES.find(s => s.id === id)!;
            return (
              <FlowNodePill key={id} stage={stage} isActive={expandedStage === id} onClick={() => scrollToStage(id)} />
            );
          })}
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 pt-2 border-t border-border/50">
          {[
            { label: 'AI Powered', ...TYPE_STYLES.ai },
            { label: 'Email', ...TYPE_STYLES.email },
            { label: 'System', ...TYPE_STYLES.system },
            { label: 'Manual', ...TYPE_STYLES.manual },
            { label: 'Trigger', ...TYPE_STYLES.trigger },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <div className={`w-3.5 h-3.5 rounded ${item.iconBg}`} />
              {item.label}
            </div>
          ))}
        </div>
      </div>

      {/* Stage cards with automation breakdowns */}
      <div className="space-y-3">
        {STAGES.map(stage => (
          <div key={stage.id} id={`stage-${stage.id}`}>
            <StageFlowCard
              stage={stage}
              isExpanded={expandedStage === stage.id}
              onToggle={() => setExpandedStage(expandedStage === stage.id ? null : stage.id)}
              templates={emailTemplates}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
