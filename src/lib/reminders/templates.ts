export const reminderKinds = ["application_pending", "workshop_unbooked", "workshop_missed"] as const;
export type ReminderKind = typeof reminderKinds[number];
export const reminderCopy: Record<ReminderKind, { title: string; description: string; subject: string; body: string }> = {
    application_pending: {
        title: "Application pending", description: "Registered students who have not submitted an application.",
        subject: "Complete your application — {{intake}}",
        body: "Dear {{name}},\n\nThank you for registering for {{intake}}. We have not yet received your completed application. Please complete it to continue with your admission.\n\nYour registration reference: {{reference}}.\nIf you need help, please reply to this email.\n\nUnicom TIC Admissions",
    },
    workshop_unbooked: {
        title: "Workshop not booked", description: "Applicants who have not booked a workshop in this intake.",
        subject: "Book your workshop — {{intake}}",
        body: "Dear {{name}},\n\nYour application for {{intake}} has been received, but you have not booked a workshop slot. Please arrange your workshop booking for the next step.\n\nYour registration reference: {{reference}}.\nIf you cannot find a suitable slot, please reply to this email for help.\n\nUnicom TIC Admissions",
    },
    workshop_missed: {
        title: "Workshop missed", description: "Confirmed bookings marked Absent after the session ended.",
        subject: "Follow up on your workshop — {{intake}}",
        body: "Dear {{name}},\n\nOur attendance record shows that you missed {{workshop}} on {{date}} at {{venue}}. Please reply to this email so we can help with the next available workshop. If the attendance record is incorrect, please let us know.\n\nYour registration reference: {{reference}}.\n\nUnicom TIC Admissions",
    },
};
export type ReminderVariables = { name: string; intake: string; reference: string; workshop: string; date: string; venue: string };
export function renderReminderText(template: string, values: ReminderVariables) {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (placeholder, key: string) => Object.hasOwn(values, key) ? values[key as keyof ReminderVariables] : placeholder);
}
export function hasUnknownReminderVariable(template: string) {
    return [...template.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].some(([, key]) => !["name", "intake", "reference", "workshop", "date", "venue"].includes(key));
}
