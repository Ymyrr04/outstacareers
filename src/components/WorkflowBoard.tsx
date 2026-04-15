import { useState, useEffect, useRef, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import {
  FileText, Search, MessageCircle, Users, CheckCircle,
  Mail, Zap, Clock, Bot, AlertTriangle, Target, Presentation,
  Eye, Fingerprint, Upload, Brain, Database, Code, Globe,
  ScanSearch, Star, Calendar, UserCheck, ClipboardCheck,
  Shield, Mic, Bell, Send, RotateCw, Link2, MousePointerClick,
  X, ChevronDown, ChevronRight, Server, Webhook, Timer,
  GitBranch, ArrowRight, Workflow, ZoomIn, ZoomOut, Maximize2
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Types ──────────────────────────────────────────────────────

interface EmailTemplate {
  id?: string;
  name: string;
  subject: string;
  status_trigger: string;
  is_enabled: boolean;
  delay_hours: number | null;
}

type NodeType = 'ai' | 'email' | 'system' | 'manual' | 'trigger' | 'db' | 'edge-fn' | 'cron' | 'rls';

interface DetailNode {
  id: string;
  label: string;
  description: string;
  type: NodeType;
  icon: React.ElementType;
  details?: string[];
}

interface StageDefinition {
  id: string;
  label: string;
  shortLabel?: string;
  icon: React.ElementType;
  color: string;
  borderColor: string;
  description: string;
  automations: DetailNode[];
  dbOperations: DetailNode[];
  edgeFunctions: DetailNode[];
  emailActions: DetailNode[];
  outputs: DetailNode[];
  emailTriggers: string[];
}

// ─── Colors ─────────────────────────────────────────────────────

const TYPE_COLORS: Record<NodeType, { bg: string; border: string; iconBg: string; text: string }> = {
  ai:        { bg: '#8b5cf6', border: '#7c3aed', iconBg: '#8b5cf6', text: '#ede9fe' },
  email:     { bg: '#3b82f6', border: '#2563eb', iconBg: '#3b82f6', text: '#dbeafe' },
  system:    { bg: '#f59e0b', border: '#d97706', iconBg: '#f59e0b', text: '#fef3c7' },
  manual:    { bg: '#10b981', border: '#059669', iconBg: '#10b981', text: '#d1fae5' },
  trigger:   { bg: '#ef4444', border: '#dc2626', iconBg: '#ef4444', text: '#fee2e2' },
  db:        { bg: '#0ea5e9', border: '#0284c7', iconBg: '#0ea5e9', text: '#e0f2fe' },
  'edge-fn': { bg: '#f97316', border: '#ea580c', iconBg: '#f97316', text: '#ffedd5' },
  cron:      { bg: '#ec4899', border: '#db2777', iconBg: '#ec4899', text: '#fce7f3' },
  rls:       { bg: '#14b8a6', border: '#0d9488', iconBg: '#14b8a6', text: '#ccfbf1' },
};

const STAGE_COLORS: Record<string, { bg: string; border: string; headerBg: string }> = {
  'application':      { bg: '#1e3a5f', border: '#3b82f6', headerBg: '#3b82f6' },
  'ai-scoring':       { bg: '#2d1b4e', border: '#8b5cf6', headerBg: '#8b5cf6' },
  'for-review':       { bg: '#164e63', border: '#06b6d4', headerBg: '#06b6d4' },
  'for-interview':    { bg: '#3b1764', border: '#a855f7', headerBg: '#a855f7' },
  'ai-interview':     { bg: '#2d1b4e', border: '#8b5cf6', headerBg: '#8b5cf6' },
  'siv':              { bg: '#164e63', border: '#06b6d4', headerBg: '#06b6d4' },
  'pitch':            { bg: '#4a1d5e', border: '#d946ef', headerBg: '#d946ef' },
  'client-interview': { bg: '#431407', border: '#f97316', headerBg: '#f97316' },
  'hired':            { bg: '#064e3b', border: '#10b981', headerBg: '#10b981' },
  'post-hire':        { bg: '#134e4a', border: '#14b8a6', headerBg: '#14b8a6' },
  'reject':           { bg: '#450a0a', border: '#ef4444', headerBg: '#ef4444' },
  'bench':            { bg: '#451a03', border: '#f59e0b', headerBg: '#f59e0b' },
  'talent-pool':      { bg: '#1e1b4b', border: '#6366f1', headerBg: '#6366f1' },
};

// ─── Stage definitions (same data, kept intact) ─────────────────

const STAGES: StageDefinition[] = [
  {
    id: 'application',
    label: 'Application Submitted',
    shortLabel: 'Application',
    icon: FileText,
    color: 'bg-blue-500',
    borderColor: '#3b82f6',
    description: 'Candidate submits application via /apply/:slug or /talent-pool form.',
    automations: [
      { id: 'a1', label: 'Honeypot Spam Check', description: 'RLS: honeypot_field IS NULL or empty.', type: 'rls', icon: Shield, details: ['RLS: (honeypot_field IS NULL) OR (honeypot_field = \'\')', 'Table: applicants_prescreen', 'Role: anon, authenticated'] },
      { id: 'a2', label: 'Required Fields Validation', description: 'RLS enforces full_name and email are non-empty.', type: 'rls', icon: ClipboardCheck, details: ['RLS: full_name IS NOT NULL AND email IS NOT NULL'] },
      { id: 'a3', label: 'CV PDF Upload', description: 'PDF → cv-uploads bucket (private). Path: {job_id}/{uuid}.pdf', type: 'system', icon: Upload, details: ['Bucket: cv-uploads (private)', 'Format: PDF only'] },
      { id: 'a4', label: 'Duplicate Detection', description: 'Checks email + phone against existing records.', type: 'system', icon: Fingerprint, details: ['Matches: email OR phone', 'Shows "Nx applied" badge'] },
      { id: 'a5', label: 'Source Tracking', description: 'Records job_source from URL params.', type: 'system', icon: Link2, details: ['Field: job_source'] },
      { id: 'a6', label: 'Device Type Detection', description: 'Captures device_type from user agent.', type: 'system', icon: Globe },
      { id: 'a7', label: 'IP Hashing', description: 'IP address hashed for analytics (no PII).', type: 'system', icon: Shield },
    ],
    dbOperations: [
      { id: 'a-db1', label: 'INSERT applicants_prescreen', description: 'Status: "For Review", 30+ columns.', type: 'db', icon: Database, details: ['Default status: "For Review"', 'total_score initially NULL'] },
    ],
    edgeFunctions: [
      { id: 'a-ef1', label: 'submit-application', description: 'Handles form + file upload + record creation.', type: 'edge-fn', icon: Server, details: ['Multipart form data', 'Validates PDF', 'Returns applicant ID'] },
      { id: 'a-ef2', label: 'track-analytics', description: 'Fires page_view / application_submit events.', type: 'edge-fn', icon: Server, details: ['Production only'] },
    ],
    emailActions: [],
    outputs: [
      { id: 'a-o1', label: 'Trigger: score-cv', description: 'After insert → AI scoring begins.', type: 'trigger', icon: Zap },
      { id: 'a-o2', label: 'Email: Application Received', description: 'Auto email (5h delay) confirming receipt.', type: 'email', icon: Mail, details: ['Delay: 5 hours'] },
    ],
    emailTriggers: ['application_received'],
  },
  {
    id: 'ai-scoring',
    label: 'AI CV Scoring',
    icon: Brain,
    color: 'bg-violet-500',
    borderColor: '#8b5cf6',
    description: 'AI analyzes and scores CV against job requirements.',
    automations: [
      { id: 'b1', label: 'Vision API Text Extraction', description: 'PDF → images → Gemini Vision OCR.', type: 'ai', icon: Eye, details: ['Model: gemini-2.5-flash', 'Max: 50K chars'] },
      { id: 'b2', label: 'Role Experience Scoring', description: 'Years, relevance, career progression.', type: 'ai', icon: Brain, details: ['Score: 0-50'] },
      { id: 'b3', label: 'Skills & Tools Matching', description: 'Extracts & matches skills vs job reqs.', type: 'ai', icon: ScanSearch, details: ['Score: 0-45', 'Populates: extracted_skills[], extracted_tools[]'] },
      { id: 'b4', label: 'Availability & Setup', description: 'Timezone, internet, equipment scoring.', type: 'ai', icon: CheckCircle, details: ['Score: 0-5'] },
      { id: 'b5', label: 'Total Score Aggregation', description: 'Sum all categories. ≥70 green, ≥40 amber.', type: 'system', icon: ClipboardCheck, details: ['Range: 0-100', 'Stored: total_score'] },
      { id: 'b6', label: 'AI Summary Generation', description: 'Concise strengths + fit assessment text.', type: 'ai', icon: FileText, details: ['Stored: ai_summary, ai_assessment_details'] },
    ],
    dbOperations: [
      { id: 'b-db1', label: 'UPDATE applicants_prescreen', description: 'Sets all scoring fields + metadata.', type: 'db', icon: Database },
    ],
    edgeFunctions: [
      { id: 'b-ef1', label: 'score-cv', description: 'Primary scoring. Model: gemini-3-flash-preview.', type: 'edge-fn', icon: Server, details: ['Uses: LOVABLE_API_KEY'] },
      { id: 'b-ef2', label: 'extract-cv-with-vision', description: 'Fallback OCR for scanned PDFs.', type: 'edge-fn', icon: Server },
      { id: 'b-ef3', label: 'rescore-cv', description: 'Manual admin-triggered rescore.', type: 'edge-fn', icon: Server },
    ],
    emailActions: [],
    outputs: [
      { id: 'b-o1', label: 'Appears in For Review', description: 'Applicant visible with AI score badge.', type: 'trigger', icon: Zap },
    ],
    emailTriggers: [],
  },
  {
    id: 'for-review',
    label: 'For Review',
    icon: Search,
    color: 'bg-cyan-500',
    borderColor: '#06b6d4',
    description: 'Admins review AI-scored applications.',
    automations: [
      { id: 'c1', label: '"New" Badge System', description: 'details_viewed_at IS NULL → "New" badge.', type: 'system', icon: Bell, details: ['Set on first detail view'] },
      { id: 'c2', label: 'First View Timestamp', description: 'details_viewed_at set on open.', type: 'system', icon: Eye },
      { id: 'c3', label: 'Background CV Scan', description: 'Batch 50 unscored CVs → score-cv.', type: 'system', icon: ScanSearch, details: ['cv_file_url IS NOT NULL AND total_score IS NULL'] },
      { id: 'c4', label: 'Star Candidate', description: 'Toggle is_starred for quick filtering.', type: 'manual', icon: Star },
    ],
    dbOperations: [
      { id: 'c-db1', label: 'Status History Trigger', description: 'log_applicant_status_change() → audit row.', type: 'db', icon: Database, details: ['SECURITY DEFINER', 'Table: applicant_status_history'] },
    ],
    edgeFunctions: [],
    emailActions: [],
    outputs: [
      { id: 'c-o1', label: '→ For Interview', description: 'Admin advances candidate.', type: 'manual', icon: ArrowRight },
      { id: 'c-o2', label: '→ Reject', description: 'Not qualified.', type: 'manual', icon: AlertTriangle },
      { id: 'c-o3', label: '→ Talent Pool', description: 'Good but no match now.', type: 'manual', icon: Target },
      { id: 'c-o4', label: '→ Reprofile', description: 'Change job, re-score CV.', type: 'manual', icon: RotateCw },
    ],
    emailTriggers: [],
  },
  {
    id: 'for-interview',
    label: 'For Interview',
    icon: MessageCircle,
    color: 'bg-purple-500',
    borderColor: '#a855f7',
    description: 'AI-powered interview invites sent. Multiple recruiter templates.',
    automations: [
      { id: 'd1', label: 'Auto Interview Invite', description: 'Default template (0h delay) with unique link.', type: 'email', icon: Send, details: ['Link: /interview/:applicantId'] },
      { id: 'd2', label: 'Recruiter-Specific Templates', description: 'Czarina, Kristine, Eduardo — own Gmail.', type: 'email', icon: Mail, details: ['3 custom templates', 'Personal Gmail SMTP'] },
      { id: 'd3', label: 'No-Show Reminder', description: '2h delay if interview not started.', type: 'email', icon: Clock, details: ['From: Kristine', 'Delay: 2 hours'] },
    ],
    dbOperations: [
      { id: 'd-db1', label: 'INSERT interview_sessions', description: 'status: in_progress on link open.', type: 'db', icon: Database },
    ],
    edgeFunctions: [
      { id: 'd-ef1', label: 'send-interview-invite', description: 'Gmail SMTP → interview email.', type: 'edge-fn', icon: Server },
      { id: 'd-ef2', label: 'generate-interview-questions', description: 'AI generates MCQ + text + voice Qs.', type: 'edge-fn', icon: Server, details: ['Model: gemini-2.5-flash', 'Sections: MCQ(5), Text(3-5), Voice(2-3)'] },
      { id: 'd-ef3', label: 'process-interview-reminders', description: 'Cron: 20min + 2hr reminder checks.', type: 'cron', icon: Timer },
    ],
    emailActions: [],
    outputs: [
      { id: 'd-o1', label: 'Candidate Opens Link', description: 'Session begins. Anon RLS for 24hr.', type: 'trigger', icon: Zap },
    ],
    emailTriggers: ['for_interview'],
  },
  {
    id: 'ai-interview',
    label: 'AI Interview Assessment',
    shortLabel: 'AI Interview',
    icon: Bot,
    color: 'bg-violet-500',
    borderColor: '#8b5cf6',
    description: 'Candidate completes AI interview. 5-dimension scoring.',
    automations: [
      { id: 'e1', label: 'Paste Detection', description: 'Monitors clipboard events. Stores pasted content.', type: 'system', icon: Shield, details: ['Fields: paste_detected, pasted_content'] },
      { id: 'e2', label: 'Voice Recording Capture', description: 'MediaRecorder → voice-recordings bucket.', type: 'system', icon: Mic, details: ['Format: audio/webm', 'Public bucket'] },
      { id: 'e3', label: 'MCQ Auto-Scoring', description: 'Instant scoring against correct option.', type: 'system', icon: CheckCircle },
    ],
    dbOperations: [
      { id: 'e-db1', label: 'INSERT interview_answers', description: 'Per-question. RLS: active session only.', type: 'db', icon: Database, details: ['ai_score must be NULL on insert'] },
      { id: 'e-db2', label: 'UPDATE interview_sessions', description: 'On complete: all scores + AI summary.', type: 'db', icon: Database, details: ['5 dimension scores', 'ai_strengths[], ai_concerns[]'] },
    ],
    edgeFunctions: [
      { id: 'e-ef1', label: 'assess-interview', description: 'AI scores with dynamic weighting.', type: 'edge-fn', icon: Server, details: ['Model: gemini-2.5-flash', '5 dims: tech, exp, comm, sit, pers'] },
      { id: 'e-ef2', label: 'Admin Notification (cron)', description: '20min post-complete → notify admin.', type: 'cron', icon: Timer },
    ],
    emailActions: [],
    outputs: [
      { id: 'e-o1', label: '→ SIV', description: 'Admin reviews results.', type: 'manual', icon: ArrowRight },
    ],
    emailTriggers: [],
  },
  {
    id: 'siv',
    label: 'SIV (Internal Vetting)',
    shortLabel: 'SIV',
    icon: Search,
    color: 'bg-cyan-500',
    borderColor: '#06b6d4',
    description: 'Recruiter reviews interview results & builds profile.',
    automations: [
      { id: 'f1', label: 'Score Dashboard', description: 'Overall + 5 category scores, color-coded.', type: 'system', icon: ClipboardCheck },
      { id: 'f2', label: 'Voice Playback', description: 'HTML5 audio from public bucket.', type: 'system', icon: Mic },
      { id: 'f3', label: 'Structured Notes', description: 'Rich text, timestamped, @mention support.', type: 'manual', icon: ClipboardCheck, details: ['Table: applicant_notes', 'Supports @mentions → Slack'] },
    ],
    dbOperations: [],
    edgeFunctions: [
      { id: 'f-ef1', label: 'send-mention-notification', description: '@mention → Slack notification.', type: 'edge-fn', icon: Server, details: ['Uses: SLACK_API_KEY'] },
    ],
    emailActions: [
      { id: 'f-em1', label: 'SIV Email Templates', description: 'Client assessment emails.', type: 'email', icon: Mail },
    ],
    outputs: [
      { id: 'f-o1', label: 'Build Candidate Profile', description: 'Rich text profile for client.', type: 'manual', icon: FileText },
      { id: 'f-o2', label: '→ Pitch', description: 'Candidate approved for client.', type: 'manual', icon: ArrowRight },
    ],
    emailTriggers: ['siv'],
  },
  {
    id: 'pitch',
    label: 'Pitch to Client',
    shortLabel: 'Pitch',
    icon: Presentation,
    color: 'bg-fuchsia-500',
    borderColor: '#d946ef',
    description: 'Candidate profile presented to client.',
    automations: [],
    dbOperations: [
      { id: 'g-db1', label: 'Status History Logged', description: 'DB trigger logs transition.', type: 'db', icon: Database },
    ],
    edgeFunctions: [],
    emailActions: [],
    outputs: [
      { id: 'g-o1', label: 'Share Profile', description: 'Send profile to client.', type: 'manual', icon: Send },
      { id: 'g-o2', label: 'Schedule Intro', description: 'Arrange candidate-client call.', type: 'manual', icon: Calendar },
      { id: 'g-o3', label: '→ Client Interview', description: 'Client interested.', type: 'manual', icon: ArrowRight },
    ],
    emailTriggers: [],
  },
  {
    id: 'client-interview',
    label: 'Client Interview',
    icon: Users,
    color: 'bg-orange-500',
    borderColor: '#f97316',
    description: 'Direct client interview. Calendly integration.',
    automations: [
      { id: 'h1', label: 'Calendly Integration', description: 'OAuth scheduling with embedded links.', type: 'system', icon: Calendar, details: ['OAuth: CALENDLY_CLIENT_ID'] },
    ],
    dbOperations: [],
    edgeFunctions: [
      { id: 'h-ef1', label: 'calendly-auth', description: 'OAuth token exchange.', type: 'edge-fn', icon: Server },
    ],
    emailActions: [
      { id: 'h-em1', label: 'Client Interview Email', description: 'From Kristine.', type: 'email', icon: Mail },
    ],
    outputs: [
      { id: 'h-o1', label: '→ Hired', description: 'Client approves.', type: 'manual', icon: CheckCircle },
      { id: 'h-o2', label: '→ Bench', description: 'Client wants to wait.', type: 'manual', icon: Clock },
      { id: 'h-o3', label: '→ Reject', description: 'Client declines.', type: 'manual', icon: AlertTriangle },
    ],
    emailTriggers: [],
  },
  {
    id: 'hired',
    label: 'Hired',
    icon: CheckCircle,
    color: 'bg-emerald-500',
    borderColor: '#10b981',
    description: 'Candidate hired. Contractor assignment created.',
    automations: [
      { id: 'i1', label: 'HiredAssignmentDialog', description: 'Captures: client, rate, hours, start date.', type: 'system', icon: ClipboardCheck },
      { id: 'i2', label: 'Auto is_hiring=false', description: 'DB trigger on active contractor.', type: 'db', icon: Database, details: ['auto_disable_hiring_on_active_contractor()'] },
    ],
    dbOperations: [
      { id: 'i-db1', label: 'INSERT contractor_assignments', description: 'Status: active. Links applicant + client.', type: 'db', icon: Database },
      { id: 'i-db2', label: 'INSERT pipeline_tracking', description: 'Auto-placed in Onboarding stage.', type: 'db', icon: Database },
    ],
    edgeFunctions: [],
    emailActions: [
      { id: 'i-em1', label: 'Hired Congrats Email', description: '5h delay congratulations.', type: 'email', icon: Mail },
      { id: 'i-em2', label: 'Candidate Successful', description: 'Additional success notification.', type: 'email', icon: Mail },
    ],
    outputs: [
      { id: 'i-o1', label: '→ Post-Hire Pipeline', description: 'Enters milestone tracking.', type: 'trigger', icon: Zap },
    ],
    emailTriggers: ['hired'],
  },
  {
    id: 'post-hire',
    label: 'Post-Hire Pipeline',
    shortLabel: 'Post-Hire',
    icon: Target,
    color: 'bg-teal-500',
    borderColor: '#14b8a6',
    description: '7-stage milestone tracking (0-120 days).',
    automations: [
      { id: 'j1', label: 'Auto-Advance Cron', description: 'Daily check: days since start → advance stage.', type: 'cron', icon: Timer, details: ['Onboarding(0d)→Week1(7d)→Week2(14d)', '→Month1(30d)→Month2(60d)→Month3(90d)→Settled(120d)'] },
      { id: 'j2', label: 'Client Check-in Emails', description: 'Per-milestone email to client contact.', type: 'email', icon: Send },
      { id: 'j3', label: 'Contractor Milestone Emails', description: 'Welcome + periodic check-ins.', type: 'email', icon: Mail },
      { id: 'j4', label: 'Manual Drag Override', description: 'Kanban drag between stages.', type: 'manual', icon: Workflow },
    ],
    dbOperations: [
      { id: 'j-db1', label: '7 Pipeline Stages', description: '🚀Onboarding→📋Wk1→📊Wk2→🎯Mo1→📈Mo2→⭐Mo3→✅Settled', type: 'db', icon: Database },
      { id: 'j-db2', label: 'UPDATE pipeline_tracking', description: 'stage_id + moved_at + auto_moved flag.', type: 'db', icon: Database },
    ],
    edgeFunctions: [
      { id: 'j-ef1', label: 'process-contractor-milestones', description: 'Daily cron: advance + email.', type: 'cron', icon: Timer },
      { id: 'j-ef2', label: 'send-contractor-email', description: 'Manual contractor emails.', type: 'edge-fn', icon: Server },
    ],
    emailActions: [],
    outputs: [
      { id: 'j-o1', label: 'Settled (120 days)', description: 'Fully onboarded.', type: 'trigger', icon: CheckCircle },
    ],
    emailTriggers: [],
  },
  {
    id: 'reject',
    label: 'Reject',
    icon: AlertTriangle,
    color: 'bg-red-500',
    borderColor: '#ef4444',
    description: 'Rejection with configurable delay email.',
    automations: [
      { id: 'k1', label: 'Rejection Email (17h)', description: 'Default: 17h delay.', type: 'email', icon: Send },
      { id: 'k2', label: 'Post-Interview Reject (24h)', description: 'For interviewed candidates.', type: 'email', icon: Send },
      { id: 'k3', label: 'Status History Audit', description: 'Immutable audit trail.', type: 'db', icon: Database },
    ],
    dbOperations: [],
    edgeFunctions: [
      { id: 'k-ef1', label: 'process-scheduled-emails', description: 'Cron: processes delayed emails.', type: 'cron', icon: Timer },
    ],
    emailActions: [],
    outputs: [
      { id: 'k-o1', label: 'Reconsider', description: 'Move back to pipeline.', type: 'manual', icon: RotateCw },
    ],
    emailTriggers: ['reject'],
  },
  {
    id: 'bench',
    label: 'Bench',
    icon: Clock,
    color: 'bg-amber-500',
    borderColor: '#f59e0b',
    description: 'Qualified candidates waiting. Magic-link availability.',
    automations: [
      { id: 'l1', label: 'Availability Check Email', description: 'Magic-link with Available/Not buttons.', type: 'email', icon: Send, details: ['UUID response_token', 'No login required'] },
      { id: 'l2', label: 'Response Handler', description: 'Updates is_available + timestamp.', type: 'system', icon: MousePointerClick },
      { id: 'l3', label: 'Availability Badge', description: 'Green=available, Red=not.', type: 'system', icon: CheckCircle },
      { id: 'l4', label: 'Periodic Follow-up', description: 'Custom bench check-in template.', type: 'email', icon: Mail },
    ],
    dbOperations: [
      { id: 'l-db1', label: 'availability_responses', description: 'Tracks token + response + timestamps.', type: 'db', icon: Database },
    ],
    edgeFunctions: [
      { id: 'l-ef1', label: 'send-availability-check', description: 'Sends magic-link email.', type: 'edge-fn', icon: Server },
      { id: 'l-ef2', label: 'handle-availability-response', description: 'Processes button click.', type: 'edge-fn', icon: Server },
    ],
    emailActions: [],
    outputs: [
      { id: 'l-o1', label: '→ Reprofile', description: 'Change job, re-score.', type: 'manual', icon: RotateCw },
      { id: 'l-o2', label: '→ Re-enter Pipeline', description: 'Back to For Review.', type: 'manual', icon: ArrowRight },
    ],
    emailTriggers: ['bench'],
  },
  {
    id: 'talent-pool',
    label: 'Talent Pool',
    icon: Target,
    color: 'bg-indigo-500',
    borderColor: '#6366f1',
    description: 'General pool. AI matching + boolean search.',
    automations: [
      { id: 'm1', label: 'Talent Scout AI', description: 'Matches pool vs job descriptions.', type: 'ai', icon: Brain, details: ['Model: gemini-2.5-flash'] },
      { id: 'm2', label: 'Boolean Search', description: 'AND/OR/NOT across all fields.', type: 'system', icon: ScanSearch },
      { id: 'm3', label: 'Apollo.io Integration', description: 'External candidate sourcing.', type: 'system', icon: Globe, details: ['API: APOLLO_API_KEY'] },
    ],
    dbOperations: [],
    edgeFunctions: [
      { id: 'm-ef1', label: 'scout-talent', description: 'AI candidate matching.', type: 'edge-fn', icon: Server },
      { id: 'm-ef2', label: 'search-apollo', description: 'Apollo.io search API.', type: 'edge-fn', icon: Server },
    ],
    emailActions: [
      { id: 'm-em1', label: 'Reprofiling Notification', description: 'New opportunity email.', type: 'email', icon: Mail },
    ],
    outputs: [
      { id: 'm-o1', label: '→ Active Job Pipeline', description: 'Match found.', type: 'manual', icon: ArrowRight },
      { id: 'm-o2', label: 'Send Opportunity Email', description: 'Notify of matching role.', type: 'manual', icon: Send },
    ],
    emailTriggers: ['talent_pool'],
  },
];

const MAIN_FLOW = ['application', 'ai-scoring', 'for-review', 'for-interview', 'ai-interview', 'siv', 'pitch', 'client-interview', 'hired', 'post-hire'];
const BRANCH_IDS = ['reject', 'bench', 'talent-pool'];

// ─── Layout constants ───────────────────────────────────────────

const STAGE_W = 280;
const STAGE_HEADER_H = 56;
const SUB_NODE_H = 44;
const SUB_NODE_GAP = 6;
const SECTION_HEADER_H = 24;
const SECTION_GAP = 12;
const COL_GAP = 40;
const ROW_GAP = 80;
const PADDING = 40;
const COLS_PER_ROW = 5;

// ─── Helper: get all sub-nodes grouped by section ───────────────

interface SectionGroup {
  key: string;
  label: string;
  color: string;
  icon: React.ElementType;
  nodes: DetailNode[];
}

function getSections(stage: StageDefinition): SectionGroup[] {
  const sections: SectionGroup[] = [];
  if (stage.automations.length) sections.push({ key: 'auto', label: 'Automations', color: '#f59e0b', icon: Zap, nodes: stage.automations });
  if (stage.dbOperations.length) sections.push({ key: 'db', label: 'Database', color: '#0ea5e9', icon: Database, nodes: stage.dbOperations });
  if (stage.edgeFunctions.length) sections.push({ key: 'ef', label: 'Edge Functions', color: '#f97316', icon: Server, nodes: stage.edgeFunctions });
  if (stage.emailActions.length) sections.push({ key: 'email', label: 'Emails', color: '#3b82f6', icon: Mail, nodes: stage.emailActions });
  if (stage.outputs.length) sections.push({ key: 'out', label: 'Outputs', color: '#10b981', icon: GitBranch, nodes: stage.outputs });
  return sections;
}

function getStageHeight(stage: StageDefinition): number {
  const sections = getSections(stage);
  if (sections.length === 0) return STAGE_HEADER_H + 20;
  let h = STAGE_HEADER_H + 12; // header + top padding
  sections.forEach((sec, i) => {
    h += SECTION_HEADER_H;
    h += sec.nodes.length * (SUB_NODE_H + SUB_NODE_GAP) - SUB_NODE_GAP;
    if (i < sections.length - 1) h += SECTION_GAP;
  });
  h += 12; // bottom padding
  return h;
}

// ─── Sub-node component (foreignObject) ─────────────────────────

const SubNodeFO = ({ node, x, y, w, onClick }: { node: DetailNode; x: number; y: number; w: number; onClick: (n: DetailNode) => void }) => {
  const tc = TYPE_COLORS[node.type];
  const Icon = node.icon;
  return (
    <foreignObject x={x} y={y} width={w} height={SUB_NODE_H}>
      <div
        onClick={(e) => { e.stopPropagation(); onClick(node); }}
        className="h-full flex items-center gap-2 px-2.5 rounded-lg border cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md"
        style={{ background: `${tc.bg}15`, borderColor: `${tc.border}40` }}
      >
        <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: tc.bg }}>
          <Icon className="w-3 h-3 text-white" />
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <p className="text-[10px] font-semibold text-foreground truncate leading-tight">{node.label}</p>
          <p className="text-[9px] text-muted-foreground truncate">{node.description}</p>
        </div>
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: tc.bg }} />
      </div>
    </foreignObject>
  );
};

// ─── Stage node component ───────────────────────────────────────

const StageNodeFO = ({ stage, x, y, w, h, onNodeClick }: {
  stage: StageDefinition; x: number; y: number; w: number; h: number; onNodeClick: (n: DetailNode) => void;
}) => {
  const sc = STAGE_COLORS[stage.id] || { bg: '#1e293b', border: '#64748b', headerBg: '#64748b' };
  const Icon = stage.icon;
  const sections = getSections(stage);
  const nodeW = w - 20; // inner padding

  let cursorY = STAGE_HEADER_H + 12;

  return (
    <g>
      {/* Shadow */}
      <rect x={x + 2} y={y + 2} width={w} height={h} rx={12} fill="black" opacity={0.15} />
      {/* Background */}
      <rect x={x} y={y} width={w} height={h} rx={12} fill={sc.bg} stroke={sc.border} strokeWidth={2} />
      {/* Header bar */}
      <rect x={x} y={y} width={w} height={STAGE_HEADER_H} rx={12} fill={sc.headerBg} />
      <rect x={x} y={y + STAGE_HEADER_H - 12} width={w} height={12} fill={sc.headerBg} />
      {/* Header content */}
      <foreignObject x={x} y={y} width={w} height={STAGE_HEADER_H}>
        <div className="h-full flex items-center gap-2.5 px-3">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white truncate">{stage.shortLabel || stage.label}</p>
            <p className="text-[9px] text-white/70 truncate">{stage.description}</p>
          </div>
        </div>
      </foreignObject>

      {/* Sections with sub-nodes */}
      {sections.map((sec, si) => {
        const sectionStartY = cursorY;
        const sectionEl = (
          <g key={sec.key}>
            {/* Section header */}
            <foreignObject x={x + 10} y={y + sectionStartY} width={nodeW} height={SECTION_HEADER_H}>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded flex items-center justify-center" style={{ background: sec.color }}>
                  <sec.icon className="w-2.5 h-2.5 text-white" />
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: sec.color }}>{sec.label}</span>
                <span className="text-[8px] text-white/40 font-mono">({sec.nodes.length})</span>
              </div>
            </foreignObject>
            {/* Connector line for section */}
            <line
              x1={x + 18} y1={y + sectionStartY + SECTION_HEADER_H}
              x2={x + 18} y2={y + sectionStartY + SECTION_HEADER_H + sec.nodes.length * (SUB_NODE_H + SUB_NODE_GAP) - SUB_NODE_GAP}
              stroke={`${sec.color}30`} strokeWidth={2} strokeDasharray="4 4"
            />
            {/* Sub-nodes */}
            {sec.nodes.map((node, ni) => {
              const nodeY = sectionStartY + SECTION_HEADER_H + ni * (SUB_NODE_H + SUB_NODE_GAP);
              return <SubNodeFO key={node.id} node={node} x={x + 10} y={y + nodeY} w={nodeW} onClick={onNodeClick} />;
            })}
          </g>
        );
        cursorY = sectionStartY + SECTION_HEADER_H + sec.nodes.length * (SUB_NODE_H + SUB_NODE_GAP) - SUB_NODE_GAP;
        if (si < sections.length - 1) cursorY += SECTION_GAP;
        return sectionEl;
      })}
    </g>
  );
};

// ─── Detail panel ───────────────────────────────────────────────

const NodeDetailPanel = ({ node, onClose }: { node: DetailNode; onClose: () => void }) => {
  const tc = TYPE_COLORS[node.type];
  const Icon = node.icon;
  const styleLabel = {
    ai: 'AI', email: 'Email', system: 'System', manual: 'Manual',
    trigger: 'Trigger', db: 'Database', 'edge-fn': 'Edge Function', cron: 'Cron Job', rls: 'RLS Policy'
  }[node.type];

  return (
    <div className="fixed top-4 right-4 w-80 bg-card border-2 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in" style={{ borderColor: tc.border }}>
      <div className="flex items-center gap-2 p-3" style={{ background: `${tc.bg}20` }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: tc.bg }}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">{node.label}</p>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 mt-0.5" style={{ borderColor: tc.border, color: tc.bg }}>
            {styleLabel}
          </Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="p-3 space-y-2">
        <p className="text-xs text-muted-foreground">{node.description}</p>
        {node.details && node.details.length > 0 && (
          <div className="bg-muted/30 rounded-lg p-2.5 space-y-1">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Technical Details</p>
            {node.details.map((d, i) => (
              <p key={i} className="text-[10px] font-mono text-foreground/80">{d}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Arrow connector between stages ─────────────────────────────

const StageConnector = ({ x1, y1, x2, y2, dashed }: { x1: number; y1: number; x2: number; y2: number; dashed?: boolean }) => {
  const dx = x2 - x1;
  const dy = y2 - y1;

  let path: string;
  if (Math.abs(dy) < 5) {
    // Horizontal
    path = `M ${x1} ${y1} L ${x2} ${y2}`;
  } else {
    // Curved
    const midX = x1 + dx / 2;
    path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
  }

  return (
    <path
      d={path}
      fill="none"
      stroke={dashed ? '#64748b' : '#475569'}
      strokeWidth={2}
      strokeDasharray={dashed ? '6 4' : undefined}
      markerEnd="url(#arrowhead)"
    />
  );
};

// ─── Main component ─────────────────────────────────────────────

export const WorkflowBoard = () => {
  const [selectedNode, setSelectedNode] = useState<DetailNode | null>(null);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [zoom, setZoom] = useState(0.55);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from('email_templates')
      .select('id, name, subject, status_trigger, is_enabled, delay_hours')
      .order('template_order', { ascending: true })
      .then(({ data }) => { if (data) setEmailTemplates(data as EmailTemplate[]); });
  }, []);

  // Layout calculation
  const mainStages = MAIN_FLOW.map(id => STAGES.find(s => s.id === id)!);
  const branchStages = BRANCH_IDS.map(id => STAGES.find(s => s.id === id)!);

  // Calculate positions
  const positions: Record<string, { x: number; y: number; w: number; h: number }> = {};

  // Main flow: multi-row grid
  let maxRowH = 0;
  let rowStartY = PADDING;

  mainStages.forEach((stage, i) => {
    const col = i % COLS_PER_ROW;
    const row = Math.floor(i / COLS_PER_ROW);

    if (col === 0 && i > 0) {
      rowStartY += maxRowH + ROW_GAP;
      maxRowH = 0;
    }

    const h = getStageHeight(stage);
    if (h > maxRowH) maxRowH = h;

    positions[stage.id] = {
      x: PADDING + col * (STAGE_W + COL_GAP),
      y: rowStartY,
      w: STAGE_W,
      h,
    };
  });

  // Branches row below
  const branchY = rowStartY + maxRowH + ROW_GAP + 30;
  branchStages.forEach((stage, i) => {
    const h = getStageHeight(stage);
    positions[stage.id] = {
      x: PADDING + i * (STAGE_W + COL_GAP),
      y: branchY,
      w: STAGE_W,
      h,
    };
  });

  // SVG dimensions
  const svgW = PADDING * 2 + COLS_PER_ROW * STAGE_W + (COLS_PER_ROW - 1) * COL_GAP;
  const allPositions = Object.values(positions);
  const svgH = Math.max(...allPositions.map(p => p.y + p.h)) + PADDING;

  // Connectors
  const connectors: { x1: number; y1: number; x2: number; y2: number; dashed?: boolean }[] = [];
  for (let i = 0; i < MAIN_FLOW.length - 1; i++) {
    const fromId = MAIN_FLOW[i];
    const toId = MAIN_FLOW[i + 1];
    const from = positions[fromId];
    const to = positions[toId];
    const col = i % COLS_PER_ROW;
    if (col < COLS_PER_ROW - 1) {
      // Same row → right
      connectors.push({ x1: from.x + from.w, y1: from.y + STAGE_HEADER_H / 2, x2: to.x, y2: to.y + STAGE_HEADER_H / 2 });
    } else {
      // Wrap to next row
      connectors.push({ x1: from.x + from.w / 2, y1: from.y + from.h, x2: to.x + to.w / 2, y2: to.y });
    }
  }

  // Branch connectors from for-review
  const frPos = positions['for-review'];
  BRANCH_IDS.forEach(bId => {
    const bPos = positions[bId];
    connectors.push({
      x1: frPos.x + frPos.w / 2,
      y1: frPos.y + frPos.h,
      x2: bPos.x + bPos.w / 2,
      y2: bPos.y,
      dashed: true,
    });
  });

  // Pan/zoom handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom(z => Math.max(0.2, Math.min(1.5, z - e.deltaY * 0.001)));
    } else {
      setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const resetView = () => { setZoom(0.55); setPan({ x: 0, y: 0 }); };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Recruitment Workflow</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Interactive node diagram — click any node for details. Scroll to pan, Ctrl+scroll to zoom.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.min(1.5, z + 0.1))}><ZoomIn className="w-4 h-4" /></Button>
          <span className="text-xs font-mono text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.max(0.2, z - 0.1))}><ZoomOut className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={resetView}><Maximize2 className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap bg-muted/30 rounded-lg border px-3 py-2">
        {Object.entries(TYPE_COLORS).map(([key, val]) => (
          <div key={key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <div className="w-3 h-3 rounded" style={{ background: val.bg }} />
            <span className="capitalize">{key === 'edge-fn' ? 'Edge Fn' : key}</span>
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="rounded-xl border-2 border-border bg-[#0c1220] overflow-hidden relative"
        style={{ height: 'calc(100vh - 260px)', cursor: isPanning ? 'grabbing' : 'default' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Grid pattern */}
        <svg width="100%" height="100%" className="absolute inset-0 pointer-events-none">
          <defs>
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1e293b" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        <svg
          width={svgW * zoom}
          height={svgH * zoom}
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="absolute"
          style={{ left: pan.x, top: pan.y }}
        >
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto" fill="#475569">
              <polygon points="0 0, 8 3, 0 6" />
            </marker>
          </defs>

          {/* Branch label */}
          <foreignObject x={PADDING} y={branchY - 30} width={200} height={24}>
            <div className="flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Branches</span>
            </div>
          </foreignObject>

          {/* Connectors */}
          {connectors.map((c, i) => (
            <StageConnector key={i} {...c} />
          ))}

          {/* Stage nodes */}
          {[...mainStages, ...branchStages].map(stage => {
            const pos = positions[stage.id];
            return (
              <StageNodeFO
                key={stage.id}
                stage={stage}
                x={pos.x}
                y={pos.y}
                w={pos.w}
                h={pos.h}
                onNodeClick={setSelectedNode}
              />
            );
          })}
        </svg>
      </div>

      {/* Detail panel */}
      {selectedNode && <NodeDetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />}
    </div>
  );
};
