import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { workshopSchema } from "@/lib/validations/workshop";
import { audit } from "@/lib/admissions/service";
import { getSession } from "@/lib/security/session";
export const dynamic = "force-dynamic";
export const GET = route(async req => {
    const db = getDb();
    return NextResponse.json({ success: true, canManageReminders: ["admin", "super_admin"].includes(getSession(req)!.role), workshops: db.workshops.map(w => ({ ...w, campaignTitle: db.campaigns.find(c => c.id === w.campaign_id)?.title, totalAttended: db.attendance.filter(a => a.workshop_id === w.id && ["attended", "late"].includes(a.status)).length, bookings: db.workshopBookings.filter(b => b.workshop_id === w.id && b.status === "confirmed").map(b => { const s = db.students.find(s => s.id === b.student_id); return { ...b, studentName: s?.full_name, email: s?.email, referenceNo: db.registrations.find(r => r.id === b.registration_id)?.reference_no }; }) })) });
}, true);
export const POST = route(async (req) => {
    const parsed = workshopSchema.extend({ capacity: z.coerce.number().int().min(1).max(100000), bookingDeadline: z.string().optional() }).safeParse(await req.json());
    if (!parsed.success)
        throw new RequestError(parsed.error.issues[0].message);
    const data = parsed.data, db = getDb();
    if (!db.campaigns.some(c => c.id === data.campaignId && c.is_active))
        throw new RequestError("Select an active intake.");
    if (Date.parse(data.startTime) <= Date.now() || Date.parse(data.endTime) <= Date.parse(data.startTime))
        throw new RequestError("Workshop must start in the future and finish after its start time.");
    if (data.bookingDeadline && (!Number.isFinite(Date.parse(data.bookingDeadline)) || Date.parse(data.bookingDeadline) <= Date.now() || Date.parse(data.bookingDeadline) > Date.parse(data.startTime)))
        throw new RequestError("Booking deadline must be in the future and before workshop start.");
    const workshop = { id: randomUUID(), campaign_id: data.campaignId, title: data.title, description: data.description || "", venue: data.venue, address: data.address, google_maps_url: data.googleMapsUrl || "", start_time: data.startTime, end_time: data.endTime, capacity: data.capacity, booking_deadline: data.bookingDeadline || undefined, reminder_schedule: { days_before: data.daysBeforeReminders }, is_active: true, created_at: new Date().toISOString() };
    db.workshops.push(workshop);
    audit("WORKSHOP_CREATED", "workshops", workshop.id, { title: workshop.title });
    return NextResponse.json({ success: true, workshop, message: "Workshop created. Enable workshop choices in the form Builder to accept bookings." });
}, true);
export const PATCH = route(async (req) => {
    const { id, is_active, expectedIsActive } = await req.json(), workshop = getDb().workshops.find(w => w.id === id);
    if (!workshop || typeof is_active !== "boolean")
        throw new RequestError("Select a workshop and its booking availability.");
    if (typeof expectedIsActive === "boolean" && expectedIsActive !== workshop.is_active) throw new RequestError("Workshop availability changed. Reload before saving.", 409);
    if (is_active && (Date.parse(workshop.start_time) <= Date.now() || workshop.booking_deadline && Date.parse(workshop.booking_deadline) <= Date.now())) throw new RequestError("This workshop or booking deadline has passed. Create a new future session.", 409);
    workshop.is_active = is_active;
    return NextResponse.json({ success: true, message: is_active ? "Workshop bookings reopened." : "New bookings closed. Existing bookings are retained." });
}, true);
