# Production domain: uticx.com

The canonical admissions URL is `https://uticx.com`.

Vercel production must use `NEXT_PUBLIC_APP_URL=https://uticx.com`. Deploy again after changing this value because Next.js includes public environment variables in the build. Configure `uticx.com` to serve the production deployment and `www.uticx.com` to redirect to `uticx.com`.

## Google Cloud

In the admissions OAuth web client, use these exact entries:

| Setting | Value |
| --- | --- |
| Authorised JavaScript origin | `https://uticx.com` |
| Authorised redirect URI | `https://uticx.com/api/auth/google/callback` |

An origin must not contain a path or trailing slash. The callback must include the full path. Existing localhost and deployment entries can stay available for development or rollback.

Sign in to `https://uticx.com/login` with the existing portal staff credentials, then open **System Settings → Google Integrations** and reconnect. Start a new authorization attempt after a domain change; do not reuse an old Google consent or callback tab. Host-only staff and OAuth state cookies from a different domain cannot complete that attempt.

The connection route moves an authorization attempt to the configured canonical domain before issuing OAuth state. The destination still requires its own staff login and administrator role. PKCE, state matching, the 10-minute state expiry, and the current saved connection remain protected.

If an external Google consent app remains in Testing, Gmail/Sheets refresh tokens normally expire after seven days. Review its publishing and verification status for ongoing use. This is separate from the short-lived authorization state cookie.

If a queue scheduler is configured, update its `admissions_app_url` Vault value to the same canonical origin. Existing spreadsheet IDs, Gmail identity, and database credentials do not change with the website domain.

References: [Vercel custom domains](https://vercel.com/docs/domains/working-with-domains/add-a-domain), [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Google token expiry](https://developers.google.com/identity/protocols/oauth2#expiration).
