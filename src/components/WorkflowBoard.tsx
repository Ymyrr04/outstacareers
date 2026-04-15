import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import {
  FileText, Search, MessageCircle, Users, CheckCircle,
  Mail, Zap, Clock, Bot, AlertTriangle, Target, Presentation,
  Eye, Fingerprint, Upload, Brain,
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
  description: string;
  automations: AutomationNode[];
  outputs: AutomationNode[];
  emailTriggers: string[];
}

// ─── Colors ─────────────────────────────────────────────────────

const TYPE_COLORS: Record<AutomationType, { fill: string; stroke: string; iconBg: string }> = {
  ai:      { fill: 'fill-violet-500/8',  stroke: 'stroke-violet-500/30', iconBg: 'bg-violet-500' },
  email:   { fill: 'fill-blue-500/8',    stroke: 'stroke-blue-500/30',   iconBg: 'bg-blue-500' },
  system:  { fill: 'fill-amber-500/8',   stroke: 'stroke-amber-500/30',  iconBg: 'bg-amber-500' },
  manual:  { fill: 'fill-emerald-500/8', stroke: 'stroke-emerald-500/30',iconBg: 'bg-emerald-500' },
  trigger: { fill: 'fill-rose-500/8',    stroke: 'stroke-rose-500/30',   iconBg: 'bg-rose-500' },
};

// ─── Stage definitions ──────────────────────────────────────────

const STAGES: StageDefinition[] = [
  {
    id: 'application', label: 'Application Submitted', shortLabel: 'Application', icon: FileText,
    color: 'bg-blue-500', description: 'Candidate submits application via job page or talent pool form.',
    automations: [
      { id: 'a1', label: 'Pre-screening Validation', description: 'Validates all required fields, checks honeypot for spam bots', type: 'system', icon: Shield },
      { id: 'a2', label: 'CV Upload to Storage', description: 'PDF file uploaded to secure cloud storage bucket', type: 'system', icon: Upload },
      { id: 'a3', label: 'Duplicate Detection', description: 'Checks email & phone against existing applicants', type: 'system', icon: Fingerprint },
      { id: 'a4', label: 'Source Tracking', description: 'Records application source (job board, referral, talent pool)', type: 'system', icon: Link2 },
    ],
    outputs: [{ id: 'o1', label: 'Trigger AI Scoring', description: 'Passes CV to AI scoring pipeline', type: 'trigger', icon: Zap }],
    emailTriggers: [],
  },
  {
    id: 'ai-scoring', label: 'AI CV Scoring', icon: Brain,
    color: 'bg-violet-500', description: 'AI analyzes and scores CV against job requirements.',
    automations: [
      { id: 'b1', label: 'CV Text Extraction', description: 'Vision API extracts text from PDF', type: 'ai', icon: Eye },
      { id: 'b2', label: 'Role Experience Score', description: 'Evaluates experience relevance', type: 'ai', icon: Brain },
      { id: 'b3', label: 'Skills & Tools Score', description: 'Matches skills against requirements', type: 'ai', icon: ScanSearch },
      { id: 'b4', label: 'Setup Score', description: 'Timezone, internet, equipment check', type: 'ai', icon: CheckCircle },
      { id: 'b5', label: 'Red Flag Detection', description: 'Short tenures, gaps, mismatches', type: 'ai', icon: AlertTriangle },
      { id: 'b6', label: 'Total Score (0-100)', description: 'Weighted total from all categories', type: 'system', icon: ClipboardCheck },
    ],
    outputs: [{ id: 'o2', label: 'Move to For Review', description: 'Appears in dashboard with score', type: 'trigger', icon: Zap }],
    emailTriggers: [],
  },
  {
    id: 'for-review', label: 'For Review', icon: Search,
    color: 'bg-cyan-500', description: 'Admins review AI-scored applications.',
    automations: [
      { id: 'c1', label: 'New Applicant Badge', description: 'Unviewed applicants show badge', type: 'system', icon: Bell },
      { id: 'c2', label: 'Details Viewed Tracking', description: 'Records first open timestamp', type: 'system', icon: Eye },
    ],
    outputs: [
      { id: 'o3', label: 'Star Candidate', description: 'Flag for quick filtering', type: 'manual', icon: Star },
      { id: 'o4', label: 'To Interview', description: 'Approve for interview', type: 'manual', icon: Zap },
      { id: 'o5', label: 'To Reject', description: 'Not qualified', type: 'manual', icon: AlertTriangle },
      { id: 'o6', label: 'To Talent Pool', description: 'No matching role', type: 'manual', icon: Target },
    ],
    emailTriggers: ['For Review'],
  },
  {
    id: 'for-interview', label: 'For Interview', icon: MessageCircle,
    color: 'bg-purple-500', description: 'AI-powered interview invite sent.',
    automations: [
      { id: 'd1', label: 'Interview Invite Email', description: 'Auto email with unique interview link', type: 'email', icon: Send },
      { id: 'd2', label: 'AI Question Generation', description: 'MCQ + text + voice questions', type: 'ai', icon: Brain },
      { id: 'd3', label: '20-min Reminder', description: 'Reminder if not started', type: 'email', icon: Clock },
      { id: 'd4', label: '2-hour Reminder', description: 'Second reminder email', type: 'email', icon: Clock },
    ],
    outputs: [{ id: 'o7', label: 'Start Interview', description: 'Candidate begins answering', type: 'trigger', icon: Zap }],
    emailTriggers: ['For Interview'],
  },
  {
    id: 'ai-interview', label: 'AI Interview', icon: Bot,
    color: 'bg-violet-500', description: 'AI processes and scores interview responses.',
    automations: [
      { id: 'e1', label: 'Paste Detection', description: 'Flags pasted content', type: 'system', icon: Shield },
      { id: 'e2', label: 'Voice Recording', description: 'Stores voice answers', type: 'system', icon: Mic },
      { id: 'e3', label: 'AI 5-Dim Scoring', description: 'Technical, experience, communication, situational, personality', type: 'ai', icon: Brain },
      { id: 'e4', label: 'Strengths & Concerns', description: 'AI summary generation', type: 'ai', icon: ClipboardCheck },
      { id: 'e5', label: 'Admin Notification', description: 'Email when interview complete', type: 'email', icon: Bell },
    ],
    outputs: [{ id: 'o8', label: 'Move to SIV', description: 'Ready for vetting', type: 'trigger', icon: Zap }],
    emailTriggers: [],
  },
  {
    id: 'siv', label: 'SIV', icon: Search,
    color: 'bg-cyan-500', description: 'Internal vetting — review interview results.',
    automations: [
      { id: 'f1', label: 'Score Dashboard', description: 'Scores and category breakdown', type: 'system', icon: ClipboardCheck },
      { id: 'f2', label: 'AI Summary', description: 'Concise candidate summary', type: 'ai', icon: Brain },
    ],
    outputs: [
      { id: 'o9', label: 'Build Profile', description: 'Client-facing document', type: 'manual', icon: FileText },
      { id: 'o10', label: 'Add Notes', description: 'Timestamped notes', type: 'manual', icon: ClipboardCheck },
      { id: 'o11', label: 'To Pitch', description: 'Approved for client', type: 'manual', icon: Zap },
    ],
    emailTriggers: ['SIV'],
  },
  {
    id: 'pitch', label: 'Pitch', icon: Presentation,
    color: 'bg-fuchsia-500', description: 'Present candidate profile to client.',
    automations: [],
    outputs: [
      { id: 'o12', label: 'Share Profile', description: 'Send to client', type: 'manual', icon: Send },
      { id: 'o13', label: 'Schedule Intro', description: 'Arrange call', type: 'manual', icon: Calendar },
      { id: 'o14', label: 'To Client Interview', description: 'Client interested', type: 'manual', icon: Zap },
    ],
    emailTriggers: ['Pitch'],
  },
  {
    id: 'client-interview', label: 'Client Interview', icon: Users,
    color: 'bg-orange-500', description: 'Candidate interviews with client.',
    automations: [
      { id: 'g1', label: 'Calendly Scheduling', description: 'Integrated booking', type: 'system', icon: Calendar },
    ],
    outputs: [
      { id: 'o15', label: 'Prep Email', description: 'Send prep details', type: 'manual', icon: Send },
      { id: 'o16', label: 'Client Feedback', description: 'Record decision', type: 'manual', icon: ClipboardCheck },
      { id: 'o17', label: 'To Hired', description: 'Approved', type: 'manual', icon: CheckCircle },
      { id: 'o18', label: 'To Bench', description: 'Wait', type: 'manual', icon: Clock },
    ],
    emailTriggers: ['Client Interview'],
  },
  {
    id: 'hired', label: 'Hired', icon: CheckCircle,
    color: 'bg-emerald-500', description: 'Assignment created, enters post-hire pipeline.',
    automations: [
      { id: 'h1', label: 'Assignment Dialog', description: 'Rate, dates, hours, timesheet', type: 'system', icon: ClipboardCheck },
      { id: 'h2', label: 'Create Contractor', description: 'Record in database', type: 'system', icon: UserCheck },
      { id: 'h3', label: 'Enter Post-Hire', description: 'Auto-place in Onboarding', type: 'system', icon: Target },
    ],
    outputs: [{ id: 'o19', label: 'Post-Hire Flow', description: 'Milestone tracking', type: 'trigger', icon: Zap }],
    emailTriggers: ['Hired'],
  },
  {
    id: 'post-hire', label: 'Post-Hire', icon: Target,
    color: 'bg-teal-500', description: 'Milestone tracking: onboarding to settled (120 days).',
    automations: [
      { id: 'i1', label: 'Auto-Advance', description: 'Daily cron moves stages', type: 'system', icon: RotateCw },
      { id: 'i2', label: 'Client Check-in', description: 'Milestone email to client', type: 'email', icon: Send },
      { id: 'i3', label: 'Contractor Email', description: 'Welcome/onboarding email', type: 'email', icon: Mail },
      { id: 'i4', label: 'Stage Templates', description: 'Configurable per milestone', type: 'email', icon: FileText },
    ],
    outputs: [{ id: 'o20', label: 'Settled', description: '120-day milestone complete', type: 'trigger', icon: CheckCircle }],
    emailTriggers: [],
  },
  {
    id: 'reject', label: 'Reject', icon: AlertTriangle,
    color: 'bg-red-500', description: 'Not qualified candidates.',
    automations: [
      { id: 'j1', label: 'Rejection Email', description: 'Configurable delay', type: 'email', icon: Send },
      { id: 'j2', label: 'Status History', description: 'Audit trail logged', type: 'system', icon: ClipboardCheck },
    ],
    outputs: [{ id: 'o21', label: 'Reconsider', description: 'Move back to pipeline', type: 'manual', icon: RotateCw }],
    emailTriggers: ['Reject', 'Rejected'],
  },
  {
    id: 'bench', label: 'Bench', icon: Clock,
    color: 'bg-amber-500', description: 'Qualified, waiting for placement.',
    automations: [
      { id: 'k1', label: 'Availability Email', description: 'Magic-link buttons', type: 'email', icon: Send },
      { id: 'k2', label: 'Response Tracking', description: 'Auto-records response', type: 'system', icon: MousePointerClick },
      { id: 'k3', label: 'Status Badge', description: 'Green/red availability', type: 'system', icon: CheckCircle },
    ],
    outputs: [
      { id: 'o22', label: 'Reprofile', description: 'Different role', type: 'manual', icon: RotateCw },
      { id: 'o23', label: 'Re-enter', description: 'Back to pipeline', type: 'manual', icon: Zap },
    ],
    emailTriggers: ['Bench'],
  },
  {
    id: 'talent-pool', label: 'Talent Pool', icon: Target,
    color: 'bg-indigo-500', description: 'General pool, no specific role.',
    automations: [
      { id: 'l1', label: 'AI Matching', description: 'Rank by job fit', type: 'ai', icon: Brain },
      { id: 'l2', label: 'Boolean Search', description: 'AND/OR/NOT operators', type: 'system', icon: ScanSearch },
    ],
    outputs: [
      { id: 'o24', label: 'Reprofile to Job', description: 'Match found', type: 'manual', icon: Zap },
      { id: 'o25', label: 'Send Opportunity', description: 'Notify candidate', type: 'manual', icon: Send },
    ],
    emailTriggers: ['Talent Pool'],
  },
];

const MAIN_FLOW = ['application', 'ai-scoring', 'for-review', 'for-interview', 'ai-interview', 'siv', 'pitch', 'client-interview', 'hired', 'post-hire'];
const BRANCH_IDS = ['reject', 'bench', 'talent-pool'];

interface BranchDef { from: string; to: string; label: string; }
const BRANCHES: BranchDef[] = [
  { from: 'for-review', to: 'reject', label: 'Not qualified' },
  { from: 'for-review', to: 'talent-pool', label: 'No role' },
  { from: 'client-interview', to: 'bench', label: 'Wait' },
  { from: 'bench', to: 'for-review', label: 'Re-enter' },
  { from: 'talent-pool', to: 'for-review', label: 'Match' },
  { from: 'reject', to: 'for-review', label: 'Reconsider' },
];

// ─── Layout constants ───────────────────────────────────────────

const NODE_W = 180;
const NODE_H = 56;
const AUTO_NODE_H = 32;
const AUTO_GAP = 4;
const CONNECTOR_GAP = 12;
const COL_GAP = 50;
const ROW_GAP = 50;
const COLS = 5;
const PAD = 30;

function getStage(id: string) {
  return STAGES.find(s => s.id === id)!;
}

function getColumnHeight(stageId: string) {
  const stage = getStage(stageId);
  const autoCount = stage.automations.length;
  if (autoCount === 0) return NODE_H;
  return NODE_H + CONNECTOR_GAP + autoCount * AUTO_NODE_H + (autoCount - 1) * AUTO_GAP;
}

function getRowMaxHeight(ids: string[]) {
  let max = 0;
  for (const id of ids) {
    max = Math.max(max, getColumnHeight(id));
  }
  return max;
}

// ─── Sub-components ─────────────────────────────────────────────

const AutoNodeFO = ({
  node, x, y, w,
}: {
  node: AutomationNode; x: number; y: number; w: number;
}) => {
  const colors = TYPE_COLORS[node.type];
  const Icon = node.icon;
  return (
    <TooltipTrigger asChild>
      <g>
        <rect x={x} y={y} width={w} height={AUTO_NODE_H} rx={6}
          className={`${colors.fill} ${colors.stroke}`} strokeWidth={1} />
        <foreignObject x={x} y={y} width={w} height={AUTO_NODE_H}>
          <div className="flex items-center gap-2 px-2 h-full">
            <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${colors.iconBg}`}>
              <Icon className="w-3 h-3 text-white" />
            </div>
            <span className="text-[10px] font-medium text-foreground truncate leading-tight">{node.label}</span>
          </div>
        </foreignObject>
      </g>
    </TooltipTrigger>
  );
};

const StageGroup = ({
  stage, x, y, isSelected, onClick,
}: {
  stage: StageDefinition; x: number; y: number; isSelected: boolean; onClick: () => void;
}) => {
  const Icon = stage.icon;
  const autos = stage.automations;

  return (
    <g>
      {/* Main node */}
      <g onClick={onClick} className="cursor-pointer">
        <rect x={x + 1} y={y + 1} width={NODE_W} height={NODE_H} rx={10}
          className="fill-muted-foreground/5" />
        <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={10}
          className={`fill-card stroke-[1.5] transition-all ${isSelected ? 'stroke-primary' : 'stroke-border'}`} />
        {/* Top color bar */}
        <clipPath id={`bar-${stage.id}`}>
          <rect x={x} y={y} width={NODE_W} height={10} rx={10} />
        </clipPath>
        <rect x={x} y={y} width={NODE_W} height={5} className={stage.color}
          clipPath={`url(#bar-${stage.id})`} />
        {/* Icon */}
        <circle cx={x + 24} cy={y + NODE_H / 2 + 3} r={13} className={stage.color} />
        <foreignObject x={x + 13} y={y + NODE_H / 2 - 8} width={22} height={22}>
          <div className="flex items-center justify-center w-full h-full">
            <Icon className="w-3 h-3 text-white" />
          </div>
        </foreignObject>
        {/* Label */}
        <foreignObject x={x + 44} y={y + 10} width={NODE_W - 52} height={NODE_H - 14}>
          <div className="flex flex-col justify-center h-full">
            <p className="text-[11px] font-bold text-foreground leading-tight truncate">
              {stage.shortLabel || stage.label}
            </p>
            <p className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-0.5">
              <span className="text-amber-500">⚡</span>{autos.length} automation{autos.length !== 1 ? 's' : ''}
            </p>
          </div>
        </foreignObject>
      </g>

      {/* Automation sub-nodes */}
      {autos.length > 0 && (
        <>
          {/* Vertical connector from main node to first auto */}
          <line
            x1={x + NODE_W / 2} y1={y + NODE_H}
            x2={x + NODE_W / 2} y2={y + NODE_H + CONNECTOR_GAP}
            className="stroke-muted-foreground/20" strokeWidth={1.5} strokeDasharray="3 3"
          />
          {autos.map((auto, i) => {
            const autoY = y + NODE_H + CONNECTOR_GAP + i * (AUTO_NODE_H + AUTO_GAP);
            return (
              <Tooltip key={auto.id}>
                <AutoNodeFO node={auto} x={x} y={autoY} w={NODE_W} />
                <TooltipContent side="right" className="max-w-[220px]">
                  <p className="text-xs font-semibold">{auto.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{auto.description}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
          {/* Connectors between auto nodes */}
          {autos.slice(0, -1).map((_, i) => {
            const fromY = y + NODE_H + CONNECTOR_GAP + i * (AUTO_NODE_H + AUTO_GAP) + AUTO_NODE_H;
            const toY = fromY + AUTO_GAP;
            return (
              <line key={`conn-${i}`}
                x1={x + NODE_W / 2} y1={fromY}
                x2={x + NODE_W / 2} y2={toY}
                className="stroke-muted-foreground/15" strokeWidth={1}
              />
            );
          })}
        </>
      )}
    </g>
  );
};

// ─── Main component ─────────────────────────────────────────────

export const WorkflowBoard = () => {
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);

  useEffect(() => {
    supabase
      .from('email_templates')
      .select('id, name, subject, status_trigger, is_enabled, delay_hours')
      .order('template_order', { ascending: true })
      .then(({ data }) => { if (data) setEmailTemplates(data as EmailTemplate[]); });
  }, []);

  // Compute layout
  const row1Ids = MAIN_FLOW.slice(0, COLS);
  const row2Ids = MAIN_FLOW.slice(COLS);
  const row1MaxH = getRowMaxHeight(row1Ids);
  const row2MaxH = getRowMaxHeight(row2Ids);

  const positions = new Map<string, { x: number; y: number }>();
  row1Ids.forEach((id, i) => {
    positions.set(id, { x: PAD + i * (NODE_W + COL_GAP), y: PAD });
  });
  const row2Y = PAD + row1MaxH + ROW_GAP;
  row2Ids.forEach((id, i) => {
    positions.set(id, { x: PAD + i * (NODE_W + COL_GAP), y: row2Y });
  });

  const branchY = row2Y + row2MaxH + ROW_GAP + 20;
  BRANCH_IDS.forEach((id, i) => {
    positions.set(id, { x: PAD + (i + 1) * (NODE_W + COL_GAP), y: branchY });
  });
  const branchMaxH = getRowMaxHeight(BRANCH_IDS);

  const svgW = PAD * 2 + COLS * NODE_W + (COLS - 1) * COL_GAP;
  const svgH = branchY + branchMaxH + PAD + 20;

  const selectedStageDef = selectedStage ? getStage(selectedStage) : null;
  const matchedTemplates = selectedStageDef
    ? emailTemplates.filter(t => selectedStageDef.emailTriggers.some(tr => t.status_trigger.toLowerCase() === tr.toLowerCase()))
    : [];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Recruitment Workflow</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Hover automation nodes for details. Click a stage to see email templates and outputs.
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 flex-wrap text-[10px] text-muted-foreground">
          {([
            ['AI', 'bg-violet-500'], ['Email', 'bg-blue-500'], ['System', 'bg-amber-500'],
            ['Manual', 'bg-emerald-500'], ['Trigger', 'bg-rose-500'],
          ] as const).map(([label, bg]) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded ${bg}`} />
              {label}
            </div>
          ))}
        </div>

        {/* SVG Diagram */}
        <div className="bg-muted/20 rounded-xl border overflow-x-auto">
          <svg width={svgW} height={svgH} className="min-w-[900px]">
            <defs>
              <marker id="ah" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" className="fill-muted-foreground/40" />
              </marker>
              <marker id="ah-d" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" className="fill-muted-foreground/25" />
              </marker>
            </defs>

            {/* Main flow connectors — row 1 horizontal */}
            {row1Ids.map((id, i) => {
              if (i >= row1Ids.length - 1) return null;
              const from = positions.get(id)!;
              const to = positions.get(row1Ids[i + 1])!;
              return (
                <line key={`r1-${i}`}
                  x1={from.x + NODE_W} y1={from.y + NODE_H / 2}
                  x2={to.x} y2={to.y + NODE_H / 2}
                  className="stroke-muted-foreground/40" strokeWidth={2} markerEnd="url(#ah)"
                />
              );
            })}

            {/* Row 1 last → Row 2 first */}
            {row2Ids.length > 0 && (
              <path
                d={`M ${positions.get(row1Ids[row1Ids.length - 1])!.x + NODE_W / 2} ${positions.get(row1Ids[row1Ids.length - 1])!.y + NODE_H}
                    C ${positions.get(row1Ids[row1Ids.length - 1])!.x + NODE_W / 2} ${row2Y - 10},
                      ${positions.get(row2Ids[0])!.x + NODE_W / 2} ${row2Y - 10},
                      ${positions.get(row2Ids[0])!.x + NODE_W / 2} ${row2Y}`}
                fill="none" className="stroke-muted-foreground/40" strokeWidth={2} markerEnd="url(#ah)"
              />
            )}

            {/* Row 2 horizontal */}
            {row2Ids.map((id, i) => {
              if (i >= row2Ids.length - 1) return null;
              const from = positions.get(id)!;
              const to = positions.get(row2Ids[i + 1])!;
              return (
                <line key={`r2-${i}`}
                  x1={from.x + NODE_W} y1={from.y + NODE_H / 2}
                  x2={to.x} y2={to.y + NODE_H / 2}
                  className="stroke-muted-foreground/40" strokeWidth={2} markerEnd="url(#ah)"
                />
              );
            })}

            {/* Branch connectors */}
            {BRANCHES.map((b, i) => {
              const fromPos = positions.get(b.from)!;
              const toPos = positions.get(b.to)!;
              const fromIsMain = MAIN_FLOW.includes(b.from);
              const toIsMain = MAIN_FLOW.includes(b.to);

              let d: string;
              if (fromIsMain && !toIsMain) {
                // Main → branch (down)
                const fx = fromPos.x + NODE_W / 2;
                const fy = fromPos.y + NODE_H;
                const tx = toPos.x + NODE_W / 2;
                const ty = toPos.y;
                d = `M ${fx} ${fy} C ${fx} ${(fy + ty) / 2}, ${tx} ${(fy + ty) / 2}, ${tx} ${ty}`;
              } else if (!fromIsMain && toIsMain) {
                // Branch → main (up)
                const fx = fromPos.x + NODE_W / 2;
                const fy = fromPos.y;
                const tx = toPos.x + NODE_W / 2;
                const ty = toPos.y + NODE_H;
                d = `M ${fx} ${fy} C ${fx} ${(fy + ty) / 2}, ${tx} ${(fy + ty) / 2}, ${tx} ${ty}`;
              } else {
                const fx = fromPos.x + NODE_W;
                const fy = fromPos.y + NODE_H / 2;
                const tx = toPos.x;
                const ty = toPos.y + NODE_H / 2;
                d = `M ${fx} ${fy} L ${tx} ${ty}`;
              }

              const match = d.match(/M ([\d.]+) ([\d.]+)/);
              const endMatch = d.match(/([\d.]+) ([\d.]+)$/);
              const midX = match && endMatch ? (parseFloat(match[1]) + parseFloat(endMatch[1])) / 2 : 0;
              const midY = match && endMatch ? (parseFloat(match[2]) + parseFloat(endMatch[2])) / 2 : 0;

              return (
                <g key={`br-${i}`}>
                  <path d={d} fill="none"
                    className="stroke-muted-foreground/25" strokeWidth={1.5}
                    strokeDasharray="6 4" markerEnd="url(#ah-d)"
                  />
                  <rect x={midX - 24} y={midY - 7} width={48} height={14} rx={3}
                    className="fill-background stroke-border" strokeWidth={0.5} />
                  <text x={midX} y={midY + 3} textAnchor="middle"
                    className="fill-muted-foreground text-[8px] font-medium">
                    {b.label}
                  </text>
                </g>
              );
            })}

            {/* BRANCHES label */}
            <text x={PAD + 10} y={branchY - 10}
              className="fill-muted-foreground text-[10px] font-bold uppercase tracking-wider">
              Branches
            </text>

            {/* Render all stage groups */}
            {[...MAIN_FLOW, ...BRANCH_IDS].map(id => {
              const stage = getStage(id);
              const pos = positions.get(id)!;
              return (
                <StageGroup
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

        {/* Detail panel for email templates & outputs */}
        {selectedStageDef && (
          <div className={`rounded-xl border-2 bg-card shadow-xl animate-fade-in ${selectedStageDef.color.replace('bg-', 'border-')}`}>
            <div className="flex items-center gap-3 p-4 border-b border-border">
              <div className={`w-9 h-9 rounded-xl ${selectedStageDef.color} flex items-center justify-center`}>
                <selectedStageDef.icon className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-foreground">{selectedStageDef.label}</h3>
                <p className="text-xs text-muted-foreground">{selectedStageDef.description}</p>
              </div>
              <button onClick={() => setSelectedStage(null)} className="p-1.5 rounded-md hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Email templates */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded bg-blue-500/10 flex items-center justify-center">
                    <Mail className="w-3 h-3 text-blue-500" />
                  </div>
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider">Email Templates</span>
                </div>
                {matchedTemplates.length > 0 ? (
                  <div className="space-y-2">
                    {matchedTemplates.map(tpl => (
                      <div key={tpl.id} className="flex items-center gap-2 p-2 rounded-lg border border-blue-500/20 bg-blue-500/5">
                        <div className="w-6 h-6 rounded bg-blue-500 flex items-center justify-center flex-shrink-0">
                          <Mail className="w-3 h-3 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{tpl.name || tpl.subject}</p>
                          {tpl.delay_hours != null && tpl.delay_hours > 0 && (
                            <p className="text-[10px] text-amber-600 flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" /> {tpl.delay_hours}h delay
                            </p>
                          )}
                        </div>
                        <Badge variant={tpl.is_enabled ? 'default' : 'secondary'} className="text-[9px] px-1.5 py-0">
                          {tpl.is_enabled ? 'Active' : 'Off'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No email templates for this stage</p>
                )}
              </div>
              {/* Outputs */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded bg-emerald-500/10 flex items-center justify-center">
                    <Zap className="w-3 h-3 text-emerald-500" />
                  </div>
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider">Outputs & Actions</span>
                </div>
                <div className="space-y-2">
                  {selectedStageDef.outputs.map(output => {
                    const colors = TYPE_COLORS[output.type];
                    const OIcon = output.icon;
                    return (
                      <div key={output.id} className={`flex items-center gap-2 p-2 rounded-lg border ${colors.stroke.replace('stroke-', 'border-')} ${colors.fill.replace('fill-', 'bg-')}`}>
                        <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${colors.iconBg}`}>
                          <OIcon className="w-3 h-3 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground">{output.label}</p>
                          <p className="text-[10px] text-muted-foreground">{output.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};
