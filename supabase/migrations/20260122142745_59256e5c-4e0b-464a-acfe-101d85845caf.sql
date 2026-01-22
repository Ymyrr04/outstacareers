-- Add indexes for faster query performance

-- applicants_prescreen indexes (most queried table)
CREATE INDEX IF NOT EXISTS idx_applicants_status ON applicants_prescreen(status);
CREATE INDEX IF NOT EXISTS idx_applicants_job_id ON applicants_prescreen(job_id);
CREATE INDEX IF NOT EXISTS idx_applicants_created_at ON applicants_prescreen(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applicants_job_status ON applicants_prescreen(job_id, status);

-- contractor_assignments indexes
CREATE INDEX IF NOT EXISTS idx_contractors_client_id ON contractor_assignments(client_id);
CREATE INDEX IF NOT EXISTS idx_contractors_status ON contractor_assignments(status);
CREATE INDEX IF NOT EXISTS idx_contractors_applicant_id ON contractor_assignments(applicant_id);

-- client_hiring_requests indexes (Kanban board)
CREATE INDEX IF NOT EXISTS idx_hiring_requests_pipeline_stage ON client_hiring_requests(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_hiring_requests_assigned_admin ON client_hiring_requests(assigned_admin_id);

-- email_logs indexes (communication history)
CREATE INDEX IF NOT EXISTS idx_email_logs_applicant_id ON email_logs(applicant_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at DESC);

-- interview_sessions indexes
CREATE INDEX IF NOT EXISTS idx_interview_sessions_applicant_id ON interview_sessions(applicant_id);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_status ON interview_sessions(status);