import type { DatabaseStore } from "../data/store";
/** Stable booking IDs reconcile retries; registration references remain readable columns. */
export function workshopBookingSheetRow(db: DatabaseStore, bookingId: string) {
  const booking = db.workshopBookings.find((item) => item.id === bookingId),
    workshop =
      booking && db.workshops.find((item) => item.id === booking.workshop_id),
    student =
      booking && db.students.find((item) => item.id === booking.student_id),
    registration =
      booking &&
      db.registrations.find((item) => item.id === booking.registration_id);
  if (!booking || !workshop || !student || !registration) return null;
  const attendance = db.attendance.find(
      (item) =>
        item.workshop_id === workshop.id && item.student_id === student.id,
    ),
    application = db.applications.find(
      (item) => item.registration_id === registration.id,
    );
  const submissions = db.formSubmissions.filter(
      (item) =>
        booking.source_submission_ids?.includes(item.id) ||
        (item.workshop_id === workshop.id &&
          item.registration_id === registration.id),
    ),
    formIds = [...new Set(submissions.map((item) => item.form_id))];
  return {
    referenceNo: booking.id,
    bookingId: booking.id,
    workshopId: workshop.id,
    workshopTitle: workshop.title,
    intake:
      db.campaigns.find((item) => item.id === workshop.campaign_id)?.title ||
      "",
    registrationRef: registration.reference_no,
    applicationNo: application?.application_no || "",
    fullName: student.full_name,
    nameWithInitials: student.name_with_initials,
    email: student.email,
    phone: student.phone,
    whatsapp: student.whatsapp || "",
    nic: student.nic,
    utNumber: student.ut_number || "",
    district: student.district,
    province: student.province,
    bookingStatus: booking.status,
    bookedAt: booking.created_at,
    cancelledAt: booking.cancelled_at || "",
    cancellationReason: booking.cancellation_reason || "",
    movedFromBooking: booking.moved_from || "",
    movedToBooking: booking.moved_to || "",
    workshopStartsAt: workshop.start_time,
    workshopEndsAt: workshop.end_time,
    venue: workshop.venue,
    address: workshop.address,
    attendanceStatus: attendance?.status || "unmarked",
    attendanceMarkedAt: attendance?.marked_at || "",
    studentExamId: student.ut_number || attendance?.student_exam_id || "",
    sourceFormIds: formIds.join(", "),
    sourceForms: formIds
      .map((id) => db.customForms.find((item) => item.id === id)?.title || id)
      .join(", "),
  };
}
