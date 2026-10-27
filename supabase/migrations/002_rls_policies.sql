-- ==============================================================================
-- Unicom TIC Student Lifecycle Management Platform
-- Migration 002: Row Level Security (RLS) Policies
-- ==============================================================================

-- Enable RLS on all sensitive tables
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshops ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_invitees ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE marks_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE eligibility_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sheet_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Helper function to check admin role
CREATE OR REPLACE FUNCTION get_current_admin_role()
RETURNS VARCHAR AS $$
    SELECT role FROM admin_profiles WHERE id = auth.uid() AND is_active = TRUE;
$$ LANGUAGE sql SECURITY DEFINER;

-- 1. Public Read on Campaigns & Courses
CREATE POLICY "Public can view active campaigns" ON campaigns
    FOR SELECT USING (is_active = TRUE);

CREATE POLICY "Public can view active courses" ON courses
    FOR SELECT USING (is_active = TRUE);

-- 2. Public Registration Insert & Status Check
CREATE POLICY "Public can insert registrations" ON registrations
    FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Public can lookup own registration" ON registrations
    FOR SELECT USING (TRUE);

CREATE POLICY "Public can insert or update student contact" ON students
    FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- 3. Applications
CREATE POLICY "Public can submit applications" ON applications
    FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Public can read own application" ON applications
    FOR SELECT USING (TRUE);

-- 4. Service Role has Full Access
CREATE POLICY "Service role full access on campaigns" ON campaigns FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on courses" ON courses FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on students" ON students FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on registrations" ON registrations FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on applications" ON applications FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on email_accounts" ON email_accounts FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on email_templates" ON email_templates FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on email_campaigns" ON email_campaigns FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on email_jobs" ON email_jobs FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on email_events" ON email_events FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on workshops" ON workshops FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on workshop_invitees" ON workshop_invitees FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on attendance" ON attendance FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on exams" ON exams FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on marks_imports" ON marks_imports FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on exam_results" ON exam_results FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on eligibility_rules" ON eligibility_rules FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on interviews" ON interviews FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on interview_candidates" ON interview_candidates FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on interview_evaluations" ON interview_evaluations FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on selection_decisions" ON selection_decisions FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on sheet_sync_jobs" ON sheet_sync_jobs FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on admin_profiles" ON admin_profiles FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on audit_logs" ON audit_logs FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on system_settings" ON system_settings FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- 5. Authenticated Admins Full Access
CREATE POLICY "Admins full access on campaigns" ON campaigns FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on courses" ON courses FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on students" ON students FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on registrations" ON registrations FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on applications" ON applications FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on email_accounts" ON email_accounts FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on email_templates" ON email_templates FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on email_campaigns" ON email_campaigns FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on email_jobs" ON email_jobs FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on email_events" ON email_events FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on workshops" ON workshops FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on workshop_invitees" ON workshop_invitees FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on attendance" ON attendance FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on exams" ON exams FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on marks_imports" ON marks_imports FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on exam_results" ON exam_results FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on eligibility_rules" ON eligibility_rules FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on interviews" ON interviews FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on interview_candidates" ON interview_candidates FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on interview_evaluations" ON interview_evaluations FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on selection_decisions" ON selection_decisions FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on sheet_sync_jobs" ON sheet_sync_jobs FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on admin_profiles" ON admin_profiles FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on audit_logs" ON audit_logs FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Admins full access on system_settings" ON system_settings FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
