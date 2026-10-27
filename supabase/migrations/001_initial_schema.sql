-- ==============================================================================
-- Unicom TIC Student Lifecycle Management Platform
-- Migration 001: Initial Schema
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Campaigns & Courses
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    academic_year VARCHAR(20) NOT NULL,
    description TEXT,
    auto_invite_applications BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    capacity INT DEFAULT 50,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(campaign_id, code)
);

-- 2. Students & Canonical Identity
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(255) NOT NULL,
    name_with_initials VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(30) NOT NULL,
    whatsapp VARCHAR(30),
    nic VARCHAR(30) UNIQUE,
    nic_last_four VARCHAR(4) GENERATED ALWAYS AS (RIGHT(nic, 4)) STORED,
    gender VARCHAR(20),
    dob DATE,
    address TEXT,
    district VARCHAR(100) NOT NULL,
    province VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_email ON students(email);
CREATE INDEX IF NOT EXISTS idx_students_phone ON students(phone);
CREATE INDEX IF NOT EXISTS idx_students_nic ON students(nic);
CREATE INDEX IF NOT EXISTS idx_students_nic_last4 ON students(nic_last_four);
CREATE INDEX IF NOT EXISTS idx_students_district ON students(district);

-- 3. Registrations (Stage 1)
CREATE TABLE IF NOT EXISTS registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference_no VARCHAR(50) UNIQUE NOT NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE RESTRICT,
    student_id UUID REFERENCES students(id) ON DELETE RESTRICT,
    terms_accepted BOOLEAN NOT NULL DEFAULT TRUE,
    terms_version VARCHAR(20) NOT NULL DEFAULT 'v1.0',
    terms_accepted_at TIMESTAMPTZ DEFAULT NOW(),
    source VARCHAR(100) DEFAULT 'unicomtic_portal',
    status VARCHAR(50) DEFAULT 'registered' CHECK (status IN ('registered', 'invited', 'applied', 'cancelled')),
    ip_address VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(campaign_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_registrations_ref ON registrations(reference_no);
CREATE INDEX IF NOT EXISTS idx_registrations_campaign ON registrations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);

-- 4. Applications (Stage 3)
CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_no VARCHAR(50) UNIQUE NOT NULL,
    registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
    student_id UUID REFERENCES students(id) ON DELETE RESTRICT,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE RESTRICT,
    course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
    ol_results JSONB DEFAULT '{}'::jsonb,
    al_results JSONB DEFAULT '{}'::jsonb,
    higher_education JSONB DEFAULT '{}'::jsonb,
    emergency_contact JSONB DEFAULT '{}'::jsonb,
    statement_of_purpose TEXT,
    status VARCHAR(50) DEFAULT 'submitted' CHECK (status IN ('invited', 'started', 'submitted', 'under_review', 'withdrawn', 'approved', 'rejected')),
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    review_notes TEXT,
    reviewer_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(campaign_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_applications_app_no ON applications(application_no);
CREATE INDEX IF NOT EXISTS idx_applications_campaign ON applications(campaign_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);

-- 5. Email Configuration & Bulk Engine (Stage 2, 5, 6, 11, 12)
CREATE TABLE IF NOT EXISTS email_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    host VARCHAR(255) NOT NULL,
    port INT NOT NULL DEFAULT 587,
    secure BOOLEAN DEFAULT FALSE,
    username VARCHAR(255) NOT NULL,
    password_encrypted TEXT NOT NULL,
    from_name VARCHAR(255) NOT NULL,
    from_email VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    variables JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    template_id UUID REFERENCES email_templates(id) ON DELETE RESTRICT,
    email_account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    filter_criteria JSONB DEFAULT '{}'::jsonb,
    total_recipients INT DEFAULT 0,
    sent_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'sending', 'completed', 'paused', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    email_campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
    student_id UUID REFERENCES students(id) ON DELETE SET NULL,
    recipient_email VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(255),
    subject VARCHAR(255) NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    status VARCHAR(50) DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'retrying')),
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    error_message TEXT,
    message_id VARCHAR(255),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_jobs_status ON email_jobs(status);
CREATE INDEX IF NOT EXISTS idx_email_jobs_campaign ON email_jobs(email_campaign_id);

CREATE TABLE IF NOT EXISTS email_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email_job_id UUID REFERENCES email_jobs(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Workshop Management & Entrance Attendance Desk (Stage 5 & 6)
CREATE TABLE IF NOT EXISTS workshops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    venue VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    google_maps_url TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    reminder_schedule JSONB DEFAULT '{"days_before": [3, 1]}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workshop_invitees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workshop_id UUID REFERENCES workshops(id) ON DELETE CASCADE,
    student_id UUID REFERENCES students(id) ON DELETE RESTRICT,
    registration_id UUID REFERENCES registrations(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'invited' CHECK (status IN ('invited', 'confirmed', 'declined')),
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    reminder_sent_count INT DEFAULT 0,
    last_reminder_at TIMESTAMPTZ,
    UNIQUE(workshop_id, student_id)
);

CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workshop_id UUID REFERENCES workshops(id) ON DELETE CASCADE,
    student_id UUID REFERENCES students(id) ON DELETE RESTRICT,
    status VARCHAR(50) DEFAULT 'attended' CHECK (status IN ('attended', 'absent', 'late', 'excused')),
    student_exam_id VARCHAR(50) NOT NULL,
    marked_by VARCHAR(255) NOT NULL,
    marked_at TIMESTAMPTZ DEFAULT NOW(),
    verification_method VARCHAR(50) DEFAULT 'nic_last4',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workshop_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_student_exam_id ON attendance(student_exam_id);
CREATE INDEX IF NOT EXISTS idx_attendance_workshop ON attendance(workshop_id);

-- 7. Examination Management & OMR / Google Forms Import (Stage 7, 8, 9)
CREATE TABLE IF NOT EXISTS exams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    workshop_id UUID REFERENCES workshops(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    exam_date TIMESTAMPTZ NOT NULL,
    max_marks NUMERIC(6, 2) NOT NULL DEFAULT 100.00,
    pass_mark NUMERIC(6, 2) NOT NULL DEFAULT 50.00,
    weightage NUMERIC(5, 2) DEFAULT 100.00,
    requires_workshop_attendance BOOLEAN DEFAULT TRUE,
    status VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'imported')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marks_imports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL CHECK (file_type IN ('omr_csv', 'omr_xlsx', 'google_forms', 'manual')),
    total_rows INT DEFAULT 0,
    matched_rows INT DEFAULT 0,
    unmatched_rows INT DEFAULT 0,
    duplicate_rows INT DEFAULT 0,
    imported_by VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'preview' CHECK (status IN ('preview', 'committed', 'rolled_back')),
    raw_preview JSONB DEFAULT '[]'::jsonb,
    error_summary JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
    marks_import_id UUID REFERENCES marks_imports(id) ON DELETE SET NULL,
    student_id UUID REFERENCES students(id) ON DELETE RESTRICT,
    student_exam_id VARCHAR(50) NOT NULL,
    raw_score NUMERIC(6, 2) NOT NULL,
    calculated_score NUMERIC(6, 2) NOT NULL,
    is_passed BOOLEAN DEFAULT FALSE,
    anomalies JSONB DEFAULT '[]'::jsonb,
    score_history JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(exam_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_results_student_exam_id ON exam_results(student_exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_passed ON exam_results(is_passed);

-- 8. Eligibility Rules & Shortlisting (Stage 10)
CREATE TABLE IF NOT EXISTS eligibility_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    min_exam_score NUMERIC(6, 2) DEFAULT 50.00,
    require_application_complete BOOLEAN DEFAULT TRUE,
    require_workshop_attendance BOOLEAN DEFAULT TRUE,
    max_shortlist_count INT,
    district_quotas JSONB DEFAULT '{}'::jsonb,
    tie_break_rule VARCHAR(100) DEFAULT 'higher_al_results',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Interview Management (Stage 11)
CREATE TABLE IF NOT EXISTS interviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    date TIMESTAMPTZ NOT NULL,
    venue VARCHAR(255) NOT NULL,
    meeting_url TEXT,
    panel_members JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interview_candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interview_id UUID REFERENCES interviews(id) ON DELETE CASCADE,
    student_id UUID REFERENCES students(id) ON DELETE RESTRICT,
    time_slot TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) DEFAULT 'invited' CHECK (status IN ('invited', 'confirmed', 'attended', 'absent', 'cancelled')),
    invitation_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(interview_id, student_id)
);

CREATE TABLE IF NOT EXISTS interview_evaluations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interview_candidate_id UUID REFERENCES interview_candidates(id) ON DELETE CASCADE,
    interviewer_id VARCHAR(255) NOT NULL,
    interviewer_name VARCHAR(255) NOT NULL,
    communication_score NUMERIC(4, 1) DEFAULT 0,
    technical_score NUMERIC(4, 1) DEFAULT 0,
    analytical_score NUMERIC(4, 1) DEFAULT 0,
    overall_score NUMERIC(4, 1) DEFAULT 0,
    recommendation VARCHAR(50) CHECK (recommendation IN ('strongly_recommend', 'recommend', 'neutral', 'not_recommended')),
    notes TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(interview_candidate_id, interviewer_id)
);

-- 10. Final Selection Decisions & Notifications (Stage 12)
CREATE TABLE IF NOT EXISTS selection_decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    student_id UUID REFERENCES students(id) ON DELETE RESTRICT,
    final_status VARCHAR(50) NOT NULL CHECK (final_status IN ('selected', 'waiting_list', 'unsuccessful', 'withdrawn', 'pending_decision')),
    rank INT,
    composite_score NUMERIC(6, 2),
    approved_by VARCHAR(255) NOT NULL,
    approved_at TIMESTAMPTZ DEFAULT NOW(),
    notification_status VARCHAR(50) DEFAULT 'pending' CHECK (notification_status IN ('pending', 'sent', 'failed')),
    notified_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(campaign_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_selection_status ON selection_decisions(final_status);

-- 11. Google Sheets Synchronization Log & Outbox
CREATE TABLE IF NOT EXISTS sheet_sync_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sync_type VARCHAR(50) NOT NULL CHECK (sync_type IN ('registrations', 'applications')),
    sheet_id VARCHAR(255),
    total_synced INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'syncing', 'success', 'failed')),
    error_message TEXT,
    triggered_by VARCHAR(255) DEFAULT 'system_cron',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Admin Profiles & Roles
CREATE TABLE IF NOT EXISTS admin_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'examiner', 'entrance_staff')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Audit Logs (Consequential administrative changes)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    user_email VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_name VARCHAR(100) NOT NULL,
    entity_id VARCHAR(255),
    changes JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_name, entity_id);

-- 14. System Settings
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
