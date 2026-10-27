import { randomUUID } from "node:crypto";
import { getDb, CustomForm, Student, Registration, Application, FormSubmission } from "../data/store";
import { getProvinceForDistrict, SRI_LANKA_DISTRICTS } from "../constants/sri-lanka-districts";
import { nicRegex, phoneRegex } from "../validations/registration";
import { RequestError } from "../http";
import { enqueue, queueSheet } from "../jobs/outbox";
import { renderEmailTemplate } from "../email/template-engine";
import { formSheetTarget } from "../google/sheet-target";
import { documentAnswer, documentUrl, type DocumentUpload } from "../documents/receipts";
import { emailValidationMessage } from "../validations/email";
import { admissionEmailVariables, renderNotification, savedTemplate } from "../email/notification-templates";
export const escaped = (value: any) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export const normalizeEmail = (value: any) => String(value || "").trim().toLowerCase();
export const normalizeNic = (value: any) => String(value || "").replace(/\s/g, "").toUpperCase();
export const normalizePhone = (value: any) => String(value || "").replace(/[\s()-]/g, "").replace(/^(\+94|0094|94)/, "0");
const now = () => new Date().toISOString();
const reference = (prefix: string) => `${prefix}-${new Date().getFullYear().toString().slice(-2)}-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
export function audit(action: string, entity: string, id: string, changes: any) {
    getDb().auditLogs.push({ id: randomUUID(), action, entity_name: entity, entity_id: id, user_email: "admissions-service", changes, created_at: now() });
}
export function canonicalStudent(data: Record<string, any>): Student {
    const db = getDb(), email = normalizeEmail(data.email), nic = normalizeNic(data.nic), phone = normalizePhone(data.phone);
    const emailError = emailValidationMessage(email);
    if (emailError) throw new RequestError(emailError, 400, { errors: { email: emailError } });
    if (!nicRegex.test(nic) || !phoneRegex.test(phone) || String(data.fullName || "").trim().length < 3)
        throw new RequestError("Full name, valid email, NIC and Sri Lankan mobile number are required.");
    const matches = db.students.filter(s => normalizeEmail(s.email) === email || normalizeNic(s.nic) === nic || normalizePhone(s.phone) === phone);
    if (matches.length > 1 || matches.some(s => normalizeEmail(s.email) !== email || normalizeNic(s.nic) !== nic))
        throw new RequestError("This email, NIC or phone is already associated with another identity. Contact admissions to correct the record.", 409, { isDuplicate: true, code: "IDENTITY_CONFLICT", action: "contact_admissions" });
    if (matches[0])
        return matches[0];
    const district = data.district || "Colombo";
    if (!SRI_LANKA_DISTRICTS.some(d => d.name === district))
        throw new RequestError("Select a valid district.");
    const student: Student = { id: randomUUID(), full_name: String(data.fullName).trim(), name_with_initials: data.nameWithInitials || String(data.fullName).trim(), email, nic, nic_last_four: nic.slice(-4), phone, whatsapp: normalizePhone(data.whatsapp) || undefined, gender: data.gender || "Other", dob: data.dob || "", address: data.address || "", district, province: getProvinceForDistrict(district), created_at: now() };
    db.students.push(student);
    return student;
}
export function registrationFor(student: Student, campaignId?: string, allowExisting = false): Registration {
    const db = getDb(), campaign = db.campaigns.find(c => c.id === campaignId) || (!campaignId ? db.campaigns.find(c => c.is_active) : undefined);
    if (!campaign?.is_active)
        throw new RequestError("This intake is not accepting submissions.");
    const existing = db.registrations.find(r => r.student_id === student.id && r.campaign_id === campaign.id);
    if (existing) {
        if (!allowExisting)
            throw new RequestError("You have already registered for this intake. Use your existing reference to track progress.", 409, { isDuplicate: true, referenceNo: existing.reference_no, code: "DUPLICATE_REGISTRATION", action: "track_record" });
        return existing;
    }
    const reg: Registration = { id: randomUUID(), student_id: student.id, campaign_id: campaign.id, reference_no: reference("REG"), terms_accepted: true, terms_version: db.settings.termsVersion, terms_accepted_at: now(), source: "admissions_portal", status: campaign.auto_invite_applications ? "invited" : "registered", created_at: now() };
    db.registrations.push(reg);
    audit("STUDENT_REGISTERED", "registrations", reg.id, { referenceNo: reg.reference_no });
    return reg;
}
export function applicationFor(student: Student, reg: Registration, data: Record<string, any>): Application {
    const db = getDb();
    if (reg.status === "cancelled" || !db.campaigns.some(c => c.id === reg.campaign_id && c.is_active)) throw new RequestError("This registration or intake is no longer accepting applications.", 409, { code: "APPLICATION_CLOSED" });
    const existing = db.applications.find(a => a.student_id === student.id && a.campaign_id === reg.campaign_id);
    if (existing)
        throw new RequestError("An application already exists for this intake.", 409, { isDuplicate: true, applicationNo: existing.application_no, referenceNo: reg.reference_no, code: "DUPLICATE_APPLICATION", action: "track_record" });
    if (data.courseId && !db.courses.some(c => c.id === data.courseId && c.campaign_id === reg.campaign_id && c.is_active))
        throw new RequestError("Select an available program.");
    const app: Application = { id: randomUUID(), application_no: reference("APP"), registration_id: reg.id, student_id: student.id, campaign_id: reg.campaign_id, course_id: data.courseId, ol_results: { year: data.olYear || "", index_no: data.olIndexNo || "", maths: data.olMathsGrade || "", english: data.olEnglishGrade || "", science: data.olScienceGrade || "" }, al_results: { stream: data.alStream || "", year: data.alYear || "", index_no: data.alIndexNo || "", z_score: data.alZScore, summary: data.alResultsSummary || "" }, emergency_contact: { name: data.emergencyContactName || "", relation: data.emergencyContactRelation || "", phone: data.emergencyContactPhone || "" }, statement_of_purpose: data.statementOfPurpose || data.whySoftwareDev || "", status: "submitted", submitted_at: now(), created_at: now() };
    db.applications.push(app);
    reg.status = "applied";
    audit("APPLICATION_SUBMITTED", "applications", app.id, { applicationNo: app.application_no });
    return app;
}
export function availableWorkshops(campaignId?: string, allowedIds?: string[]) {
    const db = getDb();
    return db.workshops.filter(w => w.is_active && (!campaignId || w.campaign_id === campaignId) && (!allowedIds?.length || allowedIds.includes(w.id)) && Date.parse(w.start_time) > Date.now() && (!w.booking_deadline || Date.parse(w.booking_deadline) > Date.now())).map(w => {
        const booked = db.workshopBookings.filter(b => b.workshop_id === w.id && b.status === "confirmed").length;
        return { id: w.id, title: w.title, start_time: w.start_time, end_time: w.end_time, venue: w.venue, address: w.address, google_maps_url: w.google_maps_url, remaining: w.capacity ? Math.max(0, w.capacity - booked) : null };
    });
}
export function bookWorkshop(workshopId: string | undefined, student: Student, reg: Registration, config?: CustomForm["workshop_config"]) {
    if (!workshopId) {
        if (config?.enabled && config.required)
            throw new RequestError("Please select a workshop.");
        return;
    }
    if (config && !config.enabled)
        throw new RequestError("Workshop booking is not enabled for this form.");
    const db = getDb(), workshop = availableWorkshops(reg.campaign_id, config?.workshop_ids).find(w => w.id === workshopId);
    if (!workshop)
        throw new RequestError("This workshop is closed or unavailable.", 409, { code: "WORKSHOP_UNAVAILABLE", action: "refresh_workshops" });
    const existing = db.workshopBookings.find(b => b.workshop_id === workshopId && b.student_id === student.id && b.status === "confirmed");
    if (existing)
        return existing;
    if (workshop.remaining !== null && workshop.remaining < 1)
        throw new RequestError("This workshop is full. Select another workshop.", 409, { code: "WORKSHOP_FULL", action: "refresh_workshops" });
    const booking = { id: randomUUID(), workshop_id: workshopId, student_id: student.id, registration_id: reg.id, status: "confirmed" as const, created_at: now() };
    db.workshopBookings.push(booking);
    const when = new Date(workshop.start_time).toLocaleString("en-GB", { timeZone: "Asia/Colombo" });
    enqueue(db, "email", `booking:${booking.id}`, { to: student.email, toName: student.full_name, ...renderNotification(db, "workshop_booking", { ...admissionEmailVariables(db, student, reg), workshop: workshop.title, date: when, venue: workshop.venue, address: workshop.address }, workshop.google_maps_url || undefined) });
    return booking;
}
export function submissionSheetRow(student: Student, reg: Registration, app?: Application, sub?: FormSubmission) {
    return { ...(sub?.data || {}), referenceNo: sub?.reference_no || app?.application_no || reg.reference_no, registrationRef: reg.reference_no, fullName: student.full_name, email: student.email, phone: student.phone, nic: student.nic, district: student.district, status: app?.status || reg.status, createdAt: sub?.created_at || app?.created_at || reg.created_at };
}
export function notifySubmission(student: Student, reg: Registration, app?: Application, sub?: FormSubmission, form?: CustomForm) {
    const db = getDb(), ref = sub?.reference_no || app?.application_no || reg.reference_no;
    const trackingUrl = `${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")}/status?ref=${encodeURIComponent(reg.reference_no)}`;
    const vars = { ...(sub?.data || {}), ...admissionEmailVariables(db, student, reg), reference: ref, reference_no: ref, fullName: student.full_name, student_name: student.full_name, title: form?.title || "", formTitle: form?.title || (app ? "Application" : "Registration"), district: student.district, submission_date: now().slice(0, 10), submissionType: app ? "application" : "registration", applicationCount: db.applications.length, registrationCount: db.registrations.length };
    const templateId = form && !["registration", "application"].includes(form.type) ? "form_confirmation" : app ? "application_confirmation" : "registration_confirmation";
    const receipt = renderNotification(db, templateId, vars, trackingUrl);
    let { subject, html } = receipt;
    if (form?.email_automation.enabled) {
        const rendered = renderEmailTemplate(form.email_automation.applicant_subject, form.email_automation.applicant_body_html, null, vars);
        if (rendered.isValid) {
            subject = rendered.subject;
            html = rendered.bodyHtml + `<p><a href="${escaped(trackingUrl)}">${escaped(savedTemplate(db, templateId).actionLabel || "Track your admission progress")}</a></p>`;
        }
    }
    if (!app && reg.status === "invited")
        html += `<p><a href="${escaped((process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000") + "/apply?ref=" + reg.reference_no)}">${escaped(savedTemplate(db, "application_invitation").actionLabel || "Complete your application")}</a></p>`;
    const candidateContext = { stage: app ? "application" : "registration", recordId: app?.id || reg.id, registrationId: reg.id, applicationId: app?.id, studentId: student.id, reference: ref };
    if (!form || (form.email_automation.enabled && form.email_automation.send_applicant_email))
        enqueue(db, "email", `submission:${sub?.id || app?.id || reg.id}:applicant`, { to: student.email, toName: student.full_name, subject, html, templateId: form?.email_automation.enabled ? `form:${form.id}:applicant` : templateId, sourceId: sub?.id, candidateContext });
    const recipients = new Set([db.integrations.admin_notification_email || db.integrations.google?.email, ...(form?.email_automation.enabled && form.email_automation.send_admin_notification ? form.email_automation.admin_emails : [])].filter(Boolean));
    let adminMessage = renderNotification(db, "admin_submission", vars);
    if (form?.email_automation.enabled && form.email_automation.send_admin_notification) {
        const rendered = renderEmailTemplate(form.email_automation.admin_subject || adminMessage.subject, form.email_automation.admin_body_html || adminMessage.html, null, vars);
        if (rendered.isValid) adminMessage = { ...adminMessage, subject: rendered.subject, html: rendered.bodyHtml };
    }
    for (const email of recipients)
        if (email)
            enqueue(db, "email", `submission:${sub?.id || app?.id || reg.id}:admin:${email}`, { to: email, ...adminMessage, text: undefined, candidateContext });
    const row = submissionSheetRow(student, reg, app, sub);
    const target = formSheetTarget(db.integrations, form, app ? "applications" : "registrations");
    if (target?.auto_sync)
        queueSheet(db, target.sheet_id, target.sheet_name, row, sub?.id);
}
export function submitCustomForm(form: CustomForm, input: Record<string, any>, options: {
    workshopId?: string;
    externalId?: string;
    verifiedStudentId?: string;
} = {}) {
    const db = getDb();
    if (!form.is_active)
        throw new RequestError("This form is closed.", 403);
    if (options.externalId) {
        const existing = db.formSubmissions.find(s => s.form_id === form.id && s.external_id === options.externalId);
        if (existing)
            return { submission: existing, duplicate: true };
    }
    const data: Record<string, any> = Object.fromEntries(form.fields.map(field => [field.id, input[field.id]])), errors: Record<string, string> = {};
    const documents = new Map<string, DocumentUpload>();
    for (const field of form.fields) {
        const value = data[field.id];
        if (field.type === "file" && value) {
            const upload = documentAnswer(form, field, value);
            if (!upload) errors[field.id] = "Upload this document again. Its upload must belong to this form and question and be less than 24 hours old.";
            else documents.set(field.id, upload);
        }
        if (value !== undefined && value !== null && (typeof value === "object" && !Array.isArray(value) || Array.isArray(value) && (value.length > 100 || value.some(item => typeof item !== "string" || item.length > 1000))))
            errors[field.id] = "Enter a valid answer.";
        if (typeof value === "string" && value.length > (field.type === "textarea" ? 10000 : 2000))
            errors[field.id] = "This answer is too long. Please shorten it.";
        if (field.systemKey)
            data[field.systemKey] = value;
        if (field.required && (value === undefined || value === null || value === false || String(value).trim() === "" || (Array.isArray(value) && !value.length)))
            errors[field.id] = `${field.label} is required.`;
        if (field.type === "terms" && field.required && value !== true)
            errors[field.id] = "Please accept the terms.";
        if (value && ["select", "radio"].includes(field.type) && !field.options?.includes(String(value)))
            errors[field.id] = "Select a valid option.";
        if (value && (field.type === "email" || field.systemKey === "email" || field.id === "email")) {
            const emailError = emailValidationMessage(value);
            if (emailError) errors[field.id] = emailError;
            else {
                data[field.id] = normalizeEmail(value);
                if (field.systemKey) data[field.systemKey] = data[field.id];
            }
        }
        if (value && field.type === "phone" && !phoneRegex.test(normalizePhone(value)))
            errors[field.id] = "Enter a valid mobile number.";
        if (value && field.type === "nic" && !nicRegex.test(normalizeNic(value)))
            errors[field.id] = "Enter a valid NIC.";
        if (value !== undefined && value !== null && value !== "" && field.type === "number" && !Number.isFinite(Number(value))) errors[field.id] = "Enter a finite number.";
        if (value && field.type === "date" && !Number.isFinite(Date.parse(String(value)))) errors[field.id] = "Enter a valid date.";
        if (Array.isArray(value) && field.options?.length && value.some(item => !field.options!.includes(item))) errors[field.id] = "Select valid options.";
    }
    if (Object.keys(errors).length)
        throw new RequestError("Please correct the highlighted fields.", 400, { errors });
    const student = canonicalStudent(data);
    if (options.verifiedStudentId && student.id !== options.verifiedStudentId) throw new RequestError("Use the details of the candidate verified by this email link.", 403);
    const reg = registrationFor(student, form.campaign_id, form.type !== "registration");
    if (db.formSubmissions.some(s => s.form_id === form.id && s.student_id === student.id))
        throw new RequestError("You have already submitted this form.", 409, { isDuplicate: true, referenceNo: reg.reference_no });
    const app = form.type === "application" ? applicationFor(student, reg, data) : undefined;
    const booking = bookWorkshop(options.workshopId, student, reg, form.workshop_config);
    const submission: FormSubmission = { id: randomUUID(), form_id: form.id, form_version: form.updated_at, accepted_declarations: form.fields.filter(f => f.type === "terms" && data[f.id] === true).map(f => ({ fieldId: f.id, label: f.label })), reference_no: app?.application_no || reg.reference_no, data, student_id: student.id, registration_id: reg.id, application_id: app?.id, workshop_id: booking?.workshop_id, external_id: options.externalId, synced_to_sheet: false, email_sent: false, created_at: now() };
    db.formSubmissions.push(submission);
    for (const [fieldId, upload] of documents) {
        upload.submission_id = submission.id;
        submission.data[fieldId] = documentUrl(upload.drive_file_id);
    }
    form.submissions_count = db.formSubmissions.filter(s => s.form_id === form.id).length;
    notifySubmission(student, reg, app, submission, form);
    return { submission, trackingReference: reg.reference_no, duplicate: false };
}
