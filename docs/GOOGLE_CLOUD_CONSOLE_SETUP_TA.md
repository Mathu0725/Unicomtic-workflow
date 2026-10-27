# Google Cloud Console setup — Unicom TIC (Tanglish)

Indha guide namma project-oda **personal Gmail + Google Sheets connection**-ku.
Google Cloud Console steps, project settings, test flow ellam keezhe irukku.

**Flow:** Cloud project → Gmail/Sheets APIs → consent screen → OAuth client → `.env.local` → portal-la Connect Google.

Admissions Gmail account mattum Google permission kodukkanum. Namma public portal form-la apply pannura students Google account connect panna thevai illai.

## 1. Cloud project create pannunga

1. [Google Cloud Console](https://console.cloud.google.com/) open pannunga.
2. Admissions-ku use panna pora Gmail account-la sign in pannunga.
3. Top-la project selector → **New Project**.
4. Project name: `Unicom TIC Admissions`.
5. Create pannitu adhe project select aagirukka nu check pannunga.

Inime varra API, consent, credentials settings ellam **indha ore project-la** seiyunga.

## 2. Rendu APIs enable pannunga

**Menu → APIs & Services → Library** pogavum. Ovvoru API-yum search panni **Enable** click pannunga:

| API | Namma project-la use |
| --- | --- |
| Gmail API | Connected Gmail-la irundhu confirmation/admin notifications send panna |
| Google Sheets API | Registration/application rows create/update panna |

Enable aanadhum **APIs & Services → Enabled APIs & services**-la rendu APIs-um irukkanum.

Indha implementation-ku Google Drive API, Google Forms API, service account, API key create panna thevai illai. Existing `.env.example`-la service-account placeholder irundhaalum indha OAuth flow adhai use pannaadhu.

Reference: [Google API enable instructions](https://developers.google.com/workspace/guides/enable-apis).

## 3. Google Auth Platform configure pannunga

**Menu → Google Auth Platform → Branding** open pannunga. First time-na **Get Started** varum.

| Field | Enna kodukkanum |
| --- | --- |
| App name | `Unicom TIC Admissions` |
| User support email | Unga admissions Gmail |
| Audience | **External** — personal `@gmail.com` account-ku |
| Contact email | Neenga monitor pannura email |

Google kaattura policy-ai padichu, agree pannina setup finish pannunga. Logo field optional-a irundhaal later add pannalaam.

Already configure pannirundhaa **Branding**, **Audience**, **Data Access** pages-la settings edit pannalaam. Console-la labels konjam maarinaalum indha section names-ai follow pannunga.

### Test user add pannunga

**Google Auth Platform → Audience → Test users → Add users**:

1. Connect panna pora exact admissions Gmail address add pannunga.
2. **Save** pannunga.
3. Initial local test-ku publishing status **Testing**-la vechukkalaam.

Reference: [Google consent-screen setup](https://developers.google.com/workspace/guides/configure-oauth-consent).

## 4. Permissions / scopes add pannunga

**Google Auth Platform → Data Access → Add or remove scopes** open pannunga.
Kezhe irukkura scopes select pannunga; list-la kidaikkala-na manual entry option use pannunga. **Update/Save** pannunga.

```text
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/spreadsheets
```

Project code-la `email`, `profile` nu irukkura scopes, Console-la `userinfo.email`, `userinfo.profile` nu kaattalaam; avai equivalent identity permissions.

| Permission | Enna allow pannum |
| --- | --- |
| openid, email, profile | Connect pannura account-ai identify panna |
| gmail.send | Unga account saarba email send panna; inbox read permission kodukkaadhu |
| spreadsheets | Unga account access panna mudiyura spreadsheets-ai read/create/edit panna; scope oru tab-ku mattum limited illai |

Namma current code request pannura Gmail/Sheets scopes rendu-me **Sensitive** category. Dedicated admissions account use pannina account-la irukkura data scope clear-a irukkum.

References: [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes), [identity scope equivalents](https://developers.google.com/identity/protocols/oauth2#expiration).

## 5. Web OAuth client create pannunga

**Google Auth Platform → Clients → Create client**:

| Field | Value |
| --- | --- |
| Application type | **Web application** |
| Name | `Unicom TIC Portal Local` |
| Authorized JavaScript origins | Indha server OAuth implementation-ku blank-a vidalaam |
| Authorized redirect URIs | Keezhe irukkura full callback URL |

**Local callback — exact-a copy pannunga:**

```text
http://localhost:3000/api/auth/google/callback
```

**Create** pannunga. Google kodukkura **Client ID** and **Client secret**-ai secure-a save pannunga; available-a irundhaal credential JSON download pannalaam. Project-ku andha rendu values dhaan thevai.

Client ID usually `.apps.googleusercontent.com`-la mudiyum. Secret-ai chat-la anuppavo Git-la commit pannavo vendaam; server `.env.local`-la podunga.

Reference: [Web OAuth client creation](https://developers.google.com/workspace/guides/create-credentials#web-application).

## 6. Project `.env.local` update pannunga

Workspace root-la `.env.local` irukku. Existing unrelated settings-ai retain panni, indha values-ai set pannunga. Same key duplicate-a add panna vendaam.

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=PASTE_YOUR_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=PASTE_YOUR_CLIENT_SECRET
```

Real Client ID-ai full-a paste pannunga; example suffix-ai thirumba append panna vendaam.

Admin login and encryption-ku indha settings-um thevai:

```env
ADMIN_EMAIL=your-admissions-account@gmail.com
ADMIN_PASSWORD=YOUR_PORTAL_ADMIN_PASSWORD
APP_SECRET=YOUR_EXISTING_OR_NEW_RANDOM_SECRET
CRON_SECRET=YOUR_SEPARATE_RANDOM_WORKER_SECRET
```

`ADMIN_PASSWORD` portal login password; unga Gmail password illai. Existing `APP_SECRET` already set pannirundhaa adhaiye keep pannunga. Adhai maathina existing Google/SMTP secrets decrypt aagaadhu; reconnect seiyanum.

Pudhu secret thevai-na PowerShell-la indha command run pannunga. APP_SECRET and CRON_SECRET-ku thaniththani values generate pannunga:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Environment edit pannadhum dev server-ai stop panni restart pannunga. Indha Windows machine-la:

```powershell
Set-Location -LiteralPath 'C:\Users\unico\Downloads\New folder (6)'
& 'C:\Program Files\nodejs\npm.cmd' run dev
```

## 7. Portal-la Google connect pannunga

1. [Staff login](http://localhost:3000/login) open pannunga.
2. `.env.local`-la set panna `ADMIN_EMAIL` / `ADMIN_PASSWORD` use pannunga.
3. [Google Integrations](http://localhost:3000/admin/google-integrations) → **Connect Google**.
4. Test users-la add panna admissions Gmail select pannunga.
5. App name/account/scopes correct-a irukka nu paaththu Gmail + Sheets permissions grant pannunga.
6. Portal-ku thirumbi vandhadhum connected email correct-a irukkanum.
7. **Create admissions spreadsheet** click pannunga. `Registrations`, `Applications` tabs create aagum. Existing Sheet use panna URL/ID paste panni save pannalaam; connected Gmail-ku edit access irukkanum.
8. Notification recipient set panni, sender-a **Connected Gmail account** select panni **Save connections** pannunga.

Indha project server offline access request panni refresh token-ai encrypted-a save pannum; manual-a access token paste panna thevai illai. [Google server OAuth flow](https://developers.google.com/identity/protocols/oauth2/web-server).

## 8. Working-a irukka nu test pannunga

1. [Email Center](http://localhost:3000/admin/email)-la unga own email-ku test send pannunga.
2. Job `sent` and provider message ID varudha nu paarunga; actual inbox/Spam/Sent-um check pannunga.
3. **Workshops**-la future date, venue, capacity vechchu workshop create pannunga.
4. **Forms Studio**-la form create panni workshop selection enable pannunga; publish/open pannunga.
5. Unga test details use panni public form once submit pannunga.
6. Dashboard count, workshop booking, Sheet row, confirmation job check pannunga.
7. Same NIC/email/mobile details-ai repeat pannina duplicate reject aaganum; innoru application/seat create aaga koodaadhu.

`sent` = Gmail/SMTP message-ai accept panniyirukku. Inbox delivery/read confirmation-ai current portal track pannaadhu.

Sheet export submission-kku appuram immediate-a try aagum. Retries/reminders-ku scheduler **every minute** `POST /api/cron/process-queue` call pannanum; header `Authorization: Bearer YOUR_CRON_SECRET`. Worker setup, database and external Google Forms details-ku [full project setup](GOOGLE_ADMISSIONS_SETUP.md) paarunga.

## 9. Testing-lendhu production-ku pogumbodhu

External app **Testing**-la Gmail/Sheets permission oda issue aana refresh token **7 days**-la expire aagum. App-ai public-a deploy pannadhu mattum indha setting-ai maathaadhu. [Google token-expiration rule](https://developers.google.com/identity/protocols/oauth2#expiration).

Production-ku:

1. Real HTTPS portal domain decide pannunga.
2. OAuth client's **Authorized redirect URIs**-la production callback add pannunga. Example mattum:

   ```text
   https://admissions.example.com/api/auth/google/callback
   ```

3. Hosting environment-la `NEXT_PUBLIC_APP_URL=https://admissions.example.com` set panni rebuild/redeploy pannunga; example domain-ai unga actual domain-oda replace pannunga.
4. **Audience**-la Production publishing flow complete pannunga. Branding/Verification Center ketkura real app URLs, privacy policy, domain verification and scope explanation provide pannunga. Sensitive-scope verification thevaiyaa enbadhai unga app use case/publishing state base-la Google decide pannum. Production status mattum verified status guarantee pannaadhu.
5. Production portal-la Google-ai reconnect panni fresh authorization test pannunga. Production token-um revoke/expire aagalaam.
6. Production database and scheduler-ai [full setup guide](GOOGLE_ADMISSIONS_SETUP.md)-padi configure pannunga.

`http`/`https`, hostname, port, callback path ellam registered URI-oda match aaganum. Local test-ku portal-ai consistently `http://localhost:3000`-la open pannunga. [Redirect URI matching rules](https://developers.google.com/identity/protocols/oauth2/web-server).

## 10. Common errors

| Error / symptom | Check / fix |
| --- | --- |
| `redirect_uri_mismatch` | Portal Google Integrations-la kaattura callback-ai Console client's redirect URIs-oda exact-a compare pannunga; env change-ku restart/redeploy thevai |
| `access_denied` / test-user blocked | Audience → Test users-la connect pannura exact Gmail add pannunga; selected Cloud project/client correct-a irukkanum |
| `invalid_client` | Client ID and secret same Web client-lendhu copy pannirukkanum; placeholder/extra spaces remove pannunga |
| API disabled / `SERVICE_DISABLED` | Andha OAuth client irukkura project-la Gmail API, Sheets API enable pannunga |
| Insufficient permissions | Rendu API scopes add pannitu portal-la reconnect panni permissions grant pannunga |
| `invalid_grant` / 7 days-kku appuram disconnect | Testing token expire/revoke aagirukkalaam; reconnect pannunga; ongoing use-ku production publishing review pannunga |
| Sheet permission denied / not found | Sheet ID correct-a irukkanum; connected Gmail-ku andha Sheet-la editor access irukkanum |
| Google login success, Gmail connect aagala | Login mattum identity permission request pannum; admin Google Integrations-la **Connect Google** complete pannunga |
| External Google Form webhook localhost-ku varala | Apps Script reach panna public HTTPS portal URL thevai; local Gmail/Sheet export test thaniya seiyalaam |

## SMTP thevaiyaa?

**Connected Gmail account** sender use pannina Cloud OAuth setup podhum; SMTP host/password fill panna thevai illai. SMTP use panna virumbina [full setup guide — Optional SMTP](GOOGLE_ADMISSIONS_SETUP.md#4-optional-smtp) follow pannunga. Adhu Google Cloud Console setup-lendhu separate-aana sender option.

## Setup complete checklist

- [ ] Ore Cloud project-la Gmail API + Sheets API enabled.
- [ ] External audience + correct test Gmail saved.
- [ ] Identity + gmail.send + spreadsheets scopes saved.
- [ ] Web client + exact localhost callback saved.
- [ ] Real client ID/secret `.env.local`-la saved; server restarted.
- [ ] Portal Google Integrations-la correct Gmail connected.
- [ ] Spreadsheet created/configured and connections saved.
- [ ] Test email, form submission, booking, Sheet row verified.
- [ ] Deployment-ku production callback, publishing, database, scheduler configured.
