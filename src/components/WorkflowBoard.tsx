import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import {
  FileText, Search, MessageCircle, Users, CheckCircle,
  Mail, Zap, Clock, Bot, AlertTriangle, Target, Presentation,
  ChevronDown, ChevronUp, ArrowRight
} from 'lucide-react';

interface EmailTemplate {
  id?: string;
  name: string;
  subject: string;
  status_trigger: string;
  is_enabled: boolean;
  delay_hours: number | null;
}

interface WorkflowNode {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;       // bg color for icon circle
  borderColor: string; // border highlight
  description: string;
  automations: string[];
  actions: string[];
  emailTriggers: string[]; // status_trigger values to match
}

interface WorkflowConnection {
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
}

const NODES: WorkflowNode[] = [
  {
    id: 'application',
    label: 'Application',
    icon: FileText,
    color: 'bg-blue-500',
    borderColor: 'border-blue-500',
    description: 'Candidate submits application via job page or talent pool form.',
    automations: ['Pre-screening form validation', 'CV file upload to storage', 'Honeypot spam detection'],
    actions: [],
    emailTriggers: [],
  },
  {
    id: 'ai-scoring',
    label: 'AI Scoring',
    icon: Bot,
    color: 'bg-violet-500',
    borderColor: 'border-violet-500',
    description: 'AI automatically scores CV against job requirements — role experience, skills/tools, availability, and red flags.',
    automations: ['CV text extraction (Vision API)', 'AI score calculation (4 categories)', 'Duplicate detection (email + phone)', 'Skills & tools extraction'],
    actions: [],
    emailTriggers: [],
  },
  {
    id: 'for-review',
    label: 'For Review',
    icon: Search,
    color: 'bg-cyan-500',
    borderColor: 'border-cyan-500',
    description: 'Admins review AI-scored applications, pre-screening answers, and CV quality.',
    automations: ['Application source tracking', 'New applicant badge notification'],
    actions: ['View AI score breakdown', 'Star promising candidates', 'Add notes', 'Move to next stage'],
    emailTriggers: ['For Review'],
  },
  {
    id: 'for-interview',
    label: 'For Interview',
    icon: MessageCircle,
    color: 'bg-purple-500',
    borderColor: 'border-purple-500',
    description: 'Selected candidates receive an AI-powered interview invite with role-specific questions.',
    automations: ['Interview invite email sent', 'AI generates role-specific questions', 'Reminder at 20min & 2hr if not started'],
    actions: ['Send interview invite', 'Send follow-up email', 'View interview results'],
    emailTriggers: ['For Interview'],
  },
  {
    id: 'ai-interview',
    label: 'AI Interview',
    icon: Bot,
    color: 'bg-violet-500',
    borderColor: 'border-violet-500',
    description: 'Candidate completes AI-powered interview with multiple-choice, text, and voice questions.',
    automations: ['AI assessment & scoring on completion', 'Paste detection for integrity', 'Voice recording transcription', 'Admin notification on completion'],
    actions: [],
    emailTriggers: [],
  },
  {
    id: 'siv',
    label: 'SIV',
    icon: Search,
    color: 'bg-cyan-500',
    borderColor: 'border-cyan-500',
    description: 'Structured Internal Vetting — detailed review based on interview results, CV, and AI assessment.',
    automations: ['Interview score summary available', 'AI strengths & concerns analysis'],
    actions: ['Review full interview transcript', 'Add structured notes', 'Build candidate profile'],
    emailTriggers: ['SIV'],
  },
  {
    id: 'pitch',
    label: 'Pitch',
    icon: Presentation,
    color: 'bg-fuchsia-500',
    borderColor: 'border-fuchsia-500',
    description: 'Candidate profile is prepared and pitched to the client.',
    automations: [],
    actions: ['Prepare candidate profile', 'Share with client contact', 'Schedule introduction'],
    emailTriggers: ['Pitch'],
  },
  {
    id: 'client-interview',
    label: 'Client Interview',
    icon: Users,
    color: 'bg-orange-500',
    borderColor: 'border-orange-500',
    description: 'Candidate interviews directly with the client. Recruiter coordinates scheduling.',
    automations: ['Calendly integration for scheduling'],
    actions: ['Schedule via Calendly', 'Send prep email', 'Collect client feedback'],
    emailTriggers: ['Client Interview'],
  },
  {
    id: 'hired',
    label: 'Hired',
    icon: CheckCircle,
    color: 'bg-emerald-500',
    borderColor: 'border-emerald-500',
    description: 'Candidate is hired — contractor assignment created, enters post-hire pipeline.',
    automations: ['Contractor assignment dialog triggers', 'Auto-enters post-hire pipeline', 'Client notification'],
    actions: ['Create contractor assignment', 'Set up timesheet', 'Add to milestone tracking'],
    emailTriggers: ['Hired'],
  },
  {
    id: 'post-hire',
    label: 'Post-Hire Pipeline',
    icon: Target,
    color: 'bg-teal-500',
    borderColor: 'border-teal-500',
    description: 'Milestone-based tracking: Onboarding → Week 1 → Week 2 → Month 1/2/3 → Settled.',
    automations: ['Auto-advance based on days elapsed', 'Check-in emails to client at each milestone', 'Contractor welcome emails'],
    actions: ['View milestone progress', 'Send manual check-in', 'Update stage'],
    emailTriggers: [],
  },
  {
    id: 'reject',
    label: 'Reject',
    icon: AlertTriangle,
    color: 'bg-red-500',
    borderColor: 'border-red-500',
    description: 'Candidates who did not meet requirements. Rejection email sent automatically.',
    automations: ['Rejection email (configurable delay)'],
    actions: ['Send rejection email', 'Reconsider & move back'],
    emailTriggers: ['Reject', 'Rejected'],
  },
  {
    id: 'bench',
    label: 'Bench',
    icon: Clock,
    color: 'bg-amber-500',
    borderColor: 'border-amber-500',
    description: 'Qualified candidates waiting for placement. Availability checked periodically.',
    automations: ['Availability check emails (magic-link)', 'Auto-track availability status'],
    actions: ['Send availability check', 'Reprofile to different role'],
    emailTriggers: ['Bench'],
  },
  {
    id: 'talent-pool',
    label: 'Talent Pool',
    icon: Target,
    color: 'bg-indigo-500',
    borderColor: 'border-indigo-500',
    description: 'General pool for candidates without a specific role. Matched via Talent Scout AI.',
    automations: ['Talent Scout AI matching', 'Boolean search across pool'],
    actions: ['Run Talent Scout matching', 'Reprofile to job', 'Send opportunity emails'],
    emailTriggers: ['Talent Pool'],
  },
];

// Main pipeline flow
const MAIN_FLOW: WorkflowConnection[] = [
  { from: 'application', to: 'ai-scoring' },
  { from: 'ai-scoring', to: 'for-review' },
  { from: 'for-review', to: 'for-interview' },
  { from: 'for-interview', to: 'ai-interview' },
  { from: 'ai-interview', to: 'siv' },
  { from: 'siv', to: 'pitch' },
  { from: 'pitch', to: 'client-interview' },
  { from: 'client-interview', to: 'hired' },
  { from: 'hired', to: 'post-hire' },
];

// Branch flows
const BRANCH_FLOWS: WorkflowConnection[] = [
  { from: 'for-review', to: 'reject', label: 'Not qualified', dashed: true },
  { from: 'for-interview', to: 'reject', label: 'No show / Failed', dashed: true },
  { from: 'siv', to: 'reject', label: 'Not suitable', dashed: true },
  { from: 'client-interview', to: 'reject', label: 'Client declined', dashed: true },
  { from: 'client-interview', to: 'bench', label: 'On hold', dashed: true },
  { from: 'for-review', to: 'talent-pool', label: 'No current role', dashed: true },
];

// Node component
const WorkflowNodeCard = ({
  node,
  isSelected,
  onClick,
  emailCount,
}: {
  node: WorkflowNode;
  isSelected: boolean;
  onClick: () => void;
  emailCount: number;
}) => {
  const Icon = node.icon;
  return (
    <button
      onClick={onClick}
      className={`
        relative group flex flex-col items-center gap-2 transition-all duration-200
        ${isSelected ? 'scale-110 z-10' : 'hover:scale-105'}
      `}
    >
      {/* Node circle */}
      <div className={`
        w-14 h-14 rounded-xl ${node.color} flex items-center justify-center
        shadow-lg transition-all duration-200
        ${isSelected ? 'ring-4 ring-primary/30 shadow-xl' : 'group-hover:shadow-xl'}
      `}>
        <Icon className="w-7 h-7 text-white" />
      </div>
      {/* Label */}
      <span className={`
        text-xs font-semibold max-w-[80px] text-center leading-tight
        ${isSelected ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}
      `}>
        {node.label}
      </span>
      {/* Badges */}
      <div className="flex gap-1 absolute -top-2 -right-2">
        {node.automations.length > 0 && (
          <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center shadow">
            <Zap className="w-3 h-3" />
          </span>
        )}
        {emailCount > 0 && (
          <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center shadow">
            <Mail className="w-3 h-3" />
          </span>
        )}
      </div>
    </button>
  );
};

// Connector arrow
const Connector = ({ dashed, label, vertical }: { dashed?: boolean; label?: string; vertical?: boolean }) => {
  if (vertical) {
    return (
      <div className="flex flex-col items-center gap-0.5 py-1">
        <div className={`w-0.5 h-6 ${dashed ? 'border-l-2 border-dashed border-muted-foreground/40' : 'bg-muted-foreground/30'}`} />
        {label && <span className="text-[9px] text-muted-foreground whitespace-nowrap">{label}</span>}
        <ArrowRight className="w-3 h-3 text-muted-foreground/40 rotate-90" />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-0.5 px-1">
      <div className={`h-0.5 w-6 ${dashed ? 'border-t-2 border-dashed border-muted-foreground/40' : 'bg-muted-foreground/30'}`} />
      {label && <span className="text-[9px] text-muted-foreground whitespace-nowrap">{label}</span>}
      <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
    </div>
  );
};

// Detail panel
const NodeDetailPanel = ({
  node,
  templates,
}: {
  node: WorkflowNode;
  templates: EmailTemplate[];
}) => {
  const Icon = node.icon;
  const matchedTemplates = templates.filter(t =>
    node.emailTriggers.some(tr => t.status_trigger.toLowerCase() === tr.toLowerCase())
  );

  return (
    <div className={`rounded-xl border-2 ${node.borderColor} bg-card p-6 animate-fade-in space-y-5`}>
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl ${node.color} flex items-center justify-center shadow-lg`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-foreground">{node.label}</h3>
          <p className="text-sm text-muted-foreground mt-1">{node.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Automations */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            Automations
          </h4>
          {node.automations.length > 0 ? (
            <ul className="space-y-2">
              {node.automations.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Bot className="w-4 h-4 mt-0.5 text-amber-500 flex-shrink-0" />
                  {a}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground italic">Manual stage</p>
          )}
        </div>

        {/* Email Templates */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-500" />
            Email Templates
          </h4>
          {matchedTemplates.length > 0 ? (
            <ul className="space-y-2">
              {matchedTemplates.map(tpl => (
                <li key={tpl.id} className="p-2.5 bg-muted/50 rounded-lg text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{tpl.name || tpl.subject}</span>
                    <Badge variant={tpl.is_enabled ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                      {tpl.is_enabled ? 'Active' : 'Off'}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs truncate">Subject: {tpl.subject}</p>
                  {tpl.delay_hours && tpl.delay_hours > 0 && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {tpl.delay_hours}h delay
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground italic">No email templates</p>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            Actions
          </h4>
          {node.actions.length > 0 ? (
            <ul className="space-y-2">
              {node.actions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <ArrowRight className="w-4 h-4 mt-0.5 text-emerald-500 flex-shrink-0" />
                  {a}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground italic">Automated stage</p>
          )}
        </div>
      </div>
    </div>
  );
};

export const WorkflowBoard = () => {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
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

  const getEmailCount = useCallback((node: WorkflowNode) => {
    return emailTemplates.filter(t =>
      node.emailTriggers.some(tr => t.status_trigger.toLowerCase() === tr.toLowerCase())
    ).length;
  }, [emailTemplates]);

  const getNode = (id: string) => NODES.find(n => n.id === id)!;
  const selectedNodeData = selectedNode ? getNode(selectedNode) : null;

  // Main pipeline node IDs
  const mainIds = MAIN_FLOW.map(f => f.from).concat(MAIN_FLOW[MAIN_FLOW.length - 1].to);
  const uniqueMainIds = [...new Set(mainIds)];

  // Branch targets
  const branchTargetIds = ['reject', 'bench', 'talent-pool'];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Recruitment Workflow</h2>
        <p className="text-muted-foreground mt-1">
          Click any node to see its automations, email templates, and available actions.
        </p>
      </div>

      {/* Main pipeline flow - visual node graph */}
      <div className="relative bg-muted/30 rounded-2xl border p-6 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max justify-center">
          {uniqueMainIds.map((id, i) => {
            const node = getNode(id);
            return (
              <div key={id} className="flex items-center">
                <WorkflowNodeCard
                  node={node}
                  isSelected={selectedNode === id}
                  onClick={() => setSelectedNode(selectedNode === id ? null : id)}
                  emailCount={getEmailCount(node)}
                />
                {i < uniqueMainIds.length - 1 && <Connector />}
              </div>
            );
          })}
        </div>

        {/* Branch nodes below */}
        <div className="flex justify-center mt-8 gap-16">
          {branchTargetIds.map(id => {
            const node = getNode(id);
            const sources = BRANCH_FLOWS.filter(f => f.to === id);
            return (
              <div key={id} className="flex flex-col items-center gap-2">
                <div className="flex flex-col items-center">
                  <div className="w-0.5 h-4 border-l-2 border-dashed border-muted-foreground/30" />
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40 rotate-90" />
                </div>
                <WorkflowNodeCard
                  node={node}
                  isSelected={selectedNode === id}
                  onClick={() => setSelectedNode(selectedNode === id ? null : id)}
                  emailCount={getEmailCount(node)}
                />
                <div className="flex flex-wrap gap-1 justify-center max-w-[120px]">
                  {sources.map((s, i) => (
                    <span key={i} className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      from {getNode(s.from).label}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-6 pt-4 border-t border-border/50 justify-center">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
              <Zap className="w-2.5 h-2.5 text-white" />
            </span>
            Has automations
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
              <Mail className="w-2.5 h-2.5 text-white" />
            </span>
            Has email templates
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-6 h-0.5 border-t-2 border-dashed border-muted-foreground/40" />
            Branch path
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-6 h-0.5 bg-muted-foreground/30" />
            Main flow
          </div>
        </div>
      </div>

      {/* Selected node detail */}
      {selectedNodeData && (
        <NodeDetailPanel node={selectedNodeData} templates={emailTemplates} />
      )}
    </div>
  );
};
