import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  transport: vi.fn(),
  send: vi.fn(),
  verify: vi.fn(),
  close: vi.fn(),
}));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("nodemailer", () => ({
  default: { createTransport: mocks.transport },
}));
import { DatabaseStore, databaseContext } from "../../src/lib/data/store";
import {
  publicSmtpAddress,
  resolveSmtpHost,
} from "../../src/lib/email/smtp-network";
import {
  createSmtpTransporter,
  sendEmail,
  verifySmtpConnection,
} from "../../src/lib/email/smtp-client";
import { encrypt } from "../../src/lib/security/secrets";
import { sanitizeEmailHtml } from "../../src/lib/email/sanitize";
beforeEach(() => {
  vi.stubEnv("APP_SECRET", "smtp-test-key-with-at-least-32-characters");
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  mocks.transport.mockReturnValue({
    sendMail: mocks.send,
    verify: mocks.verify,
    close: mocks.close,
  });
  mocks.send.mockResolvedValue({
    accepted: ["student@example.com"],
    messageId: "provider-accepted",
  });
  mocks.verify.mockResolvedValue(true);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
const config = () => ({
  host: "smtp.example.com",
  port: 587,
  secure: false,
  username: "sender@example.com",
  password: "test-only-password",
  fromName: "Admissions",
  fromEmail: "sender@example.com",
  replyTo: "reply@example.com",
  timeoutMs: 6000,
});
const payload = {
  to: "student@example.com",
  subject: "Received",
  html: "<p>Saved</p>",
  messageId: "<stable-job@portal.test>",
};
it.each([
  "127.0.0.1",
  "10.1.2.3",
  "172.16.1.1",
  "192.168.1.1",
  "169.254.169.254",
  "100.100.100.200",
  "0.0.0.0",
  "224.0.0.1",
  "::1",
  "::",
  "fe80::1",
  "fc00::1",
  "::ffff:127.0.0.1",
  "::ffff:8.8.8.8",
  "2001:db8::1",
  "2002:7f00:1::",
  "64:ff9b::7f00:1",
])("blocks non-public SMTP address %s", (address) =>
  expect(publicSmtpAddress(address)).toBe(false),
);
it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
  "accepts global address %s",
  (address) => expect(publicSmtpAddress(address)).toBe(true),
);
it("rejects mixed public/private DNS answers, rebinding and URL hosts before transport creation", async () => {
  mocks.lookup.mockResolvedValue([
    { address: "8.8.8.8", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ]);
  expect(await verifySmtpConnection(config())).toMatchObject({
    success: false,
    code: "SMTP_HOST_BLOCKED",
  });
  for (const host of [
    "localhost",
    "mail.internal",
    "http://smtp.example.com",
    "smtp.example.com/path",
    "smtp.example.com:587",
  ])
    await expect(resolveSmtpHost(host)).rejects.toMatchObject({
      code: "SMTP_HOST_BLOCKED",
    });
  expect(mocks.transport).not.toHaveBeenCalled();
});
it("pins validated IP and preserves TLS hostname, certificate checks and secret-free logging", async () => {
  await createSmtpTransporter(config());
  expect(mocks.transport).toHaveBeenCalledWith(
    expect.objectContaining({
      host: "8.8.8.8",
      port: 587,
      secure: false,
      requireTLS: true,
      connectionTimeout: 6000,
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
      tls: {
        rejectUnauthorized: true,
        servername: "smtp.example.com",
        minVersion: "TLSv1.2",
      },
    }),
  );
  await createSmtpTransporter({ ...config(), secure: true, port: 465 });
  expect(mocks.transport.mock.calls[1][0]).toMatchObject({
    secure: true,
    requireTLS: false,
  });
});
it("uses selected encrypted SMTP credential, Reply-to and one recipient with stable message id", async () => {
  const db = new DatabaseStore();
  db.emailAccounts = [
    {
      id: "primary",
      name: "Primary",
      host: "smtp.example.com",
      port: 587,
      secure: false,
      encryption: "starttls",
      username: "sender@example.com",
      password: encrypt("test-only-password"),
      from_name: "Admissions",
      from_email: "sender@example.com",
      reply_to: "reply@example.com",
      is_active: true,
      is_default: false,
    },
  ];
  expect(
    await databaseContext.run(db, () =>
      sendEmail({ ...payload, smtpAccountId: "primary" }),
    ),
  ).toMatchObject({
    success: true,
    provider: "smtp",
    messageId: "provider-accepted",
  });
  expect(mocks.send).toHaveBeenCalledWith(
    expect.objectContaining({
      to: { name: "", address: "student@example.com" },
      replyTo: "reply@example.com",
      text: "Saved",
      messageId: payload.messageId,
    }),
  );
  expect(mocks.send.mock.calls[0][0]).not.toHaveProperty("cc");
  expect(mocks.send.mock.calls[0][0]).not.toHaveProperty("bcc");
  expect(mocks.close).toHaveBeenCalledTimes(1);
});
it.each([
  [
    {
      code: "EAUTH",
      message: "AUTH secret-password",
      response: "AUTH secret-password",
    },
    "SMTP_AUTH_FAILED",
    "blocked",
  ],
  [
    { code: "ETIMEDOUT", command: "CONN", message: "private-host" },
    "SMTP_CONNECTION_INTERRUPTED",
    "temporary",
  ],
  [
    { code: "ETIMEDOUT", command: "DATA", message: "secret-password" },
    "SEND_UNCERTAIN",
    "uncertain",
  ],
  [
    { responseCode: 451, command: "DATA", message: "private-provider" },
    "PROVIDER_UNAVAILABLE",
    "temporary",
  ],
  [
    { responseCode: 550, message: "private-recipient" },
    "RECIPIENT_REJECTED",
    "permanent",
  ],
  [
    { code: "ERR_TLS_CERT_ALTNAME_INVALID", message: "secret-password" },
    "SMTP_TLS_FAILED",
    "blocked",
  ],
])(
  "classifies SMTP failures without returning raw details %#",
  async (error, code, kind) => {
    mocks.send.mockRejectedValue(error);
    const result = await databaseContext.run(new DatabaseStore(), () =>
      sendEmail(payload, config()),
    );
    expect(result).toMatchObject({
      success: false,
      errorCode: code,
      failureKind: kind,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /secret-password|private-host|private-provider|private-recipient/,
    );
  },
);
it("does not connect when the account is disabled or ciphertext cannot be read", async () => {
  const db = new DatabaseStore();
  db.emailAccounts = [
    { id: "bad", password: "invalid-ciphertext", is_active: false } as any,
  ];
  expect(
    await databaseContext.run(db, () =>
      sendEmail({ ...payload, smtpAccountId: "bad" }),
    ),
  ).toMatchObject({
    errorCode: "SMTP_ACCOUNT_UNAVAILABLE",
    failureKind: "blocked",
  });
  db.emailAccounts[0].is_active = true;
  expect(
    await databaseContext.run(db, () =>
      sendEmail({ ...payload, smtpAccountId: "bad" }),
    ),
  ).toMatchObject({
    errorCode: "SMTP_SECRET_UNREADABLE",
    failureKind: "blocked",
  });
  expect(mocks.transport).not.toHaveBeenCalled();
});
it("sanitizes script, event handlers, CSS fetches, images and dangerous URL schemes", () => {
  const clean = sanitizeEmailHtml(
    '<script>secret()</script><img src="https://evil.test"><p onclick="evil()" style="background-image:url(https://evil.test);color:#123456">Hello</p><a href="javascript:evil()">Bad</a><a href="https://uticx.com/status?ref=SAFE">Track</a>',
  );
  expect(clean).not.toMatch(
    /script|onclick|<img|background-image|javascript|evil\.test/,
  );
  expect(clean).toContain("color:#123456");
  expect(clean).toContain("https://uticx.com/status?ref=SAFE");
});
