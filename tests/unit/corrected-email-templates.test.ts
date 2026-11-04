import { expect, it } from "vitest";
import { DatabaseStore } from "../../src/lib/data/store";
import { renderNotification } from "../../src/lib/email/notification-templates";
import { emailAttachmentsSchema } from "../../src/lib/email/attachments";

it("renders corrected bilingual interview and enrollment mail using current settings and UT number", () => {
  const db = new DatabaseStore();
  db.students = [{ id: "one", email: "one@example.com", full_name: "Student", ut_number: "UT2027-001" } as any];
  db.settings.emailWorkflow = {
    interviewBookingUrl: "https://forms.example.com/interview", interviewDeadline: "10 March 2027, 12:00",
    courseStartDate: "1 April 2027", enrollmentUploadUrl: "https://forms.example.com/enroll",
    enrollmentDeadline: "within 72 hours", trustFormDeadline: "3 April 2027", documentsEmail: "documents@example.com",
  };
  const identity = { name: "Student", email: "one@example.com", reference: "REG-1" };
  const interview = renderNotification(db, "interview_invitation", identity);
  expect(interview.text).toContain("வாழ்த்துகள்!");
  expect(interview.text).toContain("UT2027-001");
  expect(interview.text).toContain("https://forms.example.com/interview");
  expect(interview.text).toContain("10 March 2027, 12:00");
  const selected = renderNotification(db, "selection_selected", identity);
  expect(selected.text).toContain("1 April 2027");
  expect(selected.text).toContain("within 72 hours");
  expect(selected.text).toContain("https://forms.example.com/enroll");
  expect(selected.text).not.toMatch(/2025|\{\{/);
});

it("rejects attachment paths, remote URL injection, malformed encoding and oversized combined content", () => {
  const file = { filename: "contract.pdf", contentType: "application/pdf", content: Buffer.from("%PDF-1.7\ncontract").toString("base64") };
  expect(emailAttachmentsSchema.safeParse([file]).success).toBe(true);
  for (const patch of [{ filename: "../secret.pdf" }, { filename: "file.exe" }, { content: "https://example.com/secret" }, { path: "C:/secret.pdf" }, { contentType: "text/html" }])
    expect(emailAttachmentsSchema.safeParse([{ ...file, ...patch }]).success).toBe(false);
  const large = { ...file, content: Buffer.alloc(1100000).toString("base64") };
  expect(emailAttachmentsSchema.safeParse([large, large]).success).toBe(false);
});
