import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { burstStages, summarizeBurst, burstPasses } from "./lib/load-test-metrics.mjs";

// This script is deliberately limited to a separate Vercel staging project.
// Verify its Supabase project ref in Vercel before running it.
const base = new URL(process.env.STAGING_BASE_URL || "https://invalid.invalid");
assert.equal(base.protocol, "https:", "STAGING_BASE_URL must use HTTPS");
assert(
  /^unicomtic-workflow-staging(?:-[a-z0-9-]+)?\.vercel\.app$/.test(base.hostname),
  "Only a separate unicomtic-workflow-staging Vercel project is allowed",
);
assert.equal(base.pathname, "/", "STAGING_BASE_URL must not contain a path");
assert(!base.username && !base.password && !base.port, "STAGING_BASE_URL must not contain credentials or a custom port");
assert(!base.search && !base.hash, "STAGING_BASE_URL must not contain a query or fragment");
const email = process.env.STAGING_ADMIN_EMAIL;
const password = process.env.STAGING_ADMIN_PASSWORD;
assert(email && password, "Set STAGING_ADMIN_EMAIL and STAGING_ADMIN_PASSWORD in the local process environment");
const expectedRef = process.env.STAGING_SUPABASE_PROJECT_REF;
assert(/^[a-z0-9]{20}$/.test(expectedRef || ""), "Set STAGING_SUPABASE_PROJECT_REF to the separate staging Supabase project ref");
assert.equal(expectedRef, "qxxnvkpbhjkdayomkzkf", "Only the verified separate staging database is allowed");
assert.equal(process.env.STAGING_ISOLATION_VERIFIED, "qxxnvkpbhjkdayomkzkf", "Independently verify the deployed database configuration, then set STAGING_ISOLATION_VERIFIED");
const stages = burstStages(process.env.STAGING_BURST_STAGES);
const p95LimitMs = Number(process.env.STAGING_P95_LIMIT_MS || 5000);
assert(Number.isInteger(p95LimitMs) && p95LimitMs >= 100 && p95LimitMs <= 10000, "p95 target must be 100–10000 ms");

const report = {
  environment: "separate Vercel staging project and Supabase database",
  host: base.hostname,
  expectedSupabaseProjectRef: expectedRef,
  startedAt: new Date().toISOString(),
  bursts: [],
  stages,
  p95LimitMs,
  workload: "one-off concurrent registration writes; not active browser users or sustained traffic",
};
const reportDir = path.join(process.cwd(), ".data", "load-tests");
await mkdir(reportDir, { recursive: true });
const reportPath = path.join(reportDir, `staging-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.json`);
const cookies = new Map();
const cookieHeader = () => [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
function saveCookies(response) {
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

async function accessProtectedDeployment() {
  const share = process.env.STAGING_SHARE_URL;
  if (!share) return;
  let url = new URL(share);
  assert.equal(url.origin, base.origin, "Staging share URL must belong to STAGING_BASE_URL");
  assert(url.searchParams.has("_vercel_share"), "Staging share URL is missing its Vercel share parameter");
  for (let hop = 0; hop < 5; hop++) {
    const response = await fetch(url, { redirect: "manual", headers: cookieHeader() ? { Cookie: cookieHeader() } : {}, signal: AbortSignal.timeout(20000) });
    saveCookies(response);
    if (![301, 302, 303, 307, 308].includes(response.status)) return;
    url = new URL(response.headers.get("location") || "", url);
    assert.equal(url.origin, base.origin, "Vercel share URL redirected outside staging");
  }
  throw new Error("Staging share URL redirected too many times");
}

async function api(route, { method = "GET", body, key } = {}) {
  const response = await fetch(new URL(route, base), {
    method,
    redirect: "manual",
    headers: {
      ...(cookieHeader() ? { Cookie: cookieHeader() } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(120000),
  });
  saveCookies(response);
  const contentType = response.headers.get("content-type") || "";
  assert(contentType.includes("application/json"), `${route} returned HTTP ${response.status} without JSON`);
  return { response, data: await response.json() };
}

function person(index, runId) {
  return {
    fullName: `Staging Load Applicant ${runId}-${index}`,
    nic: String(200000000000 + index),
    email: `load-${runId}-${index}@example.com`,
    phone: `07${String(10000000 + index)}`,
    terms: true,
  };
}

try {
  await accessProtectedDeployment();
  const ready = await api("/api/health/ready");
  assert.equal(ready.response.status, 200, "Staging health check failed");
  assert.equal(ready.data.status, "ready");
  const login = await api("/api/auth/login", { method: "POST", body: { email, password } });
  assert.equal(login.response.status, 200, "Staging administrator login failed");
  assert(cookies.has("unicom_staff_session"), "Staging login did not return a session cookie");
  const integration = await api("/api/admin/integrations");
  assert.equal(integration.response.status, 200);
  assert.equal(integration.data.storageMode, "supabase", "Staging must use Supabase");
  assert.equal(integration.data.google, null, "Do not run with a connected Google account");
  assert.equal(integration.data.smtp, null, "Do not run with configured SMTP");
  assert(!integration.data.settings.registration_sheet_id && !integration.data.settings.application_sheet_id, "Do not run with spreadsheet destinations");
  assert(!integration.data.settings.admin_notification_email, "Do not run with an admin notification address");
  const before = await api("/api/admin/stats");
  assert.equal(before.response.status, 200);
  assert.equal(before.data.stats.registrations, 0, "Staging database must be empty before this one-off test");
  assert.equal(before.data.stats.jobsPending, 0, "Staging queue must be empty before this test");

  const fields = [
    { id: "fullName", type: "text", label: "Full name", required: true },
    { id: "nic", type: "nic", label: "NIC", required: true },
    { id: "email", type: "email", label: "Email", required: true },
    { id: "phone", type: "phone", label: "Phone", required: true },
    { id: "terms", type: "terms", label: "Consent", required: true },
  ];
  const created = await api("/api/admin/forms", { method: "POST", body: { title: `Staging capacity test ${randomUUID().slice(0, 8)}`, type: "registration", fields } });
  assert.equal(created.response.status, 200, created.data.message || "Could not create staging form");
  const form = created.data.form;
  const automation = { ...form.email_automation, enabled: false, send_applicant_email: false, send_admin_notification: false };
  const published = await api(`/api/admin/forms/${form.id}`, { method: "PATCH", body: { is_active: true, email_automation: automation } });
  assert.equal(published.response.status, 200, published.data.message || "Could not publish staging form");
  assert.equal(published.data.form.email_automation.enabled, false);
  const runId = randomUUID().slice(0, 8);
  let nextIndex = 1;
  let accepted = 0;
  for (const size of stages) {
    const firstIndex = nextIndex;
    nextIndex += size;
    const started = performance.now();
    const results = await Promise.all(Array.from({ length: size }, async (_, offset) => {
      const index = firstIndex + offset;
      const start = performance.now();
      try {
        const { response, data } = await api(`/api/forms/${form.slug}`, { method: "POST", body: { data: person(index, runId) }, key: randomUUID() });
        return { status: response.status, code: data.code, referenceNo: data.referenceNo, ms: performance.now() - start };
      } catch (error) {
        return { status: "network-error", code: error?.name || "UNKNOWN", ms: performance.now() - start };
      }
    }));
    const result = summarizeBurst(`${size} simultaneous registrations`, results, performance.now() - started);
    report.bursts.push(result);
    // Preserve outcomes even if the subsequent reconciliation request fails.
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    accepted += results.filter((result) => result.status === 200).length;
    const responses = await api(`/api/admin/forms/${form.id}/responses?pageSize=1`);
    assert.equal(responses.response.status, 200);
    result.recordedResponses = responses.data.total;
    result.unconfirmedSaves = responses.data.total - accepted;
    result.passed = burstPasses(result, p95LimitMs);
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(result));
    if (!result.passed) {
      report.stopReason = "Stage failed correctness or latency target; higher load was not sent";
      break;
    }
  }
  const after = await api("/api/admin/stats");
  assert.equal(after.response.status, 200);
  report.finalCounts = { registrations: after.data.stats.registrations, pendingJobs: after.data.stats.jobsPending, sentEmails: after.data.stats.emailsSent };
  report.passed = report.bursts.length === stages.length && report.bursts.every(burst => burst.passed) && after.data.stats.jobsPending === 0 && after.data.stats.emailsSent === 0;
  report.highestPassingBurst = report.bursts.filter(burst => burst.passed).at(-1)?.requests || 0;
} catch (error) {
  report.passed = false;
  report.error = error?.message || String(error);
  console.error(report.error);
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`Staging report: ${reportPath}`);
  if (!report.passed) process.exitCode = 1;
}
