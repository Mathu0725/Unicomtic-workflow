import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
export function appSecret(): Buffer {
    if (process.env.APP_SECRET && process.env.APP_SECRET.length >= 32)
        return createHash("sha256").update(process.env.APP_SECRET).digest();
    if (process.env.NODE_ENV === "production")
        throw new Error("APP_SECRET must contain at least 32 characters.");
    const dir = process.env.DATA_DIR || path.join(process.cwd(), ".data");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "secret.key");
    try {
        return Buffer.from(readFileSync(file, "utf8"), "hex");
    }
    catch (err: any) {
        if (err.code !== "ENOENT")
            throw err;
        const key = randomBytes(32);
        try {
            writeFileSync(file, key.toString("hex"), { flag: "wx", mode: 0o600 });
            return key;
        }
        catch (e: any) {
            if (e.code !== "EEXIST")
                throw e;
            return Buffer.from(readFileSync(file, "utf8"), "hex");
        }
    }
}
export function encrypt(value: string): string {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", dataKey(), iv);
    const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), body].map(b => b.toString("base64url")).join(".");
}
export function decrypt(value: string): string {
    const [iv, tag, body] = value.split(".").map(v => Buffer.from(v, "base64url"));
    const cipher = createDecipheriv("aes-256-gcm", dataKey(), iv);
    cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(body), cipher.final()]).toString("utf8");
}

// Keep saved Google/SMTP credentials readable when moving a development
// installation to a host with a new session-signing secret.
function dataKey(): Buffer {
    if (process.env.APP_DATA_KEY !== undefined) {
        if (!/^[a-f\d]{64}$/i.test(process.env.APP_DATA_KEY))
            throw new Error("APP_DATA_KEY must contain exactly 64 hexadecimal characters.");
        return Buffer.from(process.env.APP_DATA_KEY, "hex");
    }
    return appSecret();
}
