import { useState, useEffect, useRef, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import {
  FileText, Search, MessageCircle, Users, CheckCircle,
  Mail, Zap, Clock, Bot, AlertTriangle, Target, Presentation,
  ArrowDown, Eye, Fingerprint, Upload, Brain,
  ScanSearch, Star, Calendar, UserCheck, ClipboardCheck,
  Shield, Mic, Bell, Send, RotateCw, Link2, MousePointerClick, X
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────

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
  shortLabel?: string;
  icon: React.ElementType;
  color: string;
  textColor: string;
  description: string;
  automations: AutomationNode[];
  outputs: AutomationNode[];
  emailTriggers: string[];
}

// ─── Styles ─────────────────────────────────────────────────────

const TYPE_STYLES: Record<AutomationType, { bg: string; iconBg: string; border: string; text: string }> = {
  ai: { bg: 'bg-violet-500/5', iconBg: 'bg-violet-500', border: 'border-violet-500/20', text: 'text-violet-600 dark:text-violet-400' },
  email: { bg: 'bg-blue-500/5', iconBg: 'bg-blue-500', border: 'border-blue-500/20', text: 'text-blue-600 dark:text-blue-400' },
  system: { bg: 'bg-amber-500/5', iconBg: 'bg-amber-500', border: 'border-amber-500/20', text: 'text-amber-600 dark:text-amber-400' },
  manual: { bg: 'bg-emerald-500/5', iconBg: 'bg-emerald-500', border: 'border-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400' },
  trigger: { bg: 'bg-rose-500/5', iconBg: 'bg-rose-500', border: 'border-rose-500/20', text: 'text-rose-600 dark:text-rose-400' },
};

// ─── Stage data ─────────────────────────────────────────────────

const STAGES: StageDefinition[] = [
  {
    id: 'application',
    label: 'Application Submitted',
    shortLabel: 'Application',
    icon: FileText,
    color: 'bg-blue-500',
    textColor: 'text-blue-600 dark:text-blue-400',
    description: 'Candidate submits application via job page or talent pool form.',
    automations: [
      { id: 'a1', label: 'Pre-screening Validation', description: 'Validates all required fields, checks honeypot for spam bots', type: 'system', icon: Shield },
      { id: 'a2', label: 'CV Upload to Storage', description: 'PDF file uploaded to secure cloud storage bucket', type: 'system', icon: Upload },
      { id: 'a3', label: 'Duplicate Detection', description: 'Checks email & phone against existing applicants to flag repeat applications', type: 'system', icon: Fingerprint },
      { id: 'a4', label: 'Source Tracking', description: 'Records where the application came from (job board, referral, talent pool, direct)', type: 'system', icon: Link2 },
    ],
    outputs: [
      { id: 'o1', label: 'Trigger AI Scoring', description: 'Passes CV to AI scoring pipeline', type: 'trigger', icon: Zap },
    ],
    emailTriggers: [],
  },
  {
    id: 'ai-scoring',
    label: 'AI CV Scoring',
    icon: Brain,
    color: 'bg-violet-500',
    textColor: 'text-violet-600 dark:text-violet-400',
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
      { id: 'o2', label: 'Move to For Review', description: 'Applicant appears in admin dashboard with AI score', type: 'trigger', icon: Zap },
    ],
    emailTriggers: [],
  },
  {
    id: 'for-review',
    label: 'For Review',
    icon: Search,
    color: 'bg-cyan-500',
    textColor: 'text-cyan-600 dark:text-cyan-400',
    description: 'Admins review AI-scored applications, pre-screening answers, and CV quality.',
    automations: [
      { id: 'c1', label: 'New Applicant Badge', description: 'Unviewed applicants show "new" badge with count in tab header', type: 'system', icon: Bell },
      { id: 'c2', label: 'Details Viewed Tracking', description: 'Records when admin first opens the applicant details', type: 'system', icon: Eye },
    ],
    outputs: [
      { id: 'o3', label: 'Star Candidate', description: 'Flag promising candidates for quick filtering', type: 'manual', icon: Star },
      { id: 'o4', label: 'Move to For Interview', description: 'Admin approves candidate for interview stage', type: 'manual', icon: Zap },
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
    textColor: 'text-purple-600 dark:text-purple-400',
    description: 'Candidates receive an AI-powered interview invite with role-specific questions.',
    automations: [
      { id: 'd1', label: 'Interview Invite Email', description: 'Automated email with unique interview link sent to candidate', type: 'email', icon: Send },
      { id: 'd2', label: 'AI Question Generation', description: 'Generates role-specific interview questions (MCQ + text + voice)', type: 'ai', icon: Brain },
      { id: 'd3', label: '20-min Reminder', description: 'If interview not started after 20 minutes, reminder email sent', type: 'email', icon: Clock },
      { id: 'd4', label: '2-hour Reminder', description: 'Second reminder if still not started after 2 hours', type: 'email', icon: Clock },
    ],
    outputs: [
      { id: 'o7', label: 'Candidate Starts Interview', description: 'Interview session begins — candidate answers questions', type: 'trigger', icon: Zap },
    ],
    emailTriggers: ['For Interview'],
  },
  {
    id: 'ai-interview',
    label: 'AI Interview Assessment',
    shortLabel: 'AI Interview',
    icon: Bot,
    color: 'bg-violet-500',
    textColor: 'text-violet-600 dark:text-violet-400',
    description: 'Candidate completes the AI interview; system processes and scores responses.',
    automations: [
      { id: 'e1', label: 'Paste Detection', description: 'Monitors for pasted content in text answers — flags integrity issues', type: 'system', icon: Shield },
      { id: 'e2', label: 'Voice Recording', description: 'Records and stores voice answers in cloud storage', type: 'system', icon: Mic },
      { id: 'e3', label: 'AI Assessment', description: 'Scores each answer across 5 dimensions: technical, experience, communication, situational, personality', type: 'ai', icon: Brain },
      { id: 'e4', label: 'Strengths & Concerns', description: 'AI generates list of candidate strengths and potential concerns', type: 'ai', icon: ClipboardCheck },
      { id: 'e5', label: 'Admin Notification', description: 'Notifies admin team when interview is completed and scored', type: 'email', icon: Bell },
    ],
    outputs: [
      { id: 'o8', label: 'Move to SIV', description: 'Results ready for internal vetting', type: 'trigger', icon: Zap },
    ],
    emailTriggers: [],
  },
  {
    id: 'siv',
    label: 'SIV (Internal Vetting)',
    shortLabel: 'SIV',
    icon: Search,
    color: 'bg-cyan-500',
    textColor: 'text-cyan-600 dark:text-cyan-400',
    description: 'Structured Internal Vetting — recruiter reviews interview results and builds candidate profile.',
    automations: [
      { id: 'f1', label: 'Score Summary Dashboard', description: 'Displays interview scores, AI assessment, and category breakdown', type: 'system', icon: ClipboardCheck },
      { id: 'f2', label: 'AI Summary Generation', description: 'Generates a concise candidate summary from interview data', type: 'ai', icon: Brain },
    ],
    outputs: [
      { id: 'o9', label: 'Build Candidate Profile', description: 'Recruiter creates client-facing profile document', type: 'manual', icon: FileText },
      { id: 'o10', label: 'Add Interview Notes', description: 'Structured timestamped notes from recruiter review', type: 'manual', icon: ClipboardCheck },
      { id: 'o11', label: 'Move to Pitch', description: 'Candidate approved for client presentation', type: 'manual', icon: Zap },
    ],
    emailTriggers: ['SIV'],
  },
  {
    id: 'pitch',
    label: 'Pitch to Client',
    shortLabel: 'Pitch',
    icon: Presentation,
    color: 'bg-fuchsia-500',
    textColor: 'text-fuchsia-600 dark:text-fuchsia-400',
    description: 'Candidate profile is presented to the client for consideration.',
    automations: [],
    outputs: [
      { id: 'o12', label: 'Share Candidate Profile', description: 'Send profile document to client contact', type: 'manual', icon: Send },
      { id: 'o13', label: 'Schedule Introduction', description: 'Arrange initial call between candidate and client', type: 'manual', icon: Calendar },
      { id: 'o14', label: 'Move to Client Interview', description: 'Client interested — proceed to formal interview', type: 'manual', icon: Zap },
    ],
    emailTriggers: ['Pitch'],
  },
  {
    id: 'client-interview',
    label: 'Client Interview',
    icon: Users,
    color: 'bg-orange-500',
    textColor: 'text-orange-600 dark:text-orange-400',
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
    textColor: 'text-emerald-600 dark:text-emerald-400',
    description: 'Candidate is hired — contractor assignment created and enters post-hire pipeline.',
    automations: [
      { id: 'h1', label: 'Assignment Dialog', description: 'Popup captures client, rate, start date, hours/week, timesheet link', type: 'system', icon: ClipboardCheck },
      { id: 'h2', label: 'Create Contractor Record', description: 'Contractor assignment record created in database', type: 'system', icon: UserCheck },
      { id: 'h3', label: 'Enter Post-Hire Pipeline', description: 'Auto-placed in Onboarding stage of post-hire milestone tracker', type: 'system', icon: Target },
    ],
    outputs: [
      { id: 'o19', label: 'Trigger Post-Hire Flow', description: 'Starts milestone-based tracking', type: 'trigger', icon: Zap },
    ],
    emailTriggers: ['Hired'],
  },
  {
    id: 'post-hire',
    label: 'Post-Hire Pipeline',
    shortLabel: 'Post-Hire',
    icon: Target,
    color: 'bg-teal-500',
    textColor: 'text-teal-600 dark:text-teal-400',
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
    textColor: 'text-red-600 dark:text-red-400',
    description: 'Candidates who did not meet requirements.',
    automations: [
      { id: 'j1', label: 'Rejection Email', description: 'Automated rejection email with configurable delay (hours)', type: 'email', icon: Send },
      { id: 'j2', label: 'Status History Logged', description: 'Records the from to status transition with timestamp and admin', type: 'system', icon: ClipboardCheck },
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
    textColor: 'text-amber-600 dark:text-amber-400',
    description: 'Qualified candidates waiting for a suitable placement.',
    automations: [
      { id: 'k1', label: 'Availability Check Email', description: 'Magic-link email with Available / Not Available buttons', type: 'email', icon: Send },
      { id: 'k2', label: 'Response Tracking', description: 'Automatically records availability response and timestamp', type: 'system', icon: MousePointerClick },
      { id: 'k3', label: 'Status Badge Update', description: 'Shows green/red availability badge on applicant card', type: 'system', icon: CheckCircle },
    ],
    outputs: [
      { id: 'o22', label: 'Reprofile', description: 'Move to a different role when opportunity arises', type: 'manual', icon: RotateCw },
      { id: 'o23', label: 'Re-enter Pipeline', description: 'Move back to active pipeline for matching role', type: 'manual', icon: Zap },
    ],
    emailTriggers: ['Bench'],
  },
  {
    id: 'talent-pool',
    label: 'Talent Pool',
    icon: Target,
    color: 'bg-indigo-500',
    textColor: 'text-indigo-600 dark:text-indigo-400',
    description: 'General pool for candidates without a specific role.',
    automations: [
      { id: 'l1', label: 'Talent Scout AI Matching', description: 'AI matches pool candidates against open job descriptions — ranks by fit', type: 'ai', icon: Brain },
      { id: 'l2', label: 'Boolean Search', description: 'Advanced search with AND/OR/NOT operators across skills, tools, experience', type: 'system', icon: ScanSearch },
    ],
    outputs: [
      { id: 'o24', label: 'Reprofile to Job', description: 'Match found — move candidate to specific job pipeline', type: 'manual', icon: Zap },
      { id: 'o25', label: 'Send Opportunity Email', description: 'Notify candidate about matching opportunity', type: 'manual', icon: Send },
    ],
    emailTriggers: ['Talent Pool'],
  },
];

const MAIN_FLOW = ['application', 'ai-scoring', 'for-review', 'for-interview', 'ai-interview', 'siv', 'pitch', 'client-interview', 'hired', 'post-hire'];

interface BranchDef {
  from: string;
  to: string;
  label: string;
}

const BRANCHES: BranchDef[] = [
  { from: 'for-review', to: 'reject', label: 'Not qualified' },
  { from: 'for-review', to: 'talent-pool', label: 'No matching role' },
  { from: 'client-interview', to: 'bench', label: 'Wait' },
  { from: 'bench', to: 'for-review', label: 'Re-enter' },
  { from: 'talent-pool', to: 'for-review', label: 'Match found' },
  { from: 'reject', to: 'for-review', label: 'Reconsider' },
];

// ─── Diagram node component ────────────────────────────────────

const NODE_W = 160;
const NODE_H = 64;
const GAP_X = 40;
const GAP_Y = 100;
const COLS = 5;
const PAD = 40;

function getNodePosition(index: number) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return {
    x: PAD + col * (NODE_W + GAP_X),
    y: PAD + row * (NODE_H + GAP_Y),
  };
}

const DiagramNode = ({
  stage,
  x,
  y,
  isSelected,
  onClick,
}: {
  stage: StageDefinition;
  x: number;
  y: number;
  isSelected: boolean;
  onClick: () => void;
}) => {
  const Icon = stage.icon;
  const autoCount = stage.automations.length;
  return (
    <g onClick={onClick} className="cursor-pointer" role="button" tabIndex={0}>
      {/* Shadow */}
      <rect
        x={x + 2}
        y={y + 2}
        width={NODE_W}
        height={NODE_H}
        rx={12}
        className="fill-muted-foreground/10"
      />
      {/* Card */}
      <rect
        x={x}
        y={y}
        width={NODE_W}
        height={NODE_H}
        rx={12}
        className={`fill-card stroke-2 transition-all ${isSelected ? 'stroke-primary' : 'stroke-border hover:stroke-primary/40'}`}
      />
      {/* Color bar at top */}
      <rect
        x={x}
        y={y}
        width={NODE_W}
        height={6}
        rx={0}
        className={stage.color}
        clipPath={`inset(0 0 0 0 round 12px 12px 0 0)`}
      />
      <clipPath id={`top-${stage.id}`}>
        <rect x={x} y={y} width={NODE_W} height={12} rx={12} />
      </clipPath>
      <rect
        x={x}
        y={y}
        width={NODE_W}
        height={6}
        className={stage.color}
        clipPath={`url(#top-${stage.id})`}
      />
      {/* Icon circle */}
      <circle
        cx={x + 28}
        cy={y + NODE_H / 2 + 4}
        r={14}
        className={stage.color}
      />
      <foreignObject x={x + 16} y={y + NODE_H / 2 - 8} width={24} height={24}>
        <div className="flex items-center justify-center w-full h-full">
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
      </foreignObject>
      {/* Label */}
      <foreignObject x={x + 48} y={y + 12} width={NODE_W - 56} height={NODE_H - 16}>
        <div className="flex flex-col justify-center h-full">
          <p className="text-[11px] font-bold text-foreground leading-tight line-clamp-2">
            {stage.shortLabel || stage.label}
          </p>
          {autoCount > 0 && (
            <p className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-0.5">
              <span>⚡</span> {autoCount} automation{autoCount > 1 ? 's' : ''}
            </p>
          )}
        </div>
      </foreignObject>
    </g>
  );
};

// ─── SVG connection arrows ──────────────────────────────────────

const ConnectorArrow = ({
  x1, y1, x2, y2, dashed, label,
}: {
  x1: number; y1: number; x2: number; y2: number; dashed?: boolean; label?: string;
}) => {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;

  let path: string;
  if (Math.abs(dy) < 10) {
    // Horizontal
    path = `M ${x1} ${y1} L ${x2} ${y2}`;
  } else if (Math.abs(dx) < 10) {
    // Vertical
    path = `M ${x1} ${y1} L ${x2} ${y2}`;
  } else {
    // Curved
    path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
  }

  return (
    <g>
      <path
        d={path}
        fill="none"
        className={dashed ? 'stroke-muted-foreground/30' : 'stroke-muted-foreground/40'}
        strokeWidth={dashed ? 1.5 : 2}
        strokeDasharray={dashed ? '6 4' : undefined}
        markerEnd="url(#arrowhead)"
      />
      {label && (
        <>
          <rect
            x={midX - 30}
            y={midY - 8}
            width={60}
            height={16}
            rx={4}
            className="fill-background stroke-border"
            strokeWidth={0.5}
          />
          <text
            x={midX}
            y={midY + 4}
            textAnchor="middle"
            className="fill-muted-foreground text-[8px] font-medium"
          >
            {label}
          </text>
        </>
      )}
    </g>
  );
};

// ─── Detail panel ───────────────────────────────────────────────

const AutomationMiniNode = ({ node }: { node: AutomationNode }) => {
  const styles = TYPE_STYLES[node.type];
  const Icon = node.icon;
  return (
    <div className={`flex items-start gap-2.5 p-2.5 rounded-lg border ${styles.border} ${styles.bg} transition-all hover:shadow-sm`}>
      <div className={`w-7 h-7 rounded-md ${styles.iconBg} flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-foreground leading-tight">{node.label}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{node.description}</p>
      </div>
    </div>
  );
};

const MiniConnector = () => (
  <div className="flex justify-center py-0.5">
    <div className="w-0.5 h-2.5 bg-muted-foreground/20 rounded-full" />
  </div>
);

const StageDetailPanel = ({
  stage,
  templates,
  onClose,
}: {
  stage: StageDefinition;
  templates: EmailTemplate[];
  onClose: () => void;
}) => {
  const Icon = stage.icon;
  const matchedTemplates = templates.filter(t =>
    stage.emailTriggers.some(tr => t.status_trigger.toLowerCase() === tr.toLowerCase())
  );

  return (
    <div className={`rounded-xl border-2 ${stage.color.replace('bg-', 'border-')} bg-card shadow-xl animate-fade-in`}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <div className={`w-10 h-10 rounded-xl ${stage.color} flex items-center justify-center shadow`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-foreground">{stage.label}</h3>
          <p className="text-xs text-muted-foreground">{stage.description}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted transition-colors">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Content in 3 columns */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Automations */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-5 h-5 rounded bg-amber-500/10 flex items-center justify-center">
              <Zap className="w-3 h-3 text-amber-500" />
            </div>
            <span className="text-xs font-bold text-foreground uppercase tracking-wider">Automations</span>
          </div>
          {stage.automations.length > 0 ? (
            stage.automations.map((auto, i) => (
              <div key={auto.id}>
                <AutomationMiniNode node={auto} />
                {i < stage.automations.length - 1 && <MiniConnector />}
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground italic p-2">Manual stage — no automations</p>
          )}
        </div>

        {/* Email templates */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-5 h-5 rounded bg-blue-500/10 flex items-center justify-center">
              <Mail className="w-3 h-3 text-blue-500" />
            </div>
            <span className="text-xs font-bold text-foreground uppercase tracking-wider">Email Templates</span>
          </div>
          {matchedTemplates.length > 0 ? (
            matchedTemplates.map((tpl, i) => (
              <div key={tpl.id}>
                <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-blue-500/20 bg-blue-500/5">
                  <div className="w-7 h-7 rounded-md bg-blue-500 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-semibold text-foreground leading-tight truncate">{tpl.name || tpl.subject}</p>
                      <Badge variant={tpl.is_enabled ? 'default' : 'secondary'} className="text-[9px] px-1.5 py-0">
                        {tpl.is_enabled ? 'Active' : 'Off'}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{tpl.subject}</p>
                    {tpl.delay_hours != null && tpl.delay_hours > 0 && (
                      <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-0.5">
                        <Clock className="w-2.5 h-2.5" /> {tpl.delay_hours}h delay
                      </p>
                    )}
                  </div>
                </div>
                {i < matchedTemplates.length - 1 && <MiniConnector />}
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground italic p-2">No email templates</p>
          )}
        </div>

        {/* Outputs */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-5 h-5 rounded bg-emerald-500/10 flex items-center justify-center">
              <Zap className="w-3 h-3 text-emerald-500" />
            </div>
            <span className="text-xs font-bold text-foreground uppercase tracking-wider">Outputs</span>
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
  );
};

// ─── Main component ─────────────────────────────────────────────

export const WorkflowBoard = () => {
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
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

  // Compute positions for main flow nodes
  const mainPositions = new Map<string, { x: number; y: number }>();
  MAIN_FLOW.forEach((id, i) => {
    mainPositions.set(id, getNodePosition(i));
  });

  // Branch nodes positioned below
  const branchIds = ['reject', 'bench', 'talent-pool'];
  const branchRow = Math.ceil(MAIN_FLOW.length / COLS);
  const branchPositions = new Map<string, { x: number; y: number }>();
  branchIds.forEach((id, i) => {
    branchPositions.set(id, {
      x: PAD + (i + 1) * (NODE_W + GAP_X),
      y: PAD + branchRow * (NODE_H + GAP_Y) + 30,
    });
  });

  const allPositions = new Map([...mainPositions, ...branchPositions]);

  const totalRows = branchRow + 1;
  const svgWidth = PAD * 2 + COLS * NODE_W + (COLS - 1) * GAP_X;
  const svgHeight = PAD * 2 + totalRows * NODE_H + totalRows * GAP_Y + 30;

  const selectedStageDef = selectedStage ? STAGES.find(s => s.id === selectedStage) : null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Recruitment Workflow</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Click any stage node to see its automations, email triggers, and outputs.
        </p>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap">
        {[
          { label: 'AI Powered', ...TYPE_STYLES.ai },
          { label: 'Email', ...TYPE_STYLES.email },
          { label: 'System', ...TYPE_STYLES.system },
          { label: 'Manual', ...TYPE_STYLES.manual },
          { label: 'Trigger', ...TYPE_STYLES.trigger },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <div className={`w-3 h-3 rounded ${item.iconBg}`} />
            {item.label}
          </div>
        ))}
      </div>

      {/* SVG Diagram */}
      <div className="bg-muted/20 rounded-xl border overflow-x-auto">
        <svg width={svgWidth} height={svgHeight} className="min-w-[800px]">
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="6"
              refX="7"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" className="fill-muted-foreground/40" />
            </marker>
          </defs>

          {/* Main flow connectors */}
          {MAIN_FLOW.map((id, i) => {
            if (i >= MAIN_FLOW.length - 1) return null;
            const from = mainPositions.get(id)!;
            const to = mainPositions.get(MAIN_FLOW[i + 1])!;

            const fromCol = i % COLS;
            const toCol = (i + 1) % COLS;

            // Same row: horizontal arrow
            if (Math.floor(i / COLS) === Math.floor((i + 1) / COLS)) {
              return (
                <ConnectorArrow
                  key={`main-${i}`}
                  x1={from.x + NODE_W}
                  y1={from.y + NODE_H / 2}
                  x2={to.x}
                  y2={to.y + NODE_H / 2}
                />
              );
            }
            // Row wrap: go down from last col to first col of next row
            return (
              <ConnectorArrow
                key={`main-${i}`}
                x1={from.x + NODE_W / 2}
                y1={from.y + NODE_H}
                x2={to.x + NODE_W / 2}
                y2={to.y}
              />
            );
          })}

          {/* Branch connectors */}
          {BRANCHES.map((branch, i) => {
            const fromPos = allPositions.get(branch.from);
            const toPos = allPositions.get(branch.to);
            if (!fromPos || !toPos) return null;

            const fromIsMain = MAIN_FLOW.includes(branch.from);
            const toIsMain = MAIN_FLOW.includes(branch.to);

            let x1, y1, x2, y2;
            if (fromIsMain && !toIsMain) {
              // Main to branch: go down
              x1 = fromPos.x + NODE_W / 2;
              y1 = fromPos.y + NODE_H;
              x2 = toPos.x + NODE_W / 2;
              y2 = toPos.y;
            } else if (!fromIsMain && toIsMain) {
              // Branch back to main: go up
              x1 = toPos.x + NODE_W / 2;
              y1 = toPos.y + NODE_H;
              x2 = fromPos.x + NODE_W / 2;
              y2 = fromPos.y;
              // Swap: draw from branch to main
              [x1, y1, x2, y2] = [fromPos.x + NODE_W / 2, fromPos.y, toPos.x + NODE_W / 2, toPos.y + NODE_H];
            } else {
              x1 = fromPos.x + NODE_W;
              y1 = fromPos.y + NODE_H / 2;
              x2 = toPos.x;
              y2 = toPos.y + NODE_H / 2;
            }

            return (
              <ConnectorArrow
                key={`branch-${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                dashed
                label={branch.label}
              />
            );
          })}

          {/* Branch label */}
          <text
            x={PAD + 10}
            y={PAD + branchRow * (NODE_H + GAP_Y) + 20}
            className="fill-muted-foreground text-[10px] font-bold uppercase"
          >
            Branches
          </text>

          {/* Main flow nodes */}
          {MAIN_FLOW.map(id => {
            const stage = STAGES.find(s => s.id === id)!;
            const pos = mainPositions.get(id)!;
            return (
              <DiagramNode
                key={id}
                stage={stage}
                x={pos.x}
                y={pos.y}
                isSelected={selectedStage === id}
                onClick={() => setSelectedStage(selectedStage === id ? null : id)}
              />
            );
          })}

          {/* Branch nodes */}
          {branchIds.map(id => {
            const stage = STAGES.find(s => s.id === id)!;
            const pos = branchPositions.get(id)!;
            return (
              <DiagramNode
                key={id}
                stage={stage}
                x={pos.x}
                y={pos.y}
                isSelected={selectedStage === id}
                onClick={() => setSelectedStage(selectedStage === id ? null : id)}
              />
            );
          })}
        </svg>
      </div>

      {/* Detail panel for selected stage */}
      {selectedStageDef && (
        <StageDetailPanel
          stage={selectedStageDef}
          templates={emailTemplates}
          onClose={() => setSelectedStage(null)}
        />
      )}
    </div>
  );
};
