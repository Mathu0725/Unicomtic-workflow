// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import CandidateEmailComposer from "../../src/components/candidate-email-composer";
import SmtpConfiguration from "../../src/components/smtp-configuration";
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  submit: vi.fn(),
  reload: vi.fn(async () => {}),
}));
const candidate = {
  id: "reg-1",
  stage: "registration",
  name: "One Student",
  email: "one@example.com",
  reference: "REG-1",
  status: "registered",
};
const smtpAccount = {
  id: "smtp-1",
  name: "Primary SMTP",
  host: "smtp.example.com",
  port: 587,
  username: "sender@example.com",
  from_name: "Admissions",
  from_email: "sender@example.com",
  reply_to: "reply@example.com",
  encryption: "starttls",
  passwordSaved: true,
  timeout_ms: 10000,
  daily_limit: 20,
  is_active: true,
  updated_at: "version-1",
  budget: { used: 0, limit: 20, remaining: 20 },
  recentErrors: [],
};
const options = [
  { id: "gmail", name: "Connected Gmail", active: true, provider: "gmail" },
  { id: "smtp-1", name: "Primary SMTP", active: true, provider: "smtp" },
];
vi.mock("../../src/components/live-data", async (original) => ({
  ...(await original<any>()),
  api: mocks.api,
  useLiveData: (url: string) => ({
    data: url.includes("/candidates?")
      ? {
          candidates: [candidate],
          total: 1,
          pageSize: 20,
          statuses: ["registered"],
          filters: { intakes: [], forms: [], workshops: [] },
        }
      : url.includes("/accounts")
        ? { options, defaultAccountId: "gmail", accounts: [smtpAccount] }
        : {
            accounts: options,
            defaultAccountId: "gmail",
            variables: ["name", "reference"],
            templates: [
              {
                id: "candidate_message",
                title: "Personal candidate message",
                subject: "Update {{reference}}",
                body: "Hello {{name}}",
              },
            ],
          },
    error: "",
    loading: false,
    reload: mocks.reload,
  }),
}));
vi.mock("../../src/lib/client/submit", () => ({
  pendingPayload: () => undefined,
  submitRequest: mocks.submit,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.mockResolvedValue({
    success: true,
    recipientCount: 2,
    duplicateCount: 1,
    previews: [
      { to: "one@example.com", subject: "Notice", text: "Hello One Student" },
      { to: "two@example.com", subject: "Notice", text: "Hello Applicant" },
    ],
  });
  mocks.submit.mockResolvedValue(
    new Response(
      JSON.stringify({
        success: true,
        batchId: "batch-1",
        message: "Saved two separate emails",
        recipientCount: 2,
      }),
    ),
  );
});
afterEach(() => cleanup());
it("requires preview and explicit bulk confirmation, then queues the chosen account and all recipients", async () => {
  render(createElement(CandidateEmailComposer, { onQueued: mocks.reload }));
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("Direct recipients (optional)"), {
    target: { value: "ONE@example.com, two@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Saved template"), {
    target: { value: "candidate_message" },
  });
  fireEvent.change(screen.getByLabelText("Sending account"), {
    target: { value: "smtp-1" },
  });
  expect(screen.queryByRole("button", { name: "Queue 2 emails" })).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Preview & review recipients" }),
  );
  const send = (await screen.findByRole("button", {
    name: "Queue 2 emails",
  })) as HTMLButtonElement;
  expect(send.disabled).toBe(true);
  expect(screen.getByText(/1 duplicate address entries removed/)).toBeTruthy();
  expect(mocks.submit).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByLabelText(
      "I reviewed and confirm sending to 2 unique recipients.",
    ),
  );
  expect(send.disabled).toBe(false);
  fireEvent.click(send);
  await screen.findByText("Saved two separate emails");
  expect(mocks.submit).toHaveBeenCalledWith(
    "/api/admin/email/manual",
    expect.objectContaining({
      accountId: "smtp-1",
      confirmRecipientCount: 2,
      templateId: "candidate_message",
      candidates: [
        {
          stage: "registration",
          recordId: "reg-1",
          expectedEmail: "one@example.com",
        },
      ],
      directRecipients: ["ONE@example.com", "two@example.com"],
    }),
  );
});
it("invalidates preview after content changes and renders API validation errors", async () => {
  render(createElement(CandidateEmailComposer, { onQueued: mocks.reload }));
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("Email subject"), {
    target: { value: "Notice" },
  });
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "Hello" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Preview & review recipients" }),
  );
  await screen.findByRole("button", { name: "Queue 2 emails" });
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "Changed" },
  });
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Queue 2 emails" })).toBeNull(),
  );
  mocks.api.mockRejectedValueOnce(new Error("Unsupported variables: secret."));
  fireEvent.click(
    screen.getByRole("button", { name: "Preview & review recipients" }),
  );
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Unsupported variables: secret.",
  );
});
it("edits an SMTP account with blank saved password and a separate default action", async () => {
  mocks.api.mockResolvedValue({
    success: true,
    message: "SMTP account saved.",
  });
  render(createElement(SmtpConfiguration, { onChanged: mocks.reload }));
  fireEvent.click(
    screen.getByRole("button", { name: "Edit / enable / disable" }),
  );
  const password = screen.getByLabelText(
    "App password (saved · blank keeps it)",
  ) as HTMLInputElement;
  expect(password.type).toBe("password");
  expect(password.value).toBe("");
  expect(password.required).toBe(false);
  fireEvent.change(screen.getByLabelText("Account name"), {
    target: { value: "Updated SMTP" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save account" }));
  await screen.findByText("SMTP account saved.");
  expect(mocks.api).toHaveBeenCalledWith(
    "/api/admin/email/accounts",
    expect.objectContaining({
      action: "save",
      id: "smtp-1",
      expectedUpdatedAt: "version-1",
      account: expect.objectContaining({
        name: "Updated SMTP",
        password: "",
        encryption: "starttls",
      }),
    }),
  );
  expect(mocks.api.mock.calls).toHaveLength(1);
});
