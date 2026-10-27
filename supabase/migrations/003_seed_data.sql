-- ==============================================================================
-- Unicom TIC Student Lifecycle Management Platform
-- Migration 003: Seed Data & Default Templates
-- ==============================================================================

-- 1. Default Active Campaign
INSERT INTO campaigns (id, code, title, academic_year, description, auto_invite_applications, is_active, start_date, end_date)
VALUES (
    'c0000000-0000-0000-0000-000000000001',
    'TIC-2025',
    'Unicom TIC 2025 Advanced Diploma & Graduate Intake',
    '2025/2026',
    'Flagship technology training and vocational qualification intake for secondary and tertiary students across Sri Lanka.',
    TRUE,
    TRUE,
    '2025-01-01',
    '2025-12-31'
) ON CONFLICT (code) DO NOTHING;

-- 2. Default Courses
INSERT INTO courses (id, campaign_id, code, name, description, capacity, is_active)
VALUES 
    ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'FS-DEV', 'Software Engineering & Full Stack Web Development', 'Comprehensive modern web stack, Next.js, Node.js, PostgreSQL and Cloud deployment.', 60, TRUE),
    ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'CYBER-SEC', 'Cybersecurity, Ethical Hacking & Infrastructure', 'Network defense, penetration testing, SIEM operations and security compliance.', 40, TRUE),
    ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'DATA-AI', 'Data Engineering, Machine Learning & AI Applications', 'Applied data pipelines, analytics, generative AI tools and automation.', 40, TRUE)
ON CONFLICT (campaign_id, code) DO NOTHING;

-- 3. Default Email Templates
INSERT INTO email_templates (code, name, subject, body_html, body_text, variables)
VALUES 
(
    'registration_confirmation',
    'Registration Confirmation',
    'Registration Confirmed - Unicom TIC {{campaign_title}} [{{reference_no}}]',
    '<html><body style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
        <div style="max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="background-color: #026ac9; padding: 16px; border-radius: 6px; text-align: center; color: white;">
                <h2 style="margin: 0;">Unicom TIC Student Portal</h2>
            </div>
            <p style="margin-top: 24px;">Dear <strong>{{student_name}}</strong>,</p>
            <p>Thank you for registering with Unicom TIC for the <strong>{{campaign_title}}</strong>. Your registration has been received successfully.</p>
            <div style="background-color: #f1f5f9; padding: 16px; border-radius: 6px; margin: 20px 0;">
                <p style="margin: 0;"><strong>Registration Reference:</strong> <span style="font-size: 18px; color: #026ac9; font-weight: bold;">{{reference_no}}</span></p>
                <p style="margin: 8px 0 0 0;"><strong>Registered District:</strong> {{district}}</p>
                <p style="margin: 8px 0 0 0;"><strong>Status:</strong> Registered</p>
            </div>
            <p>Please keep this reference number safe. You will need it to track your application and workshop details.</p>
            <p>Our team will notify you regarding the next steps and application submission instructions.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="font-size: 12px; color: #64748b;">Unicom TIC Admissions Team &bull; admissions@unicomtic.org &bull; www.unicomtic.org</p>
        </div>
    </body></html>',
    'Dear {{student_name}},\n\nThank you for registering with Unicom TIC for {{campaign_title}}.\nYour Registration Reference: {{reference_no}}\nDistrict: {{district}}\n\nPlease retain this reference for all future communications.\n\nUnicom TIC Admissions Team',
    '["student_name", "campaign_title", "reference_no", "district"]'::jsonb
),
(
    'application_invitation',
    'Application Invitation',
    'Action Required: Complete Your Unicom TIC Application [{{reference_no}}]',
    '<html><body style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
        <div style="max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="background-color: #026ac9; padding: 16px; border-radius: 6px; text-align: center; color: white;">
                <h2 style="margin: 0;">Unicom TIC Application Stage</h2>
            </div>
            <p style="margin-top: 24px;">Dear <strong>{{student_name}}</strong>,</p>
            <p>Congratulations! You are invited to complete your formal application for <strong>{{campaign_title}}</strong>.</p>
            <p>To proceed with your admission and workshop slot reservation, please fill out the official application form using the button below:</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="{{application_url}}" style="background-color: #026ac9; color: white; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 6px; display: inline-block;">Complete Application Form</a>
            </div>
            <p>Your unique application reference: <strong>{{reference_no}}</strong></p>
            <p>Please have your G.C.E. O/L and A/L educational results ready before starting the form.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="font-size: 12px; color: #64748b;">Unicom TIC Admissions Team &bull; admissions@unicomtic.org</p>
        </div>
    </body></html>',
    'Dear {{student_name}},\n\nYou are invited to complete your formal application for {{campaign_title}}.\nComplete your application here: {{application_url}}\nYour Reference: {{reference_no}}\n\nUnicom TIC Admissions Team',
    '["student_name", "campaign_title", "application_url", "reference_no"]'::jsonb
),
(
    'workshop_invitation',
    'Workshop & Entrance Orientation Invitation',
    'Invitation: Unicom TIC Workshop & Entrance Session - {{workshop_title}}',
    '<html><body style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
        <div style="max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="background-color: #074885; padding: 16px; border-radius: 6px; text-align: center; color: white;">
                <h2 style="margin: 0;">Workshop & Assessment Session</h2>
            </div>
            <p style="margin-top: 24px;">Dear <strong>{{student_name}}</strong>,</p>
            <p>You are scheduled to attend the following workshop and evaluation session for <strong>{{campaign_title}}</strong>:</p>
            <div style="background-color: #f8fafc; border-left: 4px solid #026ac9; padding: 16px; margin: 20px 0;">
                <p style="margin: 0;"><strong>Workshop:</strong> {{workshop_title}}</p>
                <p style="margin: 8px 0 0 0;"><strong>Date & Time:</strong> {{workshop_datetime}}</p>
                <p style="margin: 8px 0 0 0;"><strong>Venue:</strong> {{venue}}</p>
                <p style="margin: 8px 0 0 0;"><strong>Address:</strong> {{address}}</p>
                <p style="margin: 8px 0 0 0;"><strong>Location Map:</strong> <a href="{{google_maps_url}}" target="_blank" style="color: #026ac9; text-decoration: underline;">Open Google Maps</a></p>
            </div>
            <p><strong>Entrance Instructions:</strong></p>
            <ul>
                <li>Please bring your National Identity Card (NIC) or valid passport.</li>
                <li>Quote your Registration Reference: <strong>{{reference_no}}</strong> at the entrance desk.</li>
                <li>Your Unique Student ID will be confirmed upon entrance scanning.</li>
            </ul>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="font-size: 12px; color: #64748b;">Unicom TIC Workshop Coordination Office</p>
        </div>
    </body></html>',
    'Dear {{student_name}},\n\nYou are invited to attend {{workshop_title}}.\nDate/Time: {{workshop_datetime}}\nVenue: {{venue}}\nAddress: {{address}}\nGoogle Maps: {{google_maps_url}}\nYour Reference: {{reference_no}}\n\nPlease bring your NIC.\n\nUnicom TIC Coordination Office',
    '["student_name", "campaign_title", "workshop_title", "workshop_datetime", "venue", "address", "google_maps_url", "reference_no"]'::jsonb
),
(
    'final_selection',
    'Final Selection - Admission Offer',
    'Congratulations! Admission Offer for Unicom TIC {{campaign_title}}',
    '<html><body style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
        <div style="max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="background-color: #15803d; padding: 16px; border-radius: 6px; text-align: center; color: white;">
                <h2 style="margin: 0;">Official Admission Offer</h2>
            </div>
            <p style="margin-top: 24px;">Dear <strong>{{student_name}}</strong>,</p>
            <p>We are delighted to inform you that following your examination and interview evaluations, you have been <strong>SELECTED</strong> for admission to <strong>{{campaign_title}}</strong>!</p>
            <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 6px; margin: 20px 0;">
                <p style="margin: 0; color: #166534; font-weight: bold;">Status: SELECTED FOR ENROLLMENT</p>
                <p style="margin: 8px 0 0 0;"><strong>Student / Exam ID:</strong> {{student_exam_id}}</p>
                <p style="margin: 8px 0 0 0;"><strong>Selected Program:</strong> {{course_name}}</p>
            </div>
            <p>Detailed instructions regarding document verification and orientation schedule will be sent to your registered email shortly.</p>
            <p>Congratulations once again on your outstanding performance!</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="font-size: 12px; color: #64748b;">Board of Admissions &bull; Unicom TIC</p>
        </div>
    </body></html>',
    'Dear {{student_name}},\n\nCongratulations! You have been SELECTED for admission to {{campaign_title}} in {{course_name}}.\nStudent ID: {{student_exam_id}}\n\nBoard of Admissions, Unicom TIC',
    '["student_name", "campaign_title", "student_exam_id", "course_name"]'::jsonb
),
(
    'final_unsuccessful',
    'Final Selection - Unsuccessful Result',
    'Update Regarding Your Application - Unicom TIC {{campaign_title}}',
    '<html><body style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
        <div style="max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="background-color: #074885; padding: 16px; border-radius: 6px; text-align: center; color: white;">
                <h2 style="margin: 0;">Unicom TIC Admissions</h2>
            </div>
            <p style="margin-top: 24px;">Dear <strong>{{student_name}}</strong>,</p>
            <p>Thank you for your active participation in the selection process for <strong>{{campaign_title}}</strong>, including the written examination and assessments.</p>
            <p>Due to the high volume of applications and strict cohort capacity limits, we regret to inform you that we are unable to offer you a seat for this intake.</p>
            <p>We deeply appreciated the opportunity to evaluate your profile and commendable effort. We warmly encourage you to apply for our upcoming intake cohorts and future specialized short courses.</p>
            <p>We wish you all the very best in your academic and professional endeavors.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="font-size: 12px; color: #64748b;">Board of Admissions &bull; Unicom TIC</p>
        </div>
    </body></html>',
    'Dear {{student_name}},\n\nThank you for participating in the selection process for {{campaign_title}}.\nDue to limited cohort capacity, we are unable to offer you admission in this intake.\nWe encourage you to apply for upcoming intakes and wish you the best.\n\nBoard of Admissions, Unicom TIC',
    '["student_name", "campaign_title"]'::jsonb
)
ON CONFLICT (code) DO NOTHING;

-- 4. Initial System Settings
INSERT INTO system_settings (key, value)
VALUES 
    ('terms_and_conditions', '{"version": "v1.0", "updated_at": "2025-01-01", "content": "I hereby confirm that all details provided in this registration are accurate and true. I understand that any false information will disqualify my application. I agree to receive communications from Unicom TIC regarding workshops, examinations, and admissions."}'::jsonb),
    ('general_settings', '{"institution_name": "Unicom TIC", "contact_email": "admissions@unicomtic.org", "phone": "+94 11 234 5678", "website": "https://unicomtic.org"}'::jsonb),
    ('google_integration_settings', '{"sync_enabled": true, "sync_frequency_minutes": 15, "last_synced_at": null}'::jsonb)
ON CONFLICT (key) DO NOTHING;
