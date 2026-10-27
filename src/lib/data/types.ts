export interface Integrations {
    email_provider: "gmail" | "smtp";
    admin_notification_email: string;
    registration_sheet_id?: string;
    application_sheet_id?: string;
    email_daily_limit?: number;
    drive_documents?: { folder_id: string; folder_name: string; google_email: string; ready: boolean };
    google?: {
        email: string;
        refresh_token: string;
        scopes: string[];
        connected_at: string;
    };
    smtp?: {
        host: string;
        port: number;
        secure: boolean;
        username: string;
        password: string;
        from_name: string;
        from_email: string;
    };
}
export interface WorkshopBooking {
    id: string;
    workshop_id: string;
    student_id: string;
    registration_id: string;
    status: "confirmed" | "cancelled";
    created_at: string;
}
export interface OutboxJob {
    id: string;
    key: string;
    type: "email" | "sheet";
    status: "queued" | "sending" | "sent" | "failed" | "uncertain" | "blocked";
    payload: Record<string, any>;
    attempts: number;
    created_at: string;
    next_attempt_at?: string;
    lease_until?: string;
    error?: string;
    provider?: string;
    provider_id?: string;
    completed_at?: string;
    error_code?: string;
    repair_action?: string;
    request_id?: string;
    email_dispatch_id?: string;
    email_budget_recorded?: boolean;
    sender_identity?: string;
    last_attempt_at?: string;
    deferred_until?: string;
    deferred_reason?: string;
}
export interface EmailDispatch {
    id: string;
    job_id: string;
    sender: string;
    at: number;
    status: "reserved" | "accepted" | "uncertain";
}

export interface SubmissionReceipt {
    key_hash: string;
    request_hash: string;
    status: number;
    response: Record<string, any>;
    expires_at: number;
}

export interface QueueControl {
    email_dispatches?: EmailDispatch[];
    email_cooldowns?: Record<string, { until: number; message: string }>;
    sheets_next_dispatch_at?: number;
    email_next_dispatch_at?: number;
    last_worker_at?: number;
    worker_lease?: { id: string; expires_at: number };
    last_worker_completed_at?: number;
    last_worker_error?: { code: string; at: number };
}
