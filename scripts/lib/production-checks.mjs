import { createHash, createDecipheriv } from "node:crypto";

export function productionChecks(env) {
    let url;
    try { url = new URL(env.NEXT_PUBLIC_APP_URL); } catch { /* Report below. */ }
    const configured = value => Boolean(value && !/^(your[-_]|dummy|change[-_]|secure_cron_secret_key_2025)/i.test(value));
    return [
        { name: "APP_SECRET", ok: configured(env.APP_SECRET) && env.APP_SECRET.length >= 32, message: "Use a stable random signing secret of at least 32 characters." },
        { name: "APP_DATA_KEY", ok: env.APP_DATA_KEY === undefined || /^[a-f\d]{64}$/i.test(env.APP_DATA_KEY), message: "Optional raw encryption key: exactly 64 hex characters. Preserve the existing key when moving saved credentials." },
        { name: "ADMIN_EMAIL", ok: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.ADMIN_EMAIL || ""), message: "Configure the authorized administrator address." },
        { name: "ADMIN_PASSWORD", ok: configured(env.ADMIN_PASSWORD) && env.ADMIN_PASSWORD.length >= 12, message: "Set an administrator password of at least 12 characters." },
        { name: "CRON_SECRET", ok: configured(env.CRON_SECRET) && env.CRON_SECRET.length >= 32, message: "Set a random scheduler secret of at least 32 characters." },
        { name: "NEXT_PUBLIC_APP_URL", ok: Boolean(url && url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash && !/^(localhost|127\.|0\.|\[::1\])/i.test(url.hostname)), message: "Set the final HTTPS origin, without a path or query." },
        { name: "SUPABASE", ok: /^https:\/\/[a-z]{20}\.supabase\.co\/?$/.test(env.NEXT_PUBLIC_SUPABASE_URL || "") && configured(env.SUPABASE_SERVICE_ROLE_KEY) && configured(env.NEXT_PUBLIC_SUPABASE_ANON_KEY), message: "Use the existing Supabase URL and both project keys; keep the server key private." },
        { name: "STORAGE_MODE", ok: env.ALLOW_LOCAL_STORAGE !== "true" && env.ALLOW_DATABASE_INITIALIZE !== "true" && env.SEED_DEMO_DATA !== "true", message: "Disable local storage, demo seeding and first-time initialization for Vercel." },
    ];
}

export function savedCredentialChecks(env, integrations) {
    const values = [integrations?.google?.refresh_token, integrations?.smtp?.password].filter(Boolean);
    if (!values.length) return { name: "SAVED_CREDENTIALS", ok: true, message: "No encrypted provider credentials to migrate." };
    try {
        const key = env.APP_DATA_KEY !== undefined
            ? (/^[a-f\d]{64}$/i.test(env.APP_DATA_KEY) ? Buffer.from(env.APP_DATA_KEY, "hex") : null)
            : env.APP_SECRET?.length >= 32 ? createHash("sha256").update(env.APP_SECRET).digest() : null;
        if (!key) throw new Error();
        for (const value of values) {
            const [iv, tag, body] = value.split(".").map(part => Buffer.from(part, "base64url"));
            const cipher = createDecipheriv("aes-256-gcm", key, iv);
            cipher.setAuthTag(tag);
            cipher.update(body); cipher.final();
        }
        return { name: "SAVED_CREDENTIALS", ok: true, message: "Saved provider credentials decrypt with the deployment key; no provider request was made." };
    } catch {
        return { name: "SAVED_CREDENTIALS", ok: false, message: "Saved provider credentials cannot decrypt. Preserve the existing data key before enabling the scheduler." };
    }
}
