import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { SRI_LANKA_DISTRICTS } from "@/lib/constants/sri-lanka-districts";
export const dynamic = "force-dynamic";
export const GET = route(async () => {
    const db = getDb(), today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
    return NextResponse.json({ success: true, stats: { registrations: db.registrations.length, applications: db.applications.length, todayApplications: db.applications.filter(a => new Date(a.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" }) === today).length, attended: db.attendance.filter(a => ["attended", "late"].includes(a.status)).length, selected: db.selectionDecisions.filter(d => d.final_status === "selected").length, interviews: db.interviewCandidates.length, examsPassed: db.examResults.filter(r => r.is_passed).length, emailsSent: db.outbox.filter(j => j.type === "email" && j.status === "sent").length, jobsPending: db.outbox.filter(j => ["queued", "sending"].includes(j.status)).length, jobsFailed: db.outbox.filter(j => ["failed", "uncertain", "blocked"].includes(j.status)).length }, forms: db.customForms.map(f => ({ id: f.id, title: f.title, type: f.type, submissions: db.formSubmissions.filter(s => s.form_id === f.id).length })), workshops: db.workshops.map(w => ({ ...w, bookings: db.workshopBookings.filter(b => b.workshop_id === w.id && b.status === "confirmed").length })), districts: SRI_LANKA_DISTRICTS.map(d => {
            const students = new Set(db.students.filter(s => s.district === d.name).map(s => s.id));
            return { district: d.name, province: d.province,
                registrations: db.registrations.filter(r => students.has(r.student_id)).length,
                applications: db.applications.filter(a => students.has(a.student_id)).length,
                attendance: db.attendance.filter(a => students.has(a.student_id) && ["attended", "late"].includes(a.status)).length,
                passed: db.examResults.filter(r => students.has(r.student_id) && r.is_passed).length };
        }) });
}, true);
