-- ==============================================================================
-- Unicom TIC Student Lifecycle Management Platform
-- Migration 005: Google Form Integration & Real-Time Supabase Sync
-- ==============================================================================

-- 1. Add google_form_config column to custom_forms if not exists
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'custom_forms' AND column_name = 'google_form_config'
    ) THEN 
        ALTER TABLE custom_forms 
        ADD COLUMN google_form_config JSONB DEFAULT '{
            "enabled": false,
            "form_url": "",
            "response_sheet_url": "",
            "response_mode": "webhook",
            "last_synced_at": null,
            "synced_count": 0
        }'::jsonb;
    END IF;
END $$;

-- 2. Add source column to form_submissions if not exists
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'form_submissions' AND column_name = 'source'
    ) THEN 
        ALTER TABLE form_submissions 
        ADD COLUMN source VARCHAR(50) DEFAULT 'unicom_portal';
    END IF;
END $$;

-- 3. Trigger to auto-update custom_forms.submissions_count on new submission
CREATE OR REPLACE FUNCTION update_custom_form_submission_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE custom_forms
    SET submissions_count = (
        SELECT COUNT(*) FROM form_submissions WHERE form_id = NEW.form_id
    ),
    updated_at = NOW()
    WHERE id = NEW.form_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_form_submissions_count ON form_submissions;
CREATE TRIGGER trg_form_submissions_count
AFTER INSERT ON form_submissions
FOR EACH ROW
EXECUTE FUNCTION update_custom_form_submission_count();
