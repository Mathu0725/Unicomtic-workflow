-- ==============================================================================
-- Unicom TIC Student Lifecycle Management Platform
-- Migration 004: Dynamic Custom Forms, Form Duplication, Google Sheets & Automation
-- ==============================================================================

CREATE TABLE IF NOT EXISTS custom_forms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL DEFAULT 'registration' CHECK (type IN ('registration', 'application', 'workshop_rsvp', 'custom')),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    google_sheets_config JSONB DEFAULT '{
        "enabled": false,
        "sheet_id": "",
        "sheet_name": "Sheet1",
        "auto_sync": true
    }'::jsonb,
    email_automation JSONB DEFAULT '{
        "enabled": true,
        "send_applicant_email": true,
        "applicant_subject": "Registration Received - Unicom TIC {{reference_no}}",
        "applicant_body_html": "<p>Dear {{fullName}}, your submission has been received.</p>",
        "send_admin_notification": false,
        "admin_emails": ["admissions@unicomtic.org"],
        "admin_subject": "New Form Submission Received: {{title}}"
    }'::jsonb,
    confirmation_message TEXT DEFAULT 'Thank you for your submission. Your application reference has been generated.',
    redirect_url TEXT,
    submissions_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_forms_slug ON custom_forms(slug);
CREATE INDEX IF NOT EXISTS idx_custom_forms_type ON custom_forms(type);

-- Submissions table for dynamic forms
CREATE TABLE IF NOT EXISTS form_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    form_id UUID REFERENCES custom_forms(id) ON DELETE CASCADE,
    reference_no VARCHAR(50) UNIQUE NOT NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    synced_to_sheet BOOLEAN DEFAULT FALSE,
    email_sent BOOLEAN DEFAULT FALSE,
    ip_address VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_form_id ON form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_ref ON form_submissions(reference_no);

-- RLS Policies
ALTER TABLE custom_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active forms" ON custom_forms
    FOR SELECT USING (is_active = TRUE);

CREATE POLICY "Public can insert form submissions" ON form_submissions
    FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Admins full access on custom_forms" ON custom_forms
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Admins full access on form_submissions" ON form_submissions
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Service role full access on custom_forms" ON custom_forms
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Service role full access on form_submissions" ON form_submissions
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
