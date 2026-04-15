import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import {
  FileText, Search, MessageCircle, Users, CheckCircle,
  Mail, Zap, Clock, Bot, AlertTriangle, Target, Presentation,
  Eye, Fingerprint, Upload, Brain, Database, Code, Globe,
  ScanSearch, Star, Calendar, UserCheck, ClipboardCheck,
  Shield, Mic, Bell, Send, RotateCw, Link2, MousePointerClick,
  X, ChevronDown, ChevronRight, Server, Webhook, Timer,
  GitBranch, ArrowRight, Workflow
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
  bgLight: string;
  description: string;
  automations: DetailNode[];
  dbOperations: DetailNode[];
  edgeFunctions: DetailNode[];
  emailActions: DetailNode[];
  outputs: DetailNode[];
  emailTriggers: string[];
}

// ─── Styles ─────────────────────────────────────────────────────

const TYPE_STYLES: Record<NodeType, { bg: string; iconBg: string; border: string; label: string }> = {
  ai:        { bg: 'bg-violet-500/5',  iconBg: 'bg-violet-500',  border: 'border-violet-500/20', label: 'AI' },
  email:     { bg: 'bg-blue-500/5',    iconBg: 'bg-blue-500',    border: 'border-blue-500/20',   label: 'Email' },
  system:    { bg: 'bg-amber-500/5',   iconBg: 'bg-amber-500',   border: 'border-amber-500/20',  label: 'System' },
  manual:    { bg: 'bg-emerald-500/5', iconBg: 'bg-emerald-500', border: 'border-emerald-500/20',label: 'Manual' },
  trigger:   { bg: 'bg-rose-500/5',    iconBg: 'bg-rose-500',    border: 'border-rose-500/20',   label: 'Trigger' },
  db:        { bg: 'bg-sky-500/5',     iconBg: 'bg-sky-500',     border: 'border-sky-500/20',    label: 'Database' },
  'edge-fn': { bg: 'bg-orange-500/5',  iconBg: 'bg-orange-500',  border: 'border-orange-500/20', label: 'Edge Fn' },
  cron:      { bg: 'bg-pink-500/5',    iconBg: 'bg-pink-500',    border: 'border-pink-500/20',   label: 'Cron Job' },
  rls:       { bg: 'bg-teal-500/5',    iconBg: 'bg-teal-500',    border: 'border-teal-500/20',   label: 'RLS' },
};

// ─── Full stage definitions ─────────────────────────────────────

const STAGES: StageDefinition[] = [
  {
    id: 'application',
    label: 'Application Submitted',
    shortLabel: 'Application',
    icon: FileText,
    color: 'bg-blue-500',
    bgLight: 'bg-blue-500/5',
    description: 'Candidate submits application via /apply/:slug job page or /talent-pool form.',
    automations: [
      { id: 'a1', label: 'Honeypot Spam Check', description: 'Hidden form field validates submission is not from a bot. RLS policy enforces honeypot_field IS NULL or empty.', type: 'rls', icon: Shield, details: ['RLS: (honeypot_field IS NULL) OR (honeypot_field = \'\')', 'Table: applicants_prescreen', 'Role: anon, authenticated'] },
      { id: 'a2', label: 'Required Fields Validation', description: 'RLS INSERT policy enforces full_name and email are non-empty before allowing insert.', type: 'rls', icon: ClipboardCheck, details: ['RLS: full_name IS NOT NULL AND email IS NOT NULL', 'Prevents empty submissions at database level'] },
      { id: 'a3', label: 'CV PDF Upload', description: 'PDF uploaded to cv-uploads storage bucket (private). File path: {job_id}/{uuid}.pdf', type: 'system', icon: Upload, details: ['Bucket: cv-uploads (private)', 'Format: PDF only', 'Path: {job_id}/{applicant_id}.pdf'] },
      { id: 'a4', label: 'Duplicate Detection', description: 'useApplicationHistory hook checks email + phone against existing records. Shows "Nx applied" badge.', type: 'system', icon: Fingerprint, details: ['Matches by: email OR phone', 'Phone cleaned: strip non-digits, min 7 chars', 'Module-level cache shared across instances'] },
      { id: 'a5', label: 'Source Tracking', description: 'Records job_source from URL params (referral, job board, direct link, talent pool).', type: 'system', icon: Link2, details: ['Field: job_source', 'Sources: Job board, referral, talent pool, direct'] },
      { id: 'a6', label: 'Device Type Detection', description: 'Captures device_type from user agent for analytics.', type: 'system', icon: Globe, details: ['Field: device_type', 'Used in analytics dashboard'] },
      { id: 'a7', label: 'IP Hashing', description: 'IP address hashed for analytics tracking without storing PII.', type: 'system', icon: Shield, details: ['Field: ip_hash', 'One-way hash, no raw IP stored'] },
    ],
    dbOperations: [
      { id: 'a-db1', label: 'INSERT applicants_prescreen', description: 'New row created with status "For Review", all pre-screening answers, and CV URL.', type: 'db', icon: Database, details: ['Default status: "For Review"', '30+ columns populated', 'total_score initially NULL'] },
    ],
    edgeFunctions: [
      { id: 'a-ef1', label: 'submit-application', description: 'Edge function handles form submission, file upload, and initial record creation.', type: 'edge-fn', icon: Server, details: ['Handles multipart form data', 'Validates PDF format', 'Returns applicant ID'] },
      { id: 'a-ef2', label: 'track-analytics', description: 'Fires analytics event for page_view and application_submit.', type: 'edge-fn', icon: Server, details: ['Event types: page_view, application_submit, job_view', 'Production only (no localhost)'] },
    ],
    emailActions: [],
    outputs: [
      { id: 'a-o1', label: 'Trigger: score-cv', description: 'After insert, score-cv edge function is called to process the CV with AI.', type: 'trigger', icon: Zap },
      { id: 'a-o2', label: 'Email: Application Received', description: 'Auto email sent after 5h delay confirming receipt.', type: 'email', icon: Mail, details: ['Template: "Application Received"', 'Delay: 5 hours', 'Trigger: application_received'] },
    ],
    emailTriggers: ['application_received'],
  },
  {
    id: 'ai-scoring',
    label: 'AI CV Scoring',
    icon: Brain,
    color: 'bg-violet-500',
    bgLight: 'bg-violet-500/5',
    description: 'AI automatically analyzes and scores the CV against job requirements. Runs immediately after application.',
    automations: [
      { id: 'b1', label: 'CV Text Extraction (Vision API)', description: 'extract-cv-with-vision edge function converts PDF pages to images, sends to Gemini Vision for OCR.', type: 'ai', icon: Eye, details: ['Model: google/gemini-2.5-flash', 'Input: PDF pages as images', 'Output: Full text extraction', 'Truncated to 50,000 chars max'] },
      { id: 'b2', label: 'Role Experience Scoring', description: 'AI evaluates years of relevant experience, job title alignment, and career progression.', type: 'ai', icon: Brain, details: ['Score range: 0-30', 'Factors: years, relevance, progression', 'Compared against job description'] },
      { id: 'b3', label: 'Skills & Tools Matching', description: 'Extracts skills and tools from CV text, matches against job requirements.', type: 'ai', icon: ScanSearch, details: ['Score range: 0-30', 'Populates: extracted_skills[], extracted_tools[]', 'Array fields for filtering'] },
      { id: 'b4', label: 'Availability & Setup Scoring', description: 'Evaluates pre-screening answers: timezone, internet speed, equipment, start date.', type: 'ai', icon: CheckCircle, details: ['Score range: 0-20', 'Fields: us_timezone_ok, power_backup, good_internet', 'laptop_or_pc, noise_canceling_headset'] },
      { id: 'b5', label: 'Red Flag / Bonus Detection', description: 'Identifies concerns (gaps, short tenures, overqualification) and bonuses (certifications, references).', type: 'ai', icon: AlertTriangle, details: ['Score range: -20 to +20', 'Negative = red flags', 'Positive = bonus indicators'] },
      { id: 'b6', label: 'Total Score Aggregation', description: 'Combines all 4 category scores into weighted total. Color-coded: ≥75 green, ≥50 amber, <50 red.', type: 'system', icon: ClipboardCheck, details: ['Formula: role_exp + skills + setup + bonus', 'Range: 0-100 (can go negative with red flags)', 'Stored in: total_score'] },
      { id: 'b7', label: 'AI Summary Generation', description: 'Generates concise text summary of candidate strengths and fit assessment.', type: 'ai', icon: FileText, details: ['Stored in: ai_summary', 'ai_assessment_details (JSON)', 'Used in candidate profile'] },
    ],
    dbOperations: [
      { id: 'b-db1', label: 'UPDATE applicants_prescreen', description: 'Updates scoring fields: total_score, role_experience_score, skills_tools_score, availability_setup_score, bonus_red_flag_score, extracted_skills, extracted_tools, cv_text, ai_summary.', type: 'db', icon: Database },
    ],
    edgeFunctions: [
      { id: 'b-ef1', label: 'score-cv', description: 'Primary scoring function. Calls extract-cv-with-vision first, then scores with Gemini.', type: 'edge-fn', icon: Server, details: ['Uses: LOVABLE_API_KEY', 'Model: google/gemini-2.5-flash', 'Called on: new application, manual rescore'] },
      { id: 'b-ef2', label: 'extract-cv-with-vision', description: 'Extracts text from PDF using Vision API for scanned/image-based CVs.', type: 'edge-fn', icon: Server, details: ['Fallback for non-text PDFs', 'Uses pdfjs for page rendering', 'Vision API for OCR'] },
      { id: 'b-ef3', label: 'rescore-cv', description: 'Manual rescore trigger. Admin clicks "Rescore CV" button to re-run AI analysis.', type: 'edge-fn', icon: Server, details: ['Triggered by: admin action', 'Re-extracts text and rescores', 'Truncates CV to 50K chars'] },
    ],
    emailActions: [],
    outputs: [
      { id: 'b-o1', label: 'Appears in For Review folder', description: 'Applicant now visible in admin dashboard with AI score badge and assessment.', type: 'trigger', icon: Zap },
    ],
    emailTriggers: [],
  },
  {
    id: 'for-review',
    label: 'For Review',
    icon: Search,
    color: 'bg-cyan-500',
    bgLight: 'bg-cyan-500/5',
    description: 'Admins review AI-scored applications. Default landing status for all new applicants.',
    automations: [
      { id: 'c1', label: 'Unviewed Badge ("New")', description: 'Applicants where details_viewed_at IS NULL show "New" badge. Count shown in tab header.', type: 'system', icon: Bell, details: ['Field: details_viewed_at', 'Initially NULL', 'Set on first detail view open'] },
      { id: 'c2', label: 'First View Timestamp', description: 'When admin opens applicant detail, details_viewed_at is set to now(). One-time only.', type: 'system', icon: Eye, details: ['UPDATE applicants_prescreen SET details_viewed_at = now()', 'Triggered by: CandidateDetailDialog open', 'Only if details_viewed_at IS NULL'] },
      { id: 'c3', label: 'Background CV Scan', description: '"Scan Unprocessed CVs" button finds up to 50 applicants with cv_file_url but NULL total_score, triggers score-cv.', type: 'system', icon: ScanSearch, details: ['Batch size: 50', 'Query: cv_file_url IS NOT NULL AND total_score IS NULL', 'Used for referrals/bulk imports'] },
      { id: 'c4', label: 'Star Candidate', description: 'Toggle is_starred boolean for quick filtering. Persisted in DB.', type: 'manual', icon: Star, details: ['Field: is_starred', 'Filterable in folder view', 'Visual: gold star icon'] },
    ],
    dbOperations: [
      { id: 'c-db1', label: 'Status History Trigger', description: 'DB function log_applicant_status_change() fires on UPDATE when status changes. Inserts audit row.', type: 'db', icon: Database, details: ['Function: log_applicant_status_change()', 'SECURITY DEFINER', 'Table: applicant_status_history', 'Records: from_status, to_status, changed_by (auth.uid())'] },
    ],
    edgeFunctions: [],
    emailActions: [],
    outputs: [
      { id: 'c-o1', label: 'Move to For Interview', description: 'Admin changes status. Triggers interview flow + status history log.', type: 'manual', icon: ArrowRight },
      { id: 'c-o2', label: 'Move to Reject', description: 'Not qualified. Triggers rejection email with configurable delay.', type: 'manual', icon: AlertTriangle },
      { id: 'c-o3', label: 'Move to Talent Pool', description: 'Good candidate but no matching role currently.', type: 'manual', icon: Target },
      { id: 'c-o4', label: 'Reprofile to Different Job', description: 'Change job_id, set reprofiled_at, store original_job_id and original_job_title.', type: 'manual', icon: RotateCw, details: ['Fields: original_job_id, original_job_title, reprofiled_at', 'Re-triggers CV scoring for new job'] },
    ],
    emailTriggers: [],
  },
  {
    id: 'for-interview',
    label: 'For Interview',
    icon: MessageCircle,
    color: 'bg-purple-500',
    bgLight: 'bg-purple-500/5',
    description: 'Candidates receive AI-powered interview invites. Multiple recruiter-specific templates available.',
    automations: [
      { id: 'd1', label: 'Auto Interview Invite Email', description: 'Default template sent with 0h delay on status change. Contains unique interview link.', type: 'email', icon: Send, details: ['Template: "For Interview"', 'Delay: 0h (also 5h default template)', 'Link: /interview/:applicantId'] },
      { id: 'd2', label: 'Recruiter-Specific Templates', description: '3 custom templates for Czarina, Kristine, and Eduardo — each sends from their Gmail.', type: 'email', icon: Mail, details: ['Czarina: custom_for_interview_1767973741693', 'Kristine: custom_for_interview_1767975154060', 'Eduardo: custom_for_interview_1767978478550', 'Each uses personal Gmail credentials'] },
      { id: 'd3', label: 'No-Show Reminder (Kristine)', description: 'If interview not started after 2 hours, automated reminder sent from Kristine.', type: 'email', icon: Clock, details: ['Template: "Interview - No Show"', 'Delay: 2 hours', 'Trigger: custom_for_interview_1772721969609'] },
    ],
    dbOperations: [
      { id: 'd-db1', label: 'INSERT interview_sessions', description: 'New session created with status "in_progress" when interview link is opened.', type: 'db', icon: Database, details: ['applicant_id, job_id linked', 'status: in_progress', 'started_at: now()'] },
    ],
    edgeFunctions: [
      { id: 'd-ef1', label: 'send-interview-invite', description: 'Sends the interview invitation email via Gmail SMTP.', type: 'edge-fn', icon: Server, details: ['Uses: GMAIL credentials (per recruiter)', 'Generates unique interview URL', 'Logs to email_logs table'] },
      { id: 'd-ef2', label: 'generate-interview-questions', description: 'AI generates role-specific questions: MCQ, text, and voice sections.', type: 'edge-fn', icon: Server, details: ['Model: google/gemini-2.5-flash', 'Sections: MCQ (5), Text (3-5), Voice (2-3)', 'Uses job description + CV data', 'Stores in: interview_questions'] },
      { id: 'd-ef3', label: 'process-interview-reminders', description: 'Cron job checks for sessions not started after 20min and 2hr. Sends reminder emails.', type: 'cron', icon: Timer, details: ['20-min check: reminder_sent_at IS NULL', '2-hr check: second_reminder_sent_at IS NULL', 'Updates: reminder_sent_at, second_reminder_sent_at'] },
    ],
    emailActions: [],
    outputs: [
      { id: 'd-o1', label: 'Candidate Opens Interview Link', description: 'Session begins. RLS allows anon access to active sessions < 24hr old.', type: 'trigger', icon: Zap, details: ['RLS: status = in_progress AND started_at > now() - 24hr', 'Applicant can view own questions via session'] },
    ],
    emailTriggers: ['for_interview'],
  },
  {
    id: 'ai-interview',
    label: 'AI Interview Assessment',
    shortLabel: 'AI Interview',
    icon: Bot,
    color: 'bg-violet-500',
    bgLight: 'bg-violet-500/5',
    description: 'Candidate completes AI interview. System scores responses across 5 dimensions.',
    automations: [
      { id: 'e1', label: 'Paste Detection & Logging', description: 'Monitors clipboard paste events during text questions. Pasted content stored separately.', type: 'system', icon: Shield, details: ['Fields: paste_detected (bool), pasted_content (text)', 'Highlighted in admin review with red badge', 'RLS: ai_score IS NULL on insert (prevents manipulation)'] },
      { id: 'e2', label: 'Voice Recording Capture', description: 'MediaRecorder API captures voice answers. Uploaded to voice-recordings bucket (public).', type: 'system', icon: Mic, details: ['Bucket: voice-recordings (public)', 'Format: audio/webm', 'Fields: voice_recording_url, voice_duration_seconds'] },
      { id: 'e3', label: 'MCQ Auto-Scoring', description: 'Multiple choice answers scored immediately against correct option.', type: 'system', icon: CheckCircle, details: ['Stored in: selected_option_id', 'Correct answer in: question.options JSON', 'Instant score calculation'] },
    ],
    dbOperations: [
      { id: 'e-db1', label: 'INSERT interview_answers', description: 'Each answer inserted individually as candidate progresses. RLS enforces active session.', type: 'db', icon: Database, details: ['RLS: session must be in_progress', 'ai_score must be NULL on insert', 'Prevents answer manipulation'] },
      { id: 'e-db2', label: 'UPDATE interview_sessions', description: 'On completion: status → completed, completed_at set, all score fields populated.', type: 'db', icon: Database, details: ['Fields updated: technical_score, experience_score,', 'communication_score, situational_score,', 'personality_score, overall_score,', 'ai_summary, ai_strengths[], ai_concerns[]'] },
    ],
    edgeFunctions: [
      { id: 'e-ef1', label: 'assess-interview', description: 'AI scores all answers using dynamic weighting. Generates summary, strengths, and concerns.', type: 'edge-fn', icon: Server, details: ['Model: google/gemini-2.5-flash', 'Dynamic weighting per question type', '5 dimensions: technical, experience, comm, situational, personality', 'Stores: ai_assessment_details (JSON)'] },
      { id: 'e-ef2', label: 'process-interview-reminders (admin notify)', description: 'After completion, notifies admin that interview results are ready for review.', type: 'cron', icon: Timer, details: ['Checks: completed_at IS NOT NULL AND admin_notified_at IS NULL', 'Triggered: 20min after completion', 'Updates: admin_notified_at'] },
    ],
    emailActions: [],
    outputs: [
      { id: 'e-o1', label: 'Admin moves to SIV', description: 'After reviewing interview results, admin advances to internal vetting.', type: 'manual', icon: ArrowRight },
    ],
    emailTriggers: [],
  },
  {
    id: 'siv',
    label: 'SIV (Internal Vetting)',
    shortLabel: 'SIV',
    icon: Search,
    color: 'bg-cyan-500',
    bgLight: 'bg-cyan-500/5',
    description: 'Structured Internal Vetting — recruiter reviews interview results and builds candidate profile.',
    automations: [
      { id: 'f1', label: 'Interview Score Dashboard', description: 'InterviewResultsView displays: overall score, 5 category scores, AI summary, strengths/concerns lists.', type: 'system', icon: ClipboardCheck, details: ['Component: InterviewResultsView', 'Color-coded scores: ≥70 green, ≥50 amber, <50 red', 'Expandable answer cards with AI feedback'] },
      { id: 'f2', label: 'Voice Playback', description: 'Admin can listen to voice recordings directly in the review panel.', type: 'system', icon: Mic, details: ['Public bucket: voice-recordings', 'HTML5 audio player', 'Duration displayed'] },
      { id: 'f3', label: 'Structured Notes System', description: 'NotesEditor with rich text (bold, italic, lists). Timestamped. Stored in applicant_notes table.', type: 'manual', icon: ClipboardCheck, details: ['Table: applicant_notes', 'Fields: content (HTML), created_by, applicant_id', 'Supports @mentions for admin notifications'] },
    ],
    dbOperations: [],
    edgeFunctions: [
      { id: 'f-ef1', label: 'send-mention-notification', description: 'When admin @mentions another admin in notes, sends Slack notification.', type: 'edge-fn', icon: Server, details: ['Trigger: @mention in note content', 'Channel: configured SLACK_CHANNEL', 'Uses: SLACK_API_KEY'] },
    ],
    emailActions: [
      { id: 'f-em1', label: 'SIV Default Email', description: 'Template for SIV stage. Currently used for client assessments.', type: 'email', icon: Mail, details: ['Template: "SIV" (status_trigger: siv)', 'Also: custom Healthspan assessment', 'Also: custom Bilingual Data Entry assessment'] },
    ],
    outputs: [
      { id: 'f-o1', label: 'Build Candidate Profile', description: 'CandidateProfileDialog: rich text editor for client-facing profile document.', type: 'manual', icon: FileText, details: ['Field: candidate_profile (HTML)', 'Additional profiles: candidate_additional_profiles table', 'Accessible via UserCircle icon shortcut'] },
      { id: 'f-o2', label: 'Move to Pitch', description: 'Candidate approved for client presentation.', type: 'manual', icon: ArrowRight },
    ],
    emailTriggers: ['siv'],
  },
  {
    id: 'pitch',
    label: 'Pitch to Client',
    shortLabel: 'Pitch',
    icon: Presentation,
    color: 'bg-fuchsia-500',
    bgLight: 'bg-fuchsia-500/5',
    description: 'Candidate profile presented to client for consideration. Manual stage.',
    automations: [],
    dbOperations: [
      { id: 'g-db1', label: 'Status history logged', description: 'DB trigger records transition to Pitch status with admin ID.', type: 'db', icon: Database },
    ],
    edgeFunctions: [],
    emailActions: [],
    outputs: [
      { id: 'g-o1', label: 'Share Candidate Profile', description: 'Admin sends profile doc to client contact via email.', type: 'manual', icon: Send },
      { id: 'g-o2', label: 'Schedule Introduction', description: 'Arrange initial call between candidate and client.', type: 'manual', icon: Calendar },
      { id: 'g-o3', label: 'Move to Client Interview', description: 'Client interested — formal interview stage.', type: 'manual', icon: ArrowRight },
    ],
    emailTriggers: [],
  },
  {
    id: 'client-interview',
    label: 'Client Interview',
    icon: Users,
    color: 'bg-orange-500',
    bgLight: 'bg-orange-500/5',
    description: 'Candidate interviews directly with the client. Calendly integration for scheduling.',
    automations: [
      { id: 'h1', label: 'Calendly Integration', description: 'OAuth-based Calendly connection for scheduling. Booking links embedded in interview invites.', type: 'system', icon: Calendar, details: ['OAuth: CALENDLY_CLIENT_ID, CALENDLY_CLIENT_SECRET', 'Edge function: calendly-auth', 'Callback page: /calendly-callback'] },
    ],
    dbOperations: [],
    edgeFunctions: [
      { id: 'h-ef1', label: 'calendly-auth', description: 'Handles OAuth token exchange for Calendly integration.', type: 'edge-fn', icon: Server },
    ],
    emailActions: [
      { id: 'h-em1', label: 'Client Interview Email (Kristine)', description: 'Custom template for client interview stage notifications.', type: 'email', icon: Mail, details: ['Template: "Client Interview - Kristine"', 'Trigger: custom_client_interview_1773421555042'] },
    ],
    outputs: [
      { id: 'h-o1', label: 'Move to Hired', description: 'Client approves — triggers HiredAssignmentDialog.', type: 'manual', icon: CheckCircle },
      { id: 'h-o2', label: 'Move to Bench', description: 'Good candidate, client wants to wait.', type: 'manual', icon: Clock },
      { id: 'h-o3', label: 'Move to Reject', description: 'Client declines candidate.', type: 'manual', icon: AlertTriangle },
    ],
    emailTriggers: [],
  },
  {
    id: 'hired',
    label: 'Hired',
    icon: CheckCircle,
    color: 'bg-emerald-500',
    bgLight: 'bg-emerald-500/5',
    description: 'Candidate hired. Contractor assignment created and enters post-hire pipeline.',
    automations: [
      { id: 'i1', label: 'HiredAssignmentDialog', description: 'Modal captures: client, job title, hourly rate, hours/week, start date, timesheet link, country, contact numbers.', type: 'system', icon: ClipboardCheck, details: ['Component: HiredAssignmentDialog', 'Required: client_id, applicant_id', 'Optional: hourly_rate, hours_per_week, start_date', 'timesheet_link, contact_number, emergency_number'] },
      { id: 'i2', label: 'Client is_hiring Update', description: 'DB trigger auto_disable_hiring_on_active_contractor() sets client.is_hiring = false.', type: 'db', icon: Database, details: ['Function: auto_disable_hiring_on_active_contractor()', 'Trigger: ON INSERT/UPDATE of contractor_assignments', 'Condition: NEW.status = "active"'] },
    ],
    dbOperations: [
      { id: 'i-db1', label: 'INSERT contractor_assignments', description: 'New contractor record with all assignment details.', type: 'db', icon: Database, details: ['Status: "active" (default)', 'Links: applicant_id, client_id', 'status_changed_at trigger updates on status change'] },
      { id: 'i-db2', label: 'INSERT contractor_pipeline_tracking', description: 'Auto-placed in Onboarding stage of post-hire pipeline.', type: 'db', icon: Database, details: ['current_stage_id: Onboarding stage', 'auto_moved: true', 'moved_at: now()'] },
    ],
    edgeFunctions: [],
    emailActions: [
      { id: 'i-em1', label: 'Hired Congratulations Email', description: 'Auto email sent with 5h delay congratulating the candidate.', type: 'email', icon: Mail, details: ['Template: "Hired"', 'Delay: 5 hours', 'Subject: "Congratulations - You\'re Hired!"'] },
      { id: 'i-em2', label: 'Candidate Successful Email', description: 'Additional success notification template.', type: 'email', icon: Mail, details: ['Template: "Candidate Successful - Passed Interview"', 'Trigger: custom_candidate_successful_1769782820599'] },
    ],
    outputs: [
      { id: 'i-o1', label: 'Enter Post-Hire Pipeline', description: 'Contractor appears in Client Pipeline Kanban board at Onboarding.', type: 'trigger', icon: Zap },
    ],
    emailTriggers: ['hired'],
  },
  {
    id: 'post-hire',
    label: 'Post-Hire Pipeline',
    shortLabel: 'Post-Hire',
    icon: Target,
    color: 'bg-teal-500',
    bgLight: 'bg-teal-500/5',
    description: 'Milestone-based tracking from Onboarding to Settled (120 days). 7 stages with auto-advance.',
    automations: [
      { id: 'j1', label: 'Auto-Advance (Daily Cron)', description: 'process-contractor-milestones runs daily. Checks days elapsed from start_date, moves to appropriate stage.', type: 'cron', icon: Timer, details: ['Edge fn: process-contractor-milestones', 'Stages: Onboarding(0d) → Week1(7d) → Week2(14d)', '→ Month1(30d) → Month2(60d) → Month3(90d) → Settled(120d)', 'Only moves forward, not backward'] },
      { id: 'j2', label: 'Client Check-in Emails', description: 'At each milestone, email sent to client primary contact asking about contractor performance.', type: 'email', icon: Send, details: ['Table: contractor_checkin_emails', 'Recipient: client primary contact email', 'Per-stage subjects configured', 'Logged with stage_id'] },
      { id: 'j3', label: 'Contractor Milestone Emails', description: 'Milestone-specific emails sent to the contractor (welcome, check-ins, reviews).', type: 'email', icon: Mail, details: ['Per-stage: contractor_email_subject, contractor_email_body', 'Week 1: "How\'s everything going?"', 'Month 1: "1 Month Milestone"', 'Month 3: "3 Month Review"'] },
      { id: 'j4', label: 'Drag-and-Drop Manual Override', description: 'Admin can drag contractor cards between stages on Kanban board for manual override.', type: 'manual', icon: Workflow, details: ['Component: PostHirePipelineKanban', 'Updates: current_stage_id, auto_moved=false', 'Grouped by client'] },
    ],
    dbOperations: [
      { id: 'j-db1', label: 'contractor_pipeline_stages (7 rows)', description: 'System-seeded milestone definitions with trigger_days and email templates.', type: 'db', icon: Database, details: ['🚀 Onboarding (0d)', '📋 Week 1 (7d)', '📊 Week 2 (14d)', '🎯 Month 1 (30d)', '📈 Month 2 (60d)', '⭐ Month 3 (90d)', '✅ Settled (120d)'] },
      { id: 'j-db2', label: 'UPDATE contractor_pipeline_tracking', description: 'current_stage_id updated, moved_at set, auto_moved flag toggled.', type: 'db', icon: Database },
    ],
    edgeFunctions: [
      { id: 'j-ef1', label: 'process-contractor-milestones', description: 'Daily cron: checks all active contractors, advances stages, sends check-in emails.', type: 'cron', icon: Timer, details: ['Joins: contractor_assignments + pipeline_tracking + stages', 'Calculates: days since start_date', 'Sends emails via Gmail SMTP', 'Uses: MARK_GMAIL credentials'] },
      { id: 'j-ef2', label: 'send-contractor-email', description: 'Manual email sending to contractors from the dashboard.', type: 'edge-fn', icon: Server },
      { id: 'j-ef3', label: 'send-checkin-email (manual)', description: 'Admin can manually trigger check-in email for any milestone.', type: 'edge-fn', icon: Server },
    ],
    emailActions: [],
    outputs: [
      { id: 'j-o1', label: 'Settled (120 days)', description: 'Contractor reaches final milestone. Fully onboarded and stable.', type: 'trigger', icon: CheckCircle },
    ],
    emailTriggers: [],
  },
  {
    id: 'reject',
    label: 'Reject',
    icon: AlertTriangle,
    color: 'bg-red-500',
    bgLight: 'bg-red-500/5',
    description: 'Candidates who did not meet requirements. Automated rejection email with configurable delay.',
    automations: [
      { id: 'k1', label: 'Rejection Email (17h delay)', description: 'Default rejection template sent 17 hours (1020 min) after status change.', type: 'email', icon: Send, details: ['Template: "Reject"', 'Delay: 1020 minutes (17 hours)', 'Subject: "Application Update - {{job_title}}"'] },
      { id: 'k2', label: 'Post-Interview Rejection (24h)', description: 'Separate template for candidates rejected after interviewing. 24h delay.', type: 'email', icon: Send, details: ['Template: "Rejected after interviewing"', 'Delay: 1440 minutes (24 hours)', 'Trigger: custom_reject_1774522978232'] },
      { id: 'k3', label: 'Status History Audit', description: 'DB trigger logs from_status → "Reject" transition with admin ID and timestamp.', type: 'db', icon: Database, details: ['Function: log_applicant_status_change()', 'Table: applicant_status_history', 'Immutable audit trail'] },
    ],
    dbOperations: [],
    edgeFunctions: [
      { id: 'k-ef1', label: 'process-scheduled-emails', description: 'Cron job processes delayed emails. Checks email_logs for pending emails past their scheduled time.', type: 'cron', icon: Timer, details: ['Processes all status-triggered emails', 'Respects delay_hours setting', 'Sends via Gmail SMTP'] },
    ],
    emailActions: [],
    outputs: [
      { id: 'k-o1', label: 'Reconsider', description: 'Admin can move candidate back to any pipeline stage. Status history logged.', type: 'manual', icon: RotateCw },
    ],
    emailTriggers: ['reject'],
  },
  {
    id: 'bench',
    label: 'Bench',
    icon: Clock,
    color: 'bg-amber-500',
    bgLight: 'bg-amber-500/5',
    description: 'Qualified candidates waiting for suitable placement. Availability tracking via magic links.',
    automations: [
      { id: 'l1', label: 'Availability Check Email', description: 'Magic-link email with "Available" / "Not Available" buttons. No login required.', type: 'email', icon: Send, details: ['Edge fn: send-availability-check', 'Generates: response_token (UUID)', 'Table: availability_responses', 'Buttons: hyperlinked with token + response'] },
      { id: 'l2', label: 'Response Handler', description: 'Edge function processes availability response. Updates applicant record.', type: 'system', icon: MousePointerClick, details: ['Edge fn: handle-availability-response', 'Updates: is_available (bool)', 'Updates: availability_checked_at', 'RLS: allows update where responded_at IS NULL'] },
      { id: 'l3', label: 'Availability Badge', description: 'Green badge = available, red = not available, no badge = not checked.', type: 'system', icon: CheckCircle, details: ['Visual: green/red badge on applicant card', 'Field: is_available', 'Timestamp: availability_checked_at'] },
      { id: 'l4', label: 'Check-in on Availability', description: 'Custom bench email template for periodic availability follow-ups.', type: 'email', icon: Mail, details: ['Template: "Check in on availability"', 'Trigger: custom_bench_1774664722027', 'Subject: "Quick Check-in on availability"'] },
    ],
    dbOperations: [
      { id: 'l-db1', label: 'availability_responses table', description: 'Tracks each availability check: token, response, timestamps.', type: 'db', icon: Database, details: ['RLS: public can UPDATE where responded_at IS NULL', 'Admin can SELECT all', 'Service role can INSERT'] },
    ],
    edgeFunctions: [
      { id: 'l-ef1', label: 'send-availability-check', description: 'Sends magic-link email with response buttons.', type: 'edge-fn', icon: Server },
      { id: 'l-ef2', label: 'handle-availability-response', description: 'Processes button click response, updates applicant.', type: 'edge-fn', icon: Server },
    ],
    emailActions: [],
    outputs: [
      { id: 'l-o1', label: 'Reprofile to New Role', description: 'ReprofilingDialog: change job_id, store originals, re-score CV.', type: 'manual', icon: RotateCw, details: ['Component: ReprofilingDialog', 'Stores: original_job_id, original_job_title', 'Sets: reprofiled_at = now()', 'Can trigger rescore for new job'] },
      { id: 'l-o2', label: 'Re-enter Pipeline', description: 'Move back to For Review or For Interview for matching role.', type: 'manual', icon: ArrowRight },
    ],
    emailTriggers: ['bench'],
  },
  {
    id: 'talent-pool',
    label: 'Talent Pool',
    icon: Target,
    color: 'bg-indigo-500',
    bgLight: 'bg-indigo-500/5',
    description: 'General pool for candidates without a specific role. AI matching and boolean search.',
    automations: [
      { id: 'm1', label: 'Talent Scout AI Matching', description: 'scout-talent edge function matches pool candidates against job descriptions. Ranks by fit.', type: 'ai', icon: Brain, details: ['Edge fn: scout-talent', 'Model: google/gemini-2.5-flash', 'Input: job description + candidate data', 'Output: ranked list with fit scores'] },
      { id: 'm2', label: 'Boolean Search Engine', description: 'Advanced search with AND/OR/NOT operators across skills, tools, CV text, job title, location.', type: 'system', icon: ScanSearch, details: ['Component: BooleanSearchBuilder', 'Parser: booleanSearchParser.ts', 'SQL-level filtering', 'Supports: quotes for exact phrases'] },
      { id: 'm3', label: 'Apollo.io Integration', description: 'External Scout tab: search Apollo for candidates, import into talent pool.', type: 'system', icon: Globe, details: ['Edge fn: search-apollo', 'Edge fn: resolve-apollo-linkedin', 'API key: APOLLO_API_KEY', 'Import to "Imports" sub-tab'] },
    ],
    dbOperations: [],
    edgeFunctions: [
      { id: 'm-ef1', label: 'scout-talent', description: 'AI-powered candidate matching against open jobs.', type: 'edge-fn', icon: Server },
      { id: 'm-ef2', label: 'search-apollo', description: 'External candidate search via Apollo.io API.', type: 'edge-fn', icon: Server },
    ],
    emailActions: [
      { id: 'm-em1', label: 'Reprofiling Notification', description: 'When reprofiled to a job, candidate receives notification about the new opportunity.', type: 'email', icon: Mail, details: ['Template: "Reprofiling"', 'Subject: "New Opportunity - Different Role"'] },
    ],
    outputs: [
      { id: 'm-o1', label: 'Reprofile to Active Job', description: 'Match found — move to specific job pipeline.', type: 'manual', icon: ArrowRight },
      { id: 'm-o2', label: 'Send Opportunity Email', description: 'Notify candidate about matching opportunity.', type: 'manual', icon: Send },
    ],
    emailTriggers: ['talent_pool'],
  },
];

const MAIN_FLOW = ['application', 'ai-scoring', 'for-review', 'for-interview', 'ai-interview', 'siv', 'pitch', 'client-interview', 'hired', 'post-hire'];
const BRANCH_IDS = ['reject', 'bench', 'talent-pool'];

// ─── Sub-components ─────────────────────────────────────────────

const DetailNodeCard = ({ node }: { node: DetailNode }) => {
  const [expanded, setExpanded] = useState(false);
  const styles = TYPE_STYLES[node.type];
  const Icon = node.icon;
  const hasDetails = node.details && node.details.length > 0;

  return (
    <div className={`rounded-lg border ${styles.border} ${styles.bg} transition-all`}>
      <button
        onClick={() => hasDetails && setExpanded(!expanded)}
        className={`w-full flex items-start gap-2.5 p-2.5 text-left ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className={`w-6 h-6 rounded-md ${styles.iconBg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
          <Icon className="w-3 h-3 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] font-semibold text-foreground leading-tight">{node.label}</p>
            <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 border-current opacity-60">
              {styles.label}
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{node.description}</p>
        </div>
        {hasDetails && (
          <div className="flex-shrink-0 mt-1">
            {expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
          </div>
        )}
      </button>
      {expanded && node.details && (
        <div className="px-2.5 pb-2.5 pt-0">
          <div className="bg-background/60 rounded-md p-2 space-y-0.5">
            {node.details.map((detail, i) => (
              <p key={i} className="text-[9px] text-muted-foreground font-mono leading-relaxed">
                {detail}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const MiniConnector = () => (
  <div className="flex justify-center py-0.5">
    <div className="w-0.5 h-2 bg-muted-foreground/15 rounded-full" />
  </div>
);

const SectionHeader = ({ icon: Icon, label, color, count }: { icon: React.ElementType; label: string; color: string; count: number }) => (
  <div className="flex items-center gap-2 mb-2">
    <div className={`w-5 h-5 rounded ${color} flex items-center justify-center`}>
      <Icon className="w-3 h-3 text-white" />
    </div>
    <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">{label}</span>
    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">{count}</Badge>
  </div>
);

const NodeList = ({ nodes }: { nodes: DetailNode[] }) => (
  <div className="space-y-1">
    {nodes.map((node, i) => (
      <div key={node.id}>
        <DetailNodeCard node={node} />
        {i < nodes.length - 1 && <MiniConnector />}
      </div>
    ))}
  </div>
);

// ─── Stage flow card ────────────────────────────────────────────

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
  const totalNodes = stage.automations.length + stage.dbOperations.length + stage.edgeFunctions.length + stage.emailActions.length + stage.outputs.length;

  return (
    <div className={`rounded-xl border-2 transition-all ${isExpanded ? `${stage.color.replace('bg-', 'border-')} shadow-lg` : 'border-border hover:border-primary/20'}`}>
      {/* Header */}
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-3.5 text-left">
        <div className={`w-10 h-10 rounded-xl ${stage.color} flex items-center justify-center shadow flex-shrink-0`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-foreground">{stage.label}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{stage.description}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Badge variant="outline" className="text-[9px] gap-0.5 px-1.5 py-0.5 h-5">
            <Zap className="w-2.5 h-2.5" /> {totalNodes}
          </Badge>
          {matchedTemplates.length > 0 && (
            <Badge variant="outline" className="text-[9px] gap-0.5 px-1.5 py-0.5 h-5">
              <Mail className="w-2.5 h-2.5" /> {matchedTemplates.length}
            </Badge>
          )}
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3.5 pb-4 pt-0 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {/* Column 1: Automations + DB */}
            <div className="space-y-4">
              {stage.automations.length > 0 && (
                <div>
                  <SectionHeader icon={Zap} label="Automations" color="bg-amber-500" count={stage.automations.length} />
                  <NodeList nodes={stage.automations} />
                </div>
              )}
              {stage.dbOperations.length > 0 && (
                <div>
                  <SectionHeader icon={Database} label="Database Operations" color="bg-sky-500" count={stage.dbOperations.length} />
                  <NodeList nodes={stage.dbOperations} />
                </div>
              )}
            </div>

            {/* Column 2: Edge Functions + Emails */}
            <div className="space-y-4">
              {stage.edgeFunctions.length > 0 && (
                <div>
                  <SectionHeader icon={Server} label="Edge Functions / Crons" color="bg-orange-500" count={stage.edgeFunctions.length} />
                  <NodeList nodes={stage.edgeFunctions} />
                </div>
              )}
              {(stage.emailActions.length > 0 || matchedTemplates.length > 0) && (
                <div>
                  <SectionHeader icon={Mail} label="Email Templates" color="bg-blue-500" count={stage.emailActions.length + matchedTemplates.length} />
                  <div className="space-y-1">
                    {stage.emailActions.map((ea, i) => (
                      <div key={ea.id}>
                        <DetailNodeCard node={ea} />
                        {(i < stage.emailActions.length - 1 || matchedTemplates.length > 0) && <MiniConnector />}
                      </div>
                    ))}
                    {matchedTemplates.map((tpl, i) => (
                      <div key={tpl.id}>
                        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-md bg-blue-500 flex items-center justify-center flex-shrink-0">
                              <Mail className="w-3 h-3 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-[11px] font-semibold text-foreground truncate">{tpl.name || tpl.subject}</p>
                                <Badge variant={tpl.is_enabled ? 'default' : 'secondary'} className="text-[8px] px-1 py-0 h-3.5">
                                  {tpl.is_enabled ? 'Active' : 'Off'}
                                </Badge>
                              </div>
                              <p className="text-[9px] text-muted-foreground truncate mt-0.5">{tpl.subject}</p>
                              {tpl.delay_hours != null && tpl.delay_hours > 0 && (
                                <p className="text-[9px] text-amber-600 flex items-center gap-0.5 mt-0.5">
                                  <Clock className="w-2.5 h-2.5" /> {tpl.delay_hours >= 60 ? `${Math.round(tpl.delay_hours / 60)}h` : `${tpl.delay_hours}min`} delay
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        {i < matchedTemplates.length - 1 && <MiniConnector />}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Column 3: Outputs */}
            <div>
              <SectionHeader icon={GitBranch} label="Outputs & Next Steps" color="bg-emerald-500" count={stage.outputs.length} />
              <NodeList nodes={stage.outputs} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Flow navigation ────────────────────────────────────────────

const FlowPill = ({ stage, isActive, onClick }: { stage: StageDefinition; isActive: boolean; onClick: () => void }) => {
  const Icon = stage.icon;
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-all text-[10px] font-semibold whitespace-nowrap
        ${isActive ? `${stage.color.replace('bg-', 'border-')} border-2 bg-card shadow-md` : 'border-border bg-card/50 hover:bg-card'}`}
    >
      <div className={`w-5 h-5 rounded ${stage.color} flex items-center justify-center`}>
        <Icon className="w-3 h-3 text-white" />
      </div>
      <span className={isActive ? 'text-foreground' : 'text-muted-foreground'}>{stage.shortLabel || stage.label}</span>
    </button>
  );
};

// ─── Main component ─────────────────────────────────────────────

export const WorkflowBoard = () => {
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);

  useEffect(() => {
    supabase
      .from('email_templates')
      .select('id, name, subject, status_trigger, is_enabled, delay_hours')
      .order('template_order', { ascending: true })
      .then(({ data }) => { if (data) setEmailTemplates(data as EmailTemplate[]); });
  }, []);

  const scrollToStage = (id: string) => {
    setExpandedStage(expandedStage === id ? null : id);
    setTimeout(() => {
      document.getElementById(`stage-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Recruitment Workflow</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Complete breakdown of every automation, database trigger, edge function, email template, and manual action per stage.
        </p>
      </div>

      {/* Flow nav + legend */}
      <div className="bg-muted/30 rounded-xl border p-3 space-y-2.5">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {MAIN_FLOW.map((id, i) => {
            const stage = STAGES.find(s => s.id === id)!;
            return (
              <div key={id} className="flex items-center">
                <FlowPill stage={stage} isActive={expandedStage === id} onClick={() => scrollToStage(id)} />
                {i < MAIN_FLOW.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground/30 mx-0.5 flex-shrink-0" />}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2 pl-1">
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold">Branches:</span>
          {BRANCH_IDS.map(id => {
            const stage = STAGES.find(s => s.id === id)!;
            return <FlowPill key={id} stage={stage} isActive={expandedStage === id} onClick={() => scrollToStage(id)} />;
          })}
        </div>
        <div className="flex items-center gap-3 pt-2 border-t border-border/50 flex-wrap">
          {Object.entries(TYPE_STYLES).map(([key, val]) => (
            <div key={key} className="flex items-center gap-1 text-[9px] text-muted-foreground">
              <div className={`w-2.5 h-2.5 rounded ${val.iconBg}`} />
              {val.label}
            </div>
          ))}
        </div>
      </div>

      {/* Stage cards */}
      <div className="space-y-2.5">
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
