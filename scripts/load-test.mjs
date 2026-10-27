import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const candidateSessionFor = createRequire(import.meta.url)("../tests/fixtures/candidate-session.cjs");

// Always owns an isolated local server, data folder and build cache. Never targets a live URL.
const root = process.cwd(), port = Number(process.env.LOAD_TEST_PORT || 3101);
const originalNextEnv = await readFile(path.join(root, "next-env.d.ts"), "utf8").catch(() => null);
const concurrency = Number(process.env.LOAD_TEST_USERS || 300);
assert(Number.isInteger(concurrency) && concurrency >= 10 && concurrency <= 1000, "LOAD_TEST_USERS must be 10–1000");
assert(port !== 3000 && port > 1024 && port < 65536, "Use an isolated port, not the live portal port");
await mkdir(path.join(root, ".data", "load-tests"), { recursive: true });
const dir = await mkdtemp(path.join(root, ".data", "load-tests", "run-"));
const relative = value => path.relative(root, value).replaceAll("\\", "/");
const configPath = path.join(dir, "tsconfig.json");
const sourceRoot = path.relative(dir, root).replaceAll("\\", "/");
await writeFile(configPath, JSON.stringify({ extends: `${sourceRoot}/tsconfig.json`, compilerOptions: { baseUrl: root, incremental: false }, include: [`${sourceRoot}/src/**/*.ts`, `${sourceRoot}/src/**/*.tsx`], exclude: [`${sourceRoot}/node_modules`] }));
const password = randomBytes(24).toString("hex"), email = "load-test@example.com";
const base = `http://127.0.0.1:${port}`;
const loadSecret = randomBytes(32).toString("hex");
process.env.APP_SECRET = loadSecret;
const server = spawn(process.execPath, [path.join(root, "scripts/load-test-server.cjs")], {
    cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "development", DISABLE_BUILD_CACHE: "true", LOAD_TEST_SERVER_PORT: String(port), DATA_DIR: dir, NEXT_DIST_DIR: relative(path.join(dir, "next")), NEXT_TSCONFIG_PATH: relative(configPath), NEXT_PUBLIC_APP_URL: base, NEXT_PUBLIC_SUPABASE_URL: "https://mock.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "load-test-unused", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", ADMIN_EMAIL: email, ADMIN_PASSWORD: password, APP_SECRET: loadSecret, CRON_SECRET: randomBytes(32).toString("hex"), SEED_DEMO_DATA: "false" },
});
let logs = "", exited = false;
server.stdout.on("data", chunk => { logs = (logs + chunk).slice(-4000); });
server.stderr.on("data", chunk => { logs = (logs + chunk).slice(-4000); });
server.once("exit", () => { exited = true; });
const report = { environment: "isolated local Next.js development server; no real Google calls or email sends", concurrency, results: [] };
let cookie = "";
async function api(url, method = "GET", body, key, credentials = cookie) {
    const response = await fetch(base + url, { method, headers: { cookie: credentials, "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(60000) });
    const data = await response.json();
    return { response, data };
}
const fields = [
    { id: "fullName", type: "text", label: "Full name", required: true },
    { id: "nic", type: "nic", label: "NIC", required: true },
    { id: "email", type: "email", label: "Email", required: true },
    { id: "phone", type: "phone", label: "Phone", required: true },
    { id: "terms", type: "terms", label: "Consent", required: true },
];
const person = n => ({ fullName: `Load Applicant ${n}`, nic: String(200000000000 + n), email: `load${n}@example.com`, phone: "07" + String(10000000 + n), terms: true });
function metrics(name, results, ms) {
    const latencies = results.map(r => r.ms).sort((a, b) => a - b);
    const result = { name, requests: results.length, statuses: Object.fromEntries([...new Set(results.map(r => r.status))].map(status => [status, results.filter(r => r.status === status).length])), durationMs: Math.round(ms), p50Ms: Math.round(latencies[Math.floor(latencies.length * .5)]), p95Ms: Math.round(latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * .95))]) };
    report.results.push(result); console.log(JSON.stringify(result));
}
async function burst(name, requests) {
    const start = performance.now();
    const results = await Promise.all(requests.map(async request => {
        const t = performance.now(), { response, data } = await api(...request);
        return { status: response.status, data, ms: performance.now() - t, replay: response.headers.has("Idempotency-Replayed") };
    }));
    metrics(name, results, performance.now() - start);
    return results;
}
try {
    const deadline = Date.now() + 90000;
    while (true) {
        if (exited) throw new Error("Isolated test server exited: " + logs);
        try { const r = await fetch(base + "/api/campaigns", { signal: AbortSignal.timeout(5000) }); if (r.ok) break; } catch { }
        if (Date.now() > deadline) throw new Error("Isolated test server did not start: " + logs);
        await delay(250);
    }
    const login = await api("/api/auth/login", "POST", { email, password });
    assert.equal(login.response.status, 200);
    cookie = login.response.headers.get("set-cookie").split(";")[0];
    const setup = await api("/api/admin/integrations");
    assert.equal(setup.data.storageMode, "local"); assert.equal(setup.data.google, null);
    await api("/api/admin/integrations", "POST", { action: "save", email_provider: "gmail", admin_notification_email: "staff@example.com", registration_sheet_id: "load-test-sheet", application_sheet_id: "load-test-sheet" });
    const formResult = await api("/api/admin/forms", "POST", { title: "Load test registrations", type: "registration", fields });
    assert.equal(formResult.response.status, 200);
    const registrationUrl = `/api/forms/${formResult.data.form.slug}`;
    await api(registrationUrl, "POST", { data: {} }); // Compile and validate before measuring.
    await api("/api/admin/stats");
    const poll = (async () => {
        const results = [], start = performance.now();
        for (let n = 0; n < 30; n++) {
            const t = performance.now(), { response } = await api("/api/admin/stats");
            results.push({ status: response.status, ms: performance.now() - t });
            await delay(20);
        }
        metrics("dashboard reads during submission burst", results, performance.now() - start);
        assert(results.every(r => r.status === 200));
    })();
    const registrations = await burst("unique simultaneous registrations", Array.from({ length: concurrency }, (_, i) => [registrationUrl, "POST", { data: person(i + 1) }, randomUUID()]));
    assert(registrations.every(r => r.status === 200), "Every distinct registration should be accepted");
    assert.equal(new Set(registrations.map(r => r.data.referenceNo)).size, concurrency);
    await poll;

    const retryId = concurrency + 1, retryKey = randomUUID();
    const retries = await burst("50 overlapping retries of one submission", Array.from({ length: 50 }, () => [registrationUrl, "POST", { data: person(retryId) }, retryKey]));
    assert(retries.every(r => r.status === 200));
    assert.equal(new Set(retries.map(r => r.data.referenceNo)).size, 1);
    assert.equal(retries.filter(r => r.replay).length, 49);
    const lostKey = randomUUID(), lostBody = { data: person(concurrency + 2) }, lostStart = performance.now();
    const lostResponse = await fetch(base + registrationUrl, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": lostKey }, body: JSON.stringify(lostBody), signal: AbortSignal.timeout(60000) });
    assert.equal(lostResponse.status, 200);
    await lostResponse.body?.cancel(); // Discard acknowledgement: client does not learn the reference.
    const recovered = await api(registrationUrl, "POST", lostBody, lostKey);
    assert.equal(recovered.response.status, 200); assert(recovered.response.headers.has("Idempotency-Replayed"));
    report.responseLossRecovery = { passed: true, durationMs: Math.round(performance.now() - lostStart), replayed: true };
    const duplicates = await burst("duplicate identity with different retry keys", Array.from({ length: 20 }, () => [registrationUrl, "POST", { data: person(retryId) }, randomUUID()]));
    assert(duplicates.every(r => r.status === 409));

    const starts = new Date(Date.now() + 5 * 86400000);
    const workshop = await api("/api/admin/workshops", "POST", { campaignId: "camp-2025", title: "Load test limited workshop", venue: "Test campus", address: "Test campus address", startTime: starts.toISOString(), endTime: new Date(+starts + 3600000).toISOString(), capacity: 25, daysBeforeReminders: [3, 1] });
    assert.equal(workshop.response.status, 200, workshop.data.message);
    const workshopId = workshop.data.workshop.id;
    const workshopForm = await api("/api/admin/forms", "POST", { title: "Load test workshop booking", type: "registration", fields, workshop_config: { enabled: true, required: true, workshop_ids: [workshopId] } });
    const workshopUrl = `/api/forms/${workshopForm.data.form.slug}`;
    const bookings = await burst("100 contenders for 25 workshop seats", Array.from({ length: 100 }, (_, i) => [workshopUrl, "POST", { data: person(concurrency + 100 + i), workshopId }, randomUUID()]));
    assert.equal(bookings.filter(r => r.status === 200).length, 25);
    assert.equal(bookings.filter(r => r.status === 409).length, 75);

    const appForm = await api("/api/admin/forms", "POST", { title: "Load test applications", type: "application", fields });
    const beforeApplications = JSON.parse(await readFile(path.join(dir, "platform.json"), "utf8")).data;
    const applications = await burst("concurrent verified applications linked to registrations", Array.from({ length: Math.min(50, concurrency) }, (_, i) => {
        const student = beforeApplications.students.find(student => student.email === person(i + 1).email);
        const registration = beforeApplications.registrations.find(registration => registration.student_id === student.id);
        return [`/api/forms/${appForm.data.form.slug}`, "POST", { data: person(i + 1) }, randomUUID(), candidateSessionFor(beforeApplications, registration)];
    }));
    assert(applications.every(r => r.status === 200));
    const snapshotText = await readFile(path.join(dir, "platform.json"), "utf8");
    report.snapshotBytes = Buffer.byteLength(snapshotText);
    const snapshot = JSON.parse(snapshotText).data;
    assert.equal(snapshot.registrations.length, concurrency + 27);
    assert.equal(snapshot.students.length, concurrency + 27);
    assert.equal(snapshot.workshopBookings.length, 25);
    assert.equal(snapshot.applications.length, Math.min(50, concurrency));
    assert(snapshot.outbox.every(j => j.status === "queued" && j.attempts === 0), "Load tests must not contact email or Google providers");
    try {
        await writeFile(path.join(dir, "platform.json"), '{"version":1,"data":');
        const failedRead = await api("/api/admin/stats");
        assert.equal(failedRead.response.status, 500); assert.equal(failedRead.data.code, "STORAGE_CORRUPT");
        assert(!JSON.stringify(failedRead.data).includes(dir));
        assert.equal(await readFile(path.join(dir, "platform.json"), "utf8"), '{"version":1,"data":');
        report.storageFaultRecovery = { passed: true, resetPrevented: true, safeErrorCode: failedRead.data.code };
    } finally { await writeFile(path.join(dir, "platform.json"), snapshotText); }
    assert.equal((await api("/api/admin/stats")).data.stats.registrations, concurrency + 27);
    assert.equal(new Set(snapshot.outbox.map(j => j.key)).size, snapshot.outbox.length);
    report.finalCounts = { registrations: snapshot.registrations.length, students: snapshot.students.length, applications: snapshot.applications.length, confirmedSeats: snapshot.workshopBookings.length, uniqueJobs: snapshot.outbox.length, actualProviderCalls: 0 };
    report.passed = true;
    console.log(JSON.stringify({ passed: true, ...report.finalCounts }));
} catch (error) {
    report.passed = false; report.error = error.message; process.exitCode = 1;
    console.error(error.message); console.error(logs);
} finally {
    await writeFile(path.join(dir, "report.json"), JSON.stringify(report, null, 2));
    console.log("Load test report: " + path.join(dir, "report.json"));
    if (process.platform === "win32" && !exited) {
        // Stop only the harness-owned CLI and its children; never other apps.
        await new Promise(resolve => {
            const stop = spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
            stop.once("error", resolve); stop.once("exit", resolve);
        });
    } else server.kill("SIGTERM");
    for (let n = 0; n < 50 && !exited; n++) await delay(100);
    if (!exited) server.kill("SIGKILL");
    // The Next CLI writes this shared generated file even with an isolated dist.
    // Restore it only while it still points at this harness's own output.
    const currentNextEnv = await readFile(path.join(root, "next-env.d.ts"), "utf8").catch(() => "");
    if (originalNextEnv !== null && currentNextEnv.includes(`${relative(dir)}/next/`))
        await writeFile(path.join(root, "next-env.d.ts"), originalNextEnv);
}
