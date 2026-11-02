# Unicomtic-workflow Error Check Report

This file documents the main runtime and setup issues found during a repo inspection of `Mathu0725/Unicomtic-workflow`.

## 1. Node.js version mismatch

`package.json` declares:

- `"node": ">=24.0.0"`

This is a serious setup requirement. If the local machine is running Node 18 or 20, installation and build may fail.

### Why this matters
- Next.js 16 and React 19 are used.
- This project expects a modern Node runtime.
- Local dev machines may fail before the app even starts.

### Fix
- Use Node 24 or newer.
- Reinstall dependencies with:

```bash
nvm install 24
nvm use 24
npm install
```

---

## 2. Admin login is not configured without env variables

File checked:
- `src/app/api/auth/login/route.ts`

The login route explicitly checks for:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

If these are missing, the app throws:

> Administrator login needs server configuration. Contact admissions.

### Why this matters
- The login flow can fail even when the app code is valid.
- Production deployment will not work if the environment is not configured properly.

### Fix
Create or update `.env.local` (or deployment environment variables):

```env
ADMIN_EMAIL=your-admin@example.com
ADMIN_PASSWORD=your-strong-password
```

Also ensure the app is running with the correct environment configuration in Vercel/hosting.

---

## 3. Auth configuration is required in production

The route also has a production guard:

- if `APP_SECRET` is too short
- if `ADMIN_EMAIL` is missing
- if `ADMIN_PASSWORD` is missing

Then login and app boot behavior can be blocked in production.

### Fix
- Set a secure app secret with at least 32 characters.
- Ensure all required auth env vars are set before deployment.

---

## 4. Potential browser compatibility issue in client API helper

File checked:
- `src/lib/client/api.ts`

The code uses:

```ts
AbortSignal.any([...])
```

This can fail in older browsers or some limited browser environments.

### Why this matters
- Login or posting form data may fail in unsupported environments.
- It may appear as a network/request timeout or request not reaching the server.

### Fix
Use a fallback pattern or avoid `AbortSignal.any` if browser support is uncertain.

---

## 5. Strict JSON validation can cause runtime API failures

File checked:
- `src/lib/http.ts`

The request wrapper expects valid JSON for non-GET requests and throws errors like:

> Enter a valid JSON submission.

### Why this matters
- If a frontend sends malformed JSON or wrong content type, the route fails unexpectedly.
- This is a runtime issue, not a compile-time issue.

### Fix
- Make sure all API calls send proper `Content-Type: application/json`.
- Validate request payloads before submission.
- Keep frontend and backend request formatting consistent.

---

## 6. Main app pages look structurally okay

The following pages were checked and do not show obvious broken syntax:

- `src/app/page.tsx`
- `src/app/layout.tsx`
- `src/app/login/page.tsx`
- `src/app/register/page.tsx`

These files look generally valid and not obviously corrupted.

---

## 7. Most probable blockers in real deployment

The top blockers are:

1. Node version is too old
2. Missing environment variables for admin login
3. Missing production env config
4. Browser support issue in API helper
5. Invalid request payloads / malformed JSON

---

## Recommended next steps

1. Check the local Node version:

```bash
node -v
```

2. Confirm `.env.local` or deployment env is populated:

```bash
cat .env.local
```

3. Run install and build:

```bash
npm install
npm run build
```

4. If build still fails, inspect the exact error message and fix the offending dependency or config issue.

---

## Final note

The repository is not clearly broken by random bad code in the main app files, but it does have several environment and runtime configuration problems that can prevent it from working correctly.

The most important fixes are:

- upgrade to Node 24+
- configure `ADMIN_EMAIL` and `ADMIN_PASSWORD`
- verify all production environment variables are loaded
- confirm JSON requests are formatted correctly

