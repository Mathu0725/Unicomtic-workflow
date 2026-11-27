# Staff login security implementation

Production baseline: GitHub main at 851fc56051da80bf74fbcdcaecd5f75c7b8e79e2.
This plan covers staff login and does not change applicant access.

## 1. Reduce the lifetime of newly issued staff sessions

- Issue new staff cookies for 24 hours, with the same server-side expiration.
- Existing signed cookies retain their original expiration (up to seven days).
- Check login, role-based access, expiry and cookie settings. This is exposure
  reduction, not server-side revocation.

## 2. Firewall rate limit

- Obtain access to the existing Vercel firewall configuration and inspect its
  current published and draft rules before making any changes.
- Stage a narrowly scoped login rate-limit rule in log mode. Start with a
  generous threshold appropriate for shared campus IP addresses.
- The project owner publishes the draft and reviews traffic. Test any blocking
  action on preview before the owner publishes a production enforcement rule.
- Confirm the plan and costs before enabling paid features.

## 3. Revocable staff sessions

- Add a shared, durable session store with hashed opaque session identifiers,
  expiry and revocation, accessible only to server credentials. Use an indexed
  lookup with a small response to avoid fetching the large platform snapshot
  for every session check.
- Validate active session and current account status on every protected admin
  API, authentication session endpoint, and Google OAuth start/callback.
  Reject access if the security store cannot be checked.
- Logout revokes the current session; account disabling, role changes and
  password resets revoke affected sessions. Define a safe expiry cleanup path.
- Introduce a transition for existing cookies: after the store is deployed,
  require a fresh login before granting a revocable session. Ensure staff have
  working login credentials before activation.
- Verify direct protected requests, replays after logout, role/password changes,
  multiple server instances, storage failures and concurrent changes.

## 4. MFA

- The current staff accounts use custom password authentication, not Supabase
  Auth. Supabase Auth MFA cannot protect them until they are migrated to an
  identity provider or an equivalent established MFA implementation is added.
- Design per-user enrollment, challenge, secure recovery and access removal.
  Test the complete enrollment, failed/replayed challenge, recovery and logout
  flows before requiring MFA.
- Roll out to an owner-controlled test account first. Keep a verified recovery
  route and enroll remaining staff before making the second factor mandatory.

## 5. Release

- Keep migrations backward compatible; run database security advisors and check
  RLS/grants before enabling access from the application.
- Run focused security tests, the full suite, typecheck and production build.
  Verify a preview using a dedicated staff account before production rollout.
- Roll out by separate changes so a failed phase can be reversed. Check live
  health and retain the previous deployment and database rollback procedure.
