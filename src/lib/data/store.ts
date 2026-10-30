/**
 * Unicom TIC Platform - In-Memory / Local Repository Store
 * Ensures full end-to-end functionality in staging, preview, local test and development
 * with seamless parity to Supabase PostgreSQL schema.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { StaffAccount } from "../security/staff-accounts";
import type { DocumentUpload } from "../documents/receipts";
import type { Integrations, OutboxJob, WorkshopBooking, SubmissionReceipt, QueueControl } from "./types";
import { defaultSettings } from "../settings";
import type { NotificationTemplateId, SavedEmailTemplate } from "../email/template-catalog";
import type { FormMessageDisplay, FormMessages } from "../forms/messages";
import type { RichTextNode } from "../forms/rich-text";
import type { FormEditorDraft } from "../forms/editor";

export interface Campaign {
  id: string;
  code: string;
  title: string;
  academic_year: string;
  description: string;
  auto_invite_applications: boolean;
  is_active: boolean;
  start_date: string;
  end_date: string;
}

export interface Course {
  id: string;
  campaign_id: string;
  code: string;
  name: string;
  description: string;
  capacity: number;
  is_active: boolean;
}

export interface Student {
  id: string;
  full_name: string;
  name_with_initials: string;
  email: string;
  phone: string;
  whatsapp?: string;
  nic: string;
  nic_last_four: string;
  gender: string;
  dob: string;
  address: string;
  district: string;
  province: string;
  created_at: string;
}

export interface Registration {
  id: string;
  reference_no: string;
  campaign_id: string;
  student_id: string;
  terms_accepted: boolean;
  terms_version: string;
  terms_accepted_at: string;
  source: string;
  status: "registered" | "invited" | "applied" | "cancelled";
  ip_address?: string;
  created_at: string;
}

export interface Application {
  id: string;
  application_no: string;
  registration_id: string;
  student_id: string;
  campaign_id: string;
  course_id?: string;
  ol_results: {
    year: string;
    index_no: string;
    maths: string;
    english: string;
    science: string;
  };
  al_results: {
    stream: string;
    year: string;
    index_no: string;
    z_score?: string;
    summary: string;
  };
  higher_education?: string;
  emergency_contact: {
    name: string;
    relation: string;
    phone: string;
  };
  statement_of_purpose: string;
  status: "invited" | "started" | "submitted" | "under_review" | "approved" | "rejected" | "withdrawn";
  submitted_at: string;
  review_notes?: string;
  created_at: string;
}

export interface Workshop {
  id: string;
  campaign_id: string;
  title: string;
  description: string;
  venue: string;
  address: string;
  google_maps_url: string;
  start_time: string;
  end_time: string;
  reminder_schedule: { days_before: number[] };
  is_active: boolean;
  created_at: string;
  capacity?: number;
  booking_deadline?: string;
  updated_at?: string;
  reminders_enabled?: boolean;
  details_updated_at?: string;
  confirmation_enabled?: boolean;
  reminder_template?: "workshop_reminder" | "workshop_update";
  confirmation_template?: "workshop_booking" | "workshop_update";
  google_sheets_config?: { enabled: boolean; sheet_id: string; sheet_name: string; auto_sync: boolean; version: string; updated_at: string };
}

export interface AttendanceRecord {
  id: string;
  workshop_id: string;
  student_id: string;
  status: "attended" | "absent" | "late" | "excused";
  student_exam_id: string;
  marked_by: string;
  marked_at: string;
  verification_method: string;
  notes?: string;
}

export interface Exam {
  id: string;
  campaign_id: string;
  workshop_id?: string;
  name: string;
  exam_date: string;
  max_marks: number;
  pass_mark: number;
  weightage: number;
  requires_workshop_attendance: boolean;
  status: "scheduled" | "in_progress" | "completed" | "imported";
}

export interface ExamResult {
  id: string;
  exam_id: string;
  marks_import_id?: string;
  student_id: string;
  student_exam_id: string;
  raw_score: number;
  calculated_score: number;
  is_passed: boolean;
  anomalies: string[];
}

export interface Interview {
  id: string;
  campaign_id: string;
  title: string;
  date: string;
  venue: string;
  meeting_url?: string;
  panel_members: string[];
  status: "scheduled" | "in_progress" | "completed";
}

export interface InterviewCandidate {
  id: string;
  interview_id: string;
  student_id: string;
  time_slot: string;
  status: "invited" | "confirmed" | "attended" | "absent" | "cancelled";
  invitation_sent_at?: string;
}

export interface InterviewEvaluation {
  id: string;
  candidate_id: string;
  interviewer_name: string;
  communication_score: number;
  technical_score: number;
  analytical_score: number;
  overall_score: number;
  recommendation: "strongly_recommend" | "recommend" | "neutral" | "not_recommended";
  notes?: string;
  submitted_at: string;
}

export interface SelectionDecision {
  id: string;
  campaign_id: string;
  student_id: string;
  final_status: "selected" | "waiting_list" | "unsuccessful" | "withdrawn" | "pending_decision";
  rank?: number;
  composite_score?: number;
  approved_by: string;
  approved_at: string;
  notification_status: "pending" | "sent" | "failed";
  notified_at?: string;
  notes?: string;
}

export interface EmailAccount {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  from_name: string;
  from_email: string;
  is_active: boolean;
  is_default: boolean;
  /** AES-GCM ciphertext. Only server-side code may access this field. */
  password?: string;
  encryption?: "starttls" | "tls";
  reply_to?: string;
  timeout_ms?: number;
  daily_limit?: number;
  created_at?: string;
  updated_at?: string;
  last_test?: { at: string; success: boolean; code?: string; message: string };
}

export interface EmailJob {
  id: string;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  body_html: string;
  status: "queued" | "sending" | "sent" | "failed";
  retry_count: number;
  error_message?: string;
  sent_at?: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_email: string;
  action: string;
  entity_name: string;
  entity_id: string;
  changes: any;
  created_at: string;
}

export interface FormField {
  id: string;
  type:
    | "text"
    | "textarea"
    | "email"
    | "phone"
    | "nic"
    | "district"
    | "select"
    | "radio"
    | "checkbox"
    | "date"
    | "file"
    | "number"
    | "url"
    | "time"
    | "datetime"
    | "section"
    | "terms";
  label: string;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  options?: string[]; // for select, radio, checkbox
  defaultValue?: any;
  systemKey?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  minSelections?: number;
  maxSelections?: number;
  unique?: boolean;
  width?: "full" | "half";
  visibility?: { field_id: string; operator: "equals" | "not_equals" | "contains" | "empty" | "not_empty" | "greater" | "less"; value?: string };
}

export interface GoogleFormConfig {
  enabled: boolean;
  form_url?: string;
  response_sheet_url?: string;
  response_sheet_name?: string;
  response_mode: "webhook" | "sheet_sync" | "embed";
  webhook_secret?: string;
  webhook_url?: string;
  last_synced_at?: string;
  synced_count?: number;
}

export interface CustomForm {
  id: string;
  slug: string;
  previous_slugs?: string[];
  messages?: Partial<FormMessages>;
  message_display?: Partial<FormMessageDisplay>;
  title: string;
  description: string;
  description_rich?: RichTextNode;
  status?: "draft" | "published" | "paused" | "closed";
  editor_draft?: FormEditorDraft;
  starts_at?: string;
  closes_at?: string;
  submission_limit?: number;
  type: "registration" | "application" | "workshop_rsvp" | "custom";
  application_mode?: "open" | "invitation";
  campaign_id?: string;
  is_active: boolean;
  fields: FormField[];
  google_form_config?: GoogleFormConfig;
  google_sheets_config: {
    enabled: boolean;
    disabled?: boolean;
    sheet_id: string;
    sheet_name: string;
    auto_sync: boolean;
    last_synced_at?: string;
  };
  email_automation: {
    enabled: boolean;
    applicant_account_id?: string;
    applicant_fallback_account_id?: string;
    admin_account_id?: string;
    admin_fallback_account_id?: string;
    applicant_template?: "form" | "registration_confirmation" | "application_confirmation" | "form_confirmation";
    admin_template?: "form" | "admin_submission";
    invitation_form_id?: string;
    send_applicant_email: boolean;
    applicant_subject: string;
    applicant_body_html: string;
    send_admin_notification: boolean;
    admin_emails: string[];
    admin_subject: string;
    admin_body_html?: string;
  };
  confirmation_message: string;
  redirect_url?: string;
  submissions_count: number;
  created_at: string;
  updated_at: string;
  workshop_config?: WorkshopFormConfig;
}

export interface WorkshopFormConfig {
  enabled: boolean;
  required: boolean;
  workshop_ids: string[];
  selection_mode?: "explicit" | "legacy";
  hidden_ids?: string[];
  label?: string;
  help_text?: string;
  empty_message?: string;
  show_remaining?: boolean;
}

export interface FormSubmission {
  id: string;
  form_id: string;
  reference_no: string;
  data: Record<string, any>;
  synced_to_sheet: boolean;
  email_sent: boolean;
  ip_address?: string;
  created_at: string;
  student_id?: string;
  registration_id?: string;
  application_id?: string;
  workshop_id?: string;
  workshop_snapshot?: { title: string; start_time: string; venue: string };
  external_id?: string;
  form_version?: string;
  field_labels?: Record<string, string>;
  accepted_declarations?: { fieldId: string; label: string }[];
}

// Initial In-Memory Database
export class DatabaseStore {
  emailTemplates: Partial<Record<NotificationTemplateId, SavedEmailTemplate>> = {};
  candidateAccessAttempts: { key: string; count: number; expires: number }[] = [];
  documentUploads: DocumentUpload[] = [];
  staffAccounts: StaffAccount[] = [];
  settings = { ...defaultSettings };
  policyVersions = [{ version: defaultSettings.termsVersion, content: defaultSettings.termsContent, activated_at: "initial" }];
  integrations: Integrations = { email_provider: "gmail", admin_notification_email: "" };
  outbox: OutboxJob[] = [];
  workshopBookings: WorkshopBooking[] = [];
  submissionReceipts: SubmissionReceipt[] = [];
  queueControl: QueueControl = {};
  campaigns: Campaign[] = [
    {
      id: "camp-2025",
      code: "TIC-2025",
      title: "Unicom TIC 2025 Advanced Technology Intake",
      academic_year: "2025/2026",
      description: "National ICT intake across all 25 districts of Sri Lanka.",
      auto_invite_applications: true,
      is_active: true,
      start_date: "2025-01-01",
      end_date: "2025-12-31",
    },
  ];

  courses: Course[] = [
    {
      id: "course-1",
      campaign_id: "camp-2025",
      code: "FS-DEV",
      name: "Software Engineering & Full Stack Web Development",
      description: "Advanced engineering using Next.js, Node.js, and Cloud architectures.",
      capacity: 60,
      is_active: true,
    },
    {
      id: "course-2",
      campaign_id: "camp-2025",
      code: "CYBER-SEC",
      name: "Cybersecurity, Ethical Hacking & Cloud Defense",
      description: "SOC analysis, incident response, network hardening.",
      capacity: 40,
      is_active: true,
    },
    {
      id: "course-3",
      campaign_id: "camp-2025",
      code: "DATA-AI",
      name: "Data Science, Machine Learning & Generative AI",
      description: "Data pipelines, predictive modeling and LLM agent orchestration.",
      capacity: 40,
      is_active: true,
    },
  ];

  students: Student[] = [
    {
      id: "stu-1",
      full_name: "Kavindu Dilshan Perera",
      name_with_initials: "K. D. Perera",
      email: "kavindu.p@example.lk",
      phone: "0771234567",
      whatsapp: "0771234567",
      nic: "200112304567",
      nic_last_four: "4567",
      gender: "Male",
      dob: "2001-05-12",
      address: "No. 45, Temple Road, Maharagama",
      district: "Colombo",
      province: "Western",
      created_at: "2025-01-10T08:30:00Z",
    },
    {
      id: "stu-2",
      full_name: "Fathima Rizna Mohamed",
      name_with_initials: "M. R. Fathima",
      email: "rizna.m@example.lk",
      phone: "0718765432",
      whatsapp: "0718765432",
      nic: "200256708910",
      nic_last_four: "8910",
      gender: "Female",
      dob: "2002-09-24",
      address: "12/A, Station Road, Kandy",
      district: "Kandy",
      province: "Central",
      created_at: "2025-01-11T09:15:00Z",
    },
    {
      id: "stu-3",
      full_name: "Thivanka Selvam",
      name_with_initials: "S. Thivanka",
      email: "thivanka.s@example.lk",
      phone: "0763456789",
      whatsapp: "0763456789",
      nic: "200034109823",
      nic_last_four: "9823",
      gender: "Male",
      dob: "2000-02-18",
      address: "Main Street, Jaffna",
      district: "Jaffna",
      province: "Northern",
      created_at: "2025-01-12T10:00:00Z",
    },
    {
      id: "stu-4",
      full_name: "Sanduni Tharushika Jayasinghe",
      name_with_initials: "S. T. Jayasinghe",
      email: "sanduni.j@example.lk",
      phone: "0759871234",
      whatsapp: "0759871234",
      nic: "200178901234",
      nic_last_four: "1234",
      gender: "Female",
      dob: "2001-11-05",
      address: "78, Beach Road, Galle",
      district: "Galle",
      province: "Southern",
      created_at: "2025-01-13T11:20:00Z",
    },
    {
      id: "stu-5",
      full_name: "Ahamed Irfan",
      name_with_initials: "M. I. Ahamed",
      email: "irfan.a@example.lk",
      phone: "0725554321",
      whatsapp: "0725554321",
      nic: "200289012345",
      nic_last_four: "2345",
      gender: "Male",
      dob: "2002-04-14",
      address: "Hospital Road, Batticaloa",
      district: "Batticaloa",
      province: "Eastern",
      created_at: "2025-01-14T14:45:00Z",
    },
    {
      id: "stu-6",
      full_name: "Nimasha Sewwandi",
      name_with_initials: "N. Sewwandi",
      email: "nimasha.s@example.lk",
      phone: "0784433221",
      whatsapp: "0784433221",
      nic: "200367890123",
      nic_last_four: "0123",
      gender: "Female",
      dob: "2003-01-20",
      address: "Negombo Road, Kurunegala",
      district: "Kurunegala",
      province: "North Western",
      created_at: "2025-01-15T16:00:00Z",
    },
  ];

  registrations: Registration[] = [
    {
      id: "reg-1",
      reference_no: "REG-25-KPD78",
      campaign_id: "camp-2025",
      student_id: "stu-1",
      terms_accepted: true,
      terms_version: "v1.0",
      terms_accepted_at: "2025-01-10T08:30:00Z",
      source: "unicomtic_portal",
      status: "applied",
      created_at: "2025-01-10T08:30:00Z",
    },
    {
      id: "reg-2",
      reference_no: "REG-25-FRM92",
      campaign_id: "camp-2025",
      student_id: "stu-2",
      terms_accepted: true,
      terms_version: "v1.0",
      terms_accepted_at: "2025-01-11T09:15:00Z",
      source: "unicomtic_portal",
      status: "applied",
      created_at: "2025-01-11T09:15:00Z",
    },
    {
      id: "reg-3",
      reference_no: "REG-25-TVS14",
      campaign_id: "camp-2025",
      student_id: "stu-3",
      terms_accepted: true,
      terms_version: "v1.0",
      terms_accepted_at: "2025-01-12T10:00:00Z",
      source: "unicomtic_portal",
      status: "applied",
      created_at: "2025-01-12T10:00:00Z",
    },
    {
      id: "reg-4",
      reference_no: "REG-25-STJ55",
      campaign_id: "camp-2025",
      student_id: "stu-4",
      terms_accepted: true,
      terms_version: "v1.0",
      terms_accepted_at: "2025-01-13T11:20:00Z",
      source: "unicomtic_portal",
      status: "applied",
      created_at: "2025-01-13T11:20:00Z",
    },
    {
      id: "reg-5",
      reference_no: "REG-25-AI401",
      campaign_id: "camp-2025",
      student_id: "stu-5",
      terms_accepted: true,
      terms_version: "v1.0",
      terms_accepted_at: "2025-01-14T14:45:00Z",
      source: "unicomtic_portal",
      status: "invited",
      created_at: "2025-01-14T14:45:00Z",
    },
    {
      id: "reg-6",
      reference_no: "REG-25-NSW89",
      campaign_id: "camp-2025",
      student_id: "stu-6",
      terms_accepted: true,
      terms_version: "v1.0",
      terms_accepted_at: "2025-01-15T16:00:00Z",
      source: "unicomtic_portal",
      status: "registered",
      created_at: "2025-01-15T16:00:00Z",
    },
  ];

  applications: Application[] = [
    {
      id: "app-1",
      application_no: "APP-25-9081",
      registration_id: "reg-1",
      student_id: "stu-1",
      campaign_id: "camp-2025",
      course_id: "course-1",
      ol_results: {
        year: "2017",
        index_no: "678129",
        maths: "A",
        english: "A",
        science: "A",
      },
      al_results: {
        stream: "Physical Science",
        year: "2020",
        index_no: "219803",
        z_score: "1.74",
        summary: "Combined Maths: B, Physics: B, Chemistry: C",
      },
      emergency_contact: {
        name: "Sunil Perera",
        relation: "Father",
        phone: "0777654321",
      },
      statement_of_purpose: "Passionate about full-stack web architectures and scalable distributed cloud systems.",
      status: "submitted",
      submitted_at: "2025-01-12T14:00:00Z",
      created_at: "2025-01-12T14:00:00Z",
    },
    {
      id: "app-2",
      application_no: "APP-25-3342",
      registration_id: "reg-2",
      student_id: "stu-2",
      campaign_id: "camp-2025",
      course_id: "course-2",
      ol_results: {
        year: "2018",
        index_no: "882104",
        maths: "A",
        english: "B",
        science: "A",
      },
      al_results: {
        stream: "Technology",
        year: "2021",
        index_no: "330912",
        z_score: "1.89",
        summary: "Engineering Tech: A, Science for Tech: A, ICT: A",
      },
      emergency_contact: {
        name: "Mohamed Rauf",
        relation: "Father",
        phone: "0712334455",
      },
      statement_of_purpose: "Aspiring to defend critical infrastructure against cyber warfare and APTs.",
      status: "submitted",
      submitted_at: "2025-01-13T10:30:00Z",
      created_at: "2025-01-13T10:30:00Z",
    },
    {
      id: "app-3",
      application_no: "APP-25-7819",
      registration_id: "reg-3",
      student_id: "stu-3",
      campaign_id: "camp-2025",
      course_id: "course-3",
      ol_results: {
        year: "2016",
        index_no: "445102",
        maths: "B",
        english: "A",
        science: "B",
      },
      al_results: {
        stream: "Physical Science",
        year: "2019",
        index_no: "109843",
        z_score: "1.65",
        summary: "Combined Maths: B, Physics: C, Chemistry: C",
      },
      emergency_contact: {
        name: "Selvam K.",
        relation: "Father",
        phone: "0761122334",
      },
      statement_of_purpose: "Focusing on artificial intelligence, neural networks, and computer vision algorithms.",
      status: "submitted",
      submitted_at: "2025-01-14T09:00:00Z",
      created_at: "2025-01-14T09:00:00Z",
    },
    {
      id: "app-4",
      application_no: "APP-25-1109",
      registration_id: "reg-4",
      student_id: "stu-4",
      campaign_id: "camp-2025",
      course_id: "course-1",
      ol_results: {
        year: "2017",
        index_no: "551290",
        maths: "A",
        english: "A",
        science: "B",
      },
      al_results: {
        stream: "Physical Science",
        year: "2020",
        index_no: "419082",
        z_score: "1.42",
        summary: "Combined Maths: C, Physics: C, Chemistry: S",
      },
      emergency_contact: {
        name: "Kamala Jayasinghe",
        relation: "Mother",
        phone: "0754433221",
      },
      statement_of_purpose: "Looking forward to modern software development workflows and industry placement.",
      status: "submitted",
      submitted_at: "2025-01-15T11:45:00Z",
      created_at: "2025-01-15T11:45:00Z",
    },
  ];

  workshops: Workshop[] = [
    {
      id: "ws-1",
      campaign_id: "camp-2025",
      title: "Unicom TIC National Orientation & Induction Workshop",
      description: "Mandatory interactive technology orientation, cohort briefing, and entrance credential verification.",
      venue: "BMICH - Lotus Hall",
      address: "Bauddhaloka Mawatha, Colombo 00700, Sri Lanka",
      google_maps_url: "https://maps.google.com/?q=BMICH+Colombo",
      start_time: "2025-02-15T09:00:00Z",
      end_time: "2025-02-15T13:30:00Z",
      reminder_schedule: { days_before: [3, 1] },
      is_active: true,
      created_at: "2025-01-05T00:00:00Z",
    },
  ];

  attendance: AttendanceRecord[] = [
    {
      id: "att-1",
      workshop_id: "ws-1",
      student_id: "stu-1",
      status: "attended",
      student_exam_id: "TIC-2025-0001",
      marked_by: "Entrance Desk Officer A",
      marked_at: "2025-02-15T08:45:00Z",
      verification_method: "nic_last4",
      notes: "NIC 4567 verified against canonical record",
    },
    {
      id: "att-2",
      workshop_id: "ws-1",
      student_id: "stu-2",
      status: "attended",
      student_exam_id: "TIC-2025-0002",
      marked_by: "Entrance Desk Officer A",
      marked_at: "2025-02-15T08:52:00Z",
      verification_method: "nic_last4",
      notes: "NIC 8910 verified",
    },
    {
      id: "att-3",
      workshop_id: "ws-1",
      student_id: "stu-3",
      status: "attended",
      student_exam_id: "TIC-2025-0003",
      marked_by: "Entrance Desk Officer B",
      marked_at: "2025-02-15T09:05:00Z",
      verification_method: "nic_last4",
      notes: "Late arrival (10 mins)",
    },
    {
      id: "att-4",
      workshop_id: "ws-1",
      student_id: "stu-4",
      status: "attended",
      student_exam_id: "TIC-2025-0004",
      marked_by: "Entrance Desk Officer B",
      marked_at: "2025-02-15T08:58:00Z",
      verification_method: "nic_last4",
    },
  ];

  exams: Exam[] = [
    {
      id: "exam-1",
      campaign_id: "camp-2025",
      workshop_id: "ws-1",
      name: "TIC National Logic & Aptitude Entrance Examination 2025",
      exam_date: "2025-02-22T10:00:00Z",
      max_marks: 100,
      pass_mark: 50,
      weightage: 100,
      requires_workshop_attendance: true,
      status: "imported",
    },
  ];

  examResults: ExamResult[] = [
    {
      id: "res-1",
      exam_id: "exam-1",
      student_id: "stu-1",
      student_exam_id: "TIC-2025-0001",
      raw_score: 88,
      calculated_score: 88,
      is_passed: true,
      anomalies: [],
    },
    {
      id: "res-2",
      exam_id: "exam-1",
      student_id: "stu-2",
      student_exam_id: "TIC-2025-0002",
      raw_score: 94,
      calculated_score: 94,
      is_passed: true,
      anomalies: [],
    },
    {
      id: "res-3",
      exam_id: "exam-1",
      student_id: "stu-3",
      student_exam_id: "TIC-2025-0003",
      raw_score: 72,
      calculated_score: 72,
      is_passed: true,
      anomalies: [],
    },
    {
      id: "res-4",
      exam_id: "exam-1",
      student_id: "stu-4",
      student_exam_id: "TIC-2025-0004",
      raw_score: 42,
      calculated_score: 42,
      is_passed: false,
      anomalies: ["Below pass mark of 50"],
    },
  ];

  interviews: Interview[] = [
    {
      id: "int-1",
      campaign_id: "camp-2025",
      title: "Admissions Panel Technical Interview - Session A",
      date: "2025-03-05T09:30:00Z",
      venue: "Unicom TIC Main Campus - Interview Board Room 1",
      meeting_url: "https://meet.google.com/xyz-tic-adm",
      panel_members: ["Prof. C. Ratnayake", "Eng. M. F. Nazeer", "Dr. S. Jayasinghe"],
      status: "completed",
    },
  ];

  interviewCandidates: InterviewCandidate[] = [
    {
      id: "ic-1",
      interview_id: "int-1",
      student_id: "stu-1",
      time_slot: "2025-03-05T09:30:00Z",
      status: "attended",
      invitation_sent_at: "2025-02-28T10:00:00Z",
    },
    {
      id: "ic-2",
      interview_id: "int-1",
      student_id: "stu-2",
      time_slot: "2025-03-05T10:15:00Z",
      status: "attended",
      invitation_sent_at: "2025-02-28T10:00:00Z",
    },
    {
      id: "ic-3",
      interview_id: "int-1",
      student_id: "stu-3",
      time_slot: "2025-03-05T11:00:00Z",
      status: "attended",
      invitation_sent_at: "2025-02-28T10:00:00Z",
    },
  ];

  interviewEvaluations: InterviewEvaluation[] = [
    {
      id: "eval-1",
      candidate_id: "ic-1",
      interviewer_name: "Eng. M. F. Nazeer",
      communication_score: 23,
      technical_score: 32,
      analytical_score: 22,
      overall_score: 14,
      recommendation: "strongly_recommend",
      notes: "Exceptional coding fundamentals and articulate communicator.",
      submitted_at: "2025-03-05T10:00:00Z",
    },
    {
      id: "eval-2",
      candidate_id: "ic-2",
      interviewer_name: "Dr. S. Jayasinghe",
      communication_score: 24,
      technical_score: 34,
      analytical_score: 24,
      overall_score: 15,
      recommendation: "strongly_recommend",
      notes: "Top-tier candidate in cybersecurity fundamentals.",
      submitted_at: "2025-03-05T10:45:00Z",
    },
    {
      id: "eval-3",
      candidate_id: "ic-3",
      interviewer_name: "Prof. C. Ratnayake",
      communication_score: 20,
      technical_score: 28,
      analytical_score: 19,
      overall_score: 12,
      recommendation: "recommend",
      notes: "Solid foundation, good motivation for AI track.",
      submitted_at: "2025-03-05T11:30:00Z",
    },
  ];

  selectionDecisions: SelectionDecision[] = [
    {
      id: "sel-1",
      campaign_id: "camp-2025",
      student_id: "stu-2",
      final_status: "selected",
      rank: 1,
      composite_score: 95.5,
      approved_by: "Prof. Director Admissions",
      approved_at: "2025-03-10T14:00:00Z",
      notification_status: "sent",
      notified_at: "2025-03-10T15:30:00Z",
      notes: "Offered Full Merit Seat in Cybersecurity.",
    },
    {
      id: "sel-2",
      campaign_id: "camp-2025",
      student_id: "stu-1",
      final_status: "selected",
      rank: 2,
      composite_score: 91.0,
      approved_by: "Prof. Director Admissions",
      approved_at: "2025-03-10T14:00:00Z",
      notification_status: "sent",
      notified_at: "2025-03-10T15:30:00Z",
      notes: "Offered Software Engineering seat.",
    },
    {
      id: "sel-3",
      campaign_id: "camp-2025",
      student_id: "stu-3",
      final_status: "waiting_list",
      rank: 3,
      composite_score: 78.0,
      approved_by: "Prof. Director Admissions",
      approved_at: "2025-03-10T14:00:00Z",
      notification_status: "pending",
      notes: "First on Waiting List for AI Cohort.",
    },
    {
      id: "sel-4",
      campaign_id: "camp-2025",
      student_id: "stu-4",
      final_status: "unsuccessful",
      composite_score: 42.0,
      approved_by: "Prof. Director Admissions",
      approved_at: "2025-03-10T14:00:00Z",
      notification_status: "pending",
      notes: "Did not clear minimum examination threshold.",
    },
  ];

  emailAccounts: EmailAccount[] = [
    {
      id: "ea-1",
      name: "Unicom Admissions Primary (SMTP)",
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      username: "admissions@unicomtic.org",
      from_name: "Unicom TIC Admissions",
      from_email: "admissions@unicomtic.org",
      is_active: true,
      is_default: true,
    },
  ];

  emailJobs: EmailJob[] = [
    {
      id: "job-1",
      recipient_email: "kavindu.p@example.lk",
      recipient_name: "Kavindu Dilshan Perera",
      subject: "Registration Confirmed - Unicom TIC [REG-25-KPD78]",
      body_html: "<p>Your registration is confirmed.</p>",
      status: "sent",
      retry_count: 0,
      sent_at: "2025-01-10T08:31:00Z",
      created_at: "2025-01-10T08:30:30Z",
    },
    {
      id: "job-2",
      recipient_email: "rizna.m@example.lk",
      recipient_name: "Fathima Rizna Mohamed",
      subject: "Action Required: Complete Your Unicom TIC Application [REG-25-FRM92]",
      body_html: "<p>Application invitation link.</p>",
      status: "sent",
      retry_count: 0,
      sent_at: "2025-01-11T09:16:00Z",
      created_at: "2025-01-11T09:15:30Z",
    },
  ];

  auditLogs: AuditLog[] = [
    {
      id: "log-1",
      user_email: "admin@unicomtic.org",
      action: "CAMPAIGN_ACTIVATED",
      entity_name: "campaigns",
      entity_id: "camp-2025",
      changes: { is_active: true, auto_invite_applications: true },
      created_at: "2025-01-01T00:00:00Z",
    },
    {
      id: "log-2",
      user_email: "officer.attendance@unicomtic.org",
      action: "ATTENDANCE_MARKED",
      entity_name: "attendance",
      entity_id: "att-1",
      changes: { status: "attended", student_exam_id: "TIC-2025-0001" },
      created_at: "2025-02-15T08:45:00Z",
    },
    {
      id: "log-3",
      user_email: "examiner@unicomtic.org",
      action: "OMR_MARKS_COMMITTED",
      entity_name: "marks_imports",
      entity_id: "exam-1",
      changes: { rows_committed: 4, exam_id: "exam-1" },
      created_at: "2025-02-23T11:00:00Z",
    },
  ];

  sheetSyncJobs = [
    {
      id: "sync-1",
      sync_type: "registrations",
      sheet_id: "1A2B3C4D5E6F7G8H9I0",
      total_synced: 6,
      status: "success",
      error_message: null,
      triggered_by: "system_cron",
      created_at: "2025-02-15T12:00:00Z",
    },
    {
      id: "sync-2",
      sync_type: "applications",
      sheet_id: "9Z8Y7X6W5V4U3T2S1R0",
      total_synced: 4,
      status: "success",
      error_message: null,
      triggered_by: "manual_admin",
      created_at: "2025-02-15T12:05:00Z",
    },
  ];

  customForms: CustomForm[] = [
    {
      id: "form-reg-2025",
      slug: "tic-2025-registration",
      title: "Unicom TIC 2025 Intake Registration Form",
      description: "Official online registration portal for tertiary and secondary students across Sri Lanka.",
      type: "registration",
      campaign_id: "camp-2025",
      is_active: true,
      fields: [
        {
          id: "fullName",
          type: "text",
          label: "Full Name (As in NIC/Birth Certificate)",
          placeholder: "e.g. Kavindu Dilshan Perera",
          helpText: "Enter your full name as appearing on legal documents",
          required: true,
        },
        {
          id: "nameWithInitials",
          type: "text",
          label: "Name with Initials",
          placeholder: "e.g. K. D. Perera",
          required: true,
        },
        {
          id: "nic",
          type: "nic",
          label: "National Identity Card (NIC)",
          placeholder: "200112304567 or 991234567V",
          helpText: "9 digits + V/X or 12 digits format",
          required: true,
        },
        {
          id: "email",
          type: "email",
          label: "Email Address",
          placeholder: "kavindu@example.lk",
          required: true,
        },
        {
          id: "phone",
          type: "phone",
          label: "Mobile Number (Sri Lanka)",
          placeholder: "0771234567",
          required: true,
        },
        {
          id: "district",
          type: "district",
          label: "Residential District (Sri Lanka)",
          placeholder: "Select your district",
          required: true,
        },
        {
          id: "dob",
          type: "date",
          label: "Date of Birth",
          required: true,
        },
        {
          id: "preferredProgram",
          type: "select",
          label: "Preferred Academic Track",
          options: [
            "Software Engineering & Full Stack Web Development",
            "Cybersecurity & Cloud Defense",
            "Data Science & Artificial Intelligence",
          ],
          required: true,
        },
        {
          id: "address",
          type: "textarea",
          label: "Permanent Residential Address",
          placeholder: "No. 45, Temple Road...",
          required: true,
        },
        {
          id: "terms",
          type: "terms",
          label: "I agree to the Unicom TIC Admissions Policy (v1.0) and verify that all information is authentic.",
          required: true,
        },
      ],
      google_form_config: {
        enabled: true,
        form_url: "https://docs.google.com/forms/d/e/1FAIpQLScUnicomTIC2025Reg/viewform",
        response_sheet_url: "https://docs.google.com/spreadsheets/d/1A2B3C4D5E6F7G8H9I0_REG/edit",
        response_mode: "webhook",
        webhook_secret: "wh_tic2025_reg",
        last_synced_at: "2025-02-15T12:00:00Z",
        synced_count: 6,
      },
      google_sheets_config: {
        enabled: true,
        sheet_id: "1A2B3C4D5E6F7G8H9I0_REG",
        sheet_name: "Registrations",
        auto_sync: true,
      },
      email_automation: {
        enabled: true,
        send_applicant_email: true,
        applicant_subject: "Registration Received - Unicom TIC Intake [{{reference_no}}]",
        applicant_body_html: "<h3>Welcome to Unicom TIC, {{fullName}}!</h3><p>Your registration reference number is <strong>{{reference_no}}</strong>.</p><p>District: {{district}}<br>Track: {{preferredProgram}}</p><p>We will email you with your workshop schedule shortly.</p>",
        send_admin_notification: true,
        admin_emails: ["admissions@unicomtic.org"],
        admin_subject: "New Student Intake Registration: {{fullName}} ({{district}})",
      },
      confirmation_message: "Thank you for registering with Unicom TIC! Your registration reference has been generated and emailed to you.",
      submissions_count: 6,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    },
    {
      id: "form-app-2025",
      slug: "tic-2025-formal-application",
      title: "2025 Unicom TIC Scholarship Program Application",
      description: "Please use your OWN initiative and words to complete the application. Can be completed in either English or Tamil (விண்ணப்பத்தை ஆங்கிலத்தில் அல்லது தமிழில் நிரப்பலாம்). Complete the application as soon as possible as spaces on the workshops are limited.",
      type: "application",
      campaign_id: "camp-2025",
      is_active: true,
      fields: [
        {
          id: "fullName",
          type: "text",
          label: "1. Full Name முழுப் பெயர்",
          placeholder: "e.g. Sivakumar Mathivanan",
          required: true,
        },
        {
          id: "dob",
          type: "date",
          label: "2. Date of Birth பிறந்த திகதி",
          required: true,
        },
        {
          id: "nic",
          type: "nic",
          label: "3. NIC Number தேசிய அடையாள அட்டை எண்",
          placeholder: "e.g. 200112304567 or 991234567V",
          required: true,
        },
        {
          id: "email",
          type: "email",
          label: "4. Email Address மின்னஞ்சல் முகவரி",
          placeholder: "name@example.com",
          required: true,
        },
        {
          id: "phone",
          type: "phone",
          label: "5. Phone Number தொலைபேசி எண்",
          placeholder: "0771234567",
          required: true,
        },
        {
          id: "whatsapp",
          type: "phone",
          label: "6. WhatsApp Number வாட்ஸ்அப் இலக்கம்",
          placeholder: "0771234567",
          required: true,
        },
        {
          id: "gender",
          type: "radio",
          label: "7. Gender பாலினம்",
          options: ["Male ஆண்", "Female பெண்"],
          required: true,
        },
        {
          id: "address",
          type: "textarea",
          label: "8. Current Address வதிவிட முகவரி",
          placeholder: "Enter your residential address / உங்களது தற்போதைய வதிவிட முகவரி",
          required: true,
        },
        {
          id: "olIct",
          type: "radio",
          label: "9. GCE O/L ICT ? க.பொ.த சாதாரணதரத்தில் ICT ஐ ஒரு பாடமாக தெரிவுசெய்தீர்களா?",
          options: ["Yes", "No"],
          required: true,
        },
        {
          id: "alIct",
          type: "radio",
          label: "10. GCE A/L ICT ? க.பொ.த உயர்தரதரத்தில் ICT ஐ ஒரு பாடமாக தெரிவுசெய்தீர்களா?",
          options: ["Yes", "No"],
          required: true,
        },
        {
          id: "currentStatus",
          type: "text",
          label: "11. Tell us about your current status. உங்களுடைய தற்போதைய தொழில்",
          placeholder: "e.g. Student / Job Seeker / Employed (மாணவர் / தொழில் தேடுபவர்)",
          required: true,
        },
        {
          id: "whySoftwareDev",
          type: "textarea",
          label: "12. Why do you want to become a software developer? & why do you think you can be a good software developer? நீங்கள் ஏன் ஒரு மென்பொருள் வல்லனுனராக வர விரும்புகிறீர்கள், உங்களிடம் உள்ள எவ்வித குணாதிசயங்கள் உங்களை ஒரு நல்ல மென்பொருள் வல்லுனராக மாற்ற உதவும்?",
          placeholder: "Can be completed in either English or Tamil / ஆங்கிலத்தில் அல்லது தமிழில் எழுதலாம்...",
          required: true,
        },
        {
          id: "greatestAccomplishment",
          type: "textarea",
          label: "13. Greatest Accomplishment உங்களின் மிகப்பெரிய சாதனை - Tell us what you think is your proudest achievement in your life until now? இன்றுவரை வாழ்நாள் சாதனையாக நீங்கள் பெருமைப்படும் விடயம் எது ?",
          placeholder: "Describe your proudest achievement / உங்கள் சாதனையை விவரிக்கவும்...",
          required: true,
        },
        {
          id: "q14_formPattern",
          type: "text",
          label: "14. Which form should come in question mark? கேள்விக்குறியில் வரவேண்டிய உரு எது?",
          placeholder: "Enter option or description / உங்கள் விடை",
          required: false,
        },
        {
          id: "q15_numberPattern",
          type: "text",
          label: "15. Which Number should come in question mark? கேள்விக்குறியில் வரவேண்டிய எண்எது?",
          placeholder: "Enter number / விடை எண்",
          required: false,
        },
        {
          id: "q16_oddNumber",
          type: "radio",
          label: "16. Odd one out? வேறுபட்ட இலக்கத்தை தெரிவு செய்க?",
          options: ["20", "15", "2", "12", "9", "21"],
          required: true,
        },
        {
          id: "q17_oddWord",
          type: "radio",
          label: "17. Odd word ? வேறுபட்ட வார்த்தையை தெரிவு செய்க?",
          options: ["FLOW", "LAST", "DRAY", "NUTS", "EVIL", "PART"],
          required: true,
        },
        {
          id: "q18_minLines",
          type: "text",
          label: "18. Minimum number of lines required to make the above pattern? மேலே காட்டப்பட்ட வடிவத்தை உருவாக்க குறைந்தது எத்தனை கோடுகள் தேவை?",
          placeholder: "Enter minimum number of lines / கோடுகளின் எண்ணிக்கை",
          required: false,
        },
      ],
      google_form_config: {
        enabled: true,
        form_url: "https://docs.google.com/forms/d/e/1FAIpQLScUnicomTIC2025Reg/viewform",
        response_sheet_url: "https://docs.google.com/spreadsheets/d/1A2B3C4D5E6F7G8H9I0_REG/edit",
        response_mode: "webhook",
        webhook_secret: "wh_tic2025_reg",
        last_synced_at: "2025-02-15T12:00:00Z",
        synced_count: 6,
      },
      google_sheets_config: {
        enabled: true,
        sheet_id: "9Z8Y7X6W5V4U3T2S1R0_APP",
        sheet_name: "Applications",
        auto_sync: true,
      },
      email_automation: {
        enabled: true,
        send_applicant_email: true,
        applicant_subject: "2025 Unicom TIC Scholarship Application Submitted - [{{reference_no}}]",
        applicant_body_html: "<h3>விண்ணப்பம் பெறப்பட்டது / Application Received!</h3><p>Your application for the 2025 Unicom TIC Scholarship Program has been recorded under Reference: <strong>{{reference_no}}</strong>.</p><p>Our admissions committee will review your application.</p>",
        send_admin_notification: true,
        admin_emails: ["admissions@unicomtic.org"],
        admin_subject: "New Scholarship Application: {{fullName}}",
      },
      confirmation_message: "Your application for the 2025 Unicom TIC Scholarship Program has been successfully submitted! விண்ணப்பம் வெற்றிகரமாக சமர்ப்பிக்கப்பட்டது.",
      submissions_count: 4,
      created_at: "2025-01-05T00:00:00Z",
      updated_at: "2025-01-05T00:00:00Z",
    },
  ];

  formSubmissions: FormSubmission[] = [
    {
      id: "sub-1",
      form_id: "form-reg-2025",
      reference_no: "REG-25-KPD78",
      data: {
        fullName: "Kavindu Dilshan Perera",
        nameWithInitials: "K. D. Perera",
        nic: "200112304567",
        email: "kavindu.p@example.lk",
        phone: "0771234567",
        district: "Colombo",
        preferredProgram: "Software Engineering & Full Stack Web Development",
      },
      synced_to_sheet: true,
      email_sent: true,
      created_at: "2025-01-10T08:30:00Z",
    },
    {
      id: "sub-2",
      form_id: "form-reg-2025",
      reference_no: "REG-25-FRM92",
      data: {
        fullName: "Fathima Rizna Mohamed",
        nameWithInitials: "M. R. Fathima",
        nic: "200256708910",
        email: "rizna.m@example.lk",
        phone: "0718765432",
        district: "Kandy",
        preferredProgram: "Cybersecurity & Cloud Defense",
      },
      synced_to_sheet: true,
      email_sent: true,
      created_at: "2025-01-11T09:15:00Z",
    },
  ];
}

// Global singleton instance preserved across Next.js dev reloads
const globalForDb = globalThis as unknown as { databaseStore?: DatabaseStore };
export const globalStore = globalForDb.databaseStore || new DatabaseStore();
if (process.env.NODE_ENV !== "production") {
  globalForDb.databaseStore = globalStore;
}

export const databaseContext = new AsyncLocalStorage<DatabaseStore>();
export function getDb() { return databaseContext.getStore() || globalStore; }
