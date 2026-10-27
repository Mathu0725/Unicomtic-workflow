# Student documents in Google Drive

## Connect and configure

1. In the Google Cloud project used by this portal's OAuth client, enable **Google Drive API**. Add `https://www.googleapis.com/auth/drive.file` to the OAuth consent screen's data access scopes if required by the project's configuration. Existing Sheets and Gmail permissions remain in use.
2. Sign in to the portal as an administrator and open **System Settings → Google integrations → Google Drive · Student documents**.
3. Choose **Connect Google Drive**, select the admissions Google account, and approve the requested permission on Google's consent screen. Connecting Gmail/Sheets alone does not imply Drive consent. The portal preserves its previous Google connection when consent is declined or required permission is missing.
4. Choose **Create documents folder**. The portal creates **Unicom TIC Student Documents** in the connected account's Drive. If setup is interrupted, **Finish documents folder setup** reuses its reserved Drive ID. **Check documents folder** verifies an existing folder.
5. Open a form's **Builder** and add **File upload (PDF / image)** questions. Set their labels and whether they are required, then save. Each question accepts one PDF, JPG or PNG up to 4 MB. These uploads work in native portal forms; external Google Forms file questions are not imported as trusted document receipts.

The `drive.file` permission covers portal-created or explicitly authorized files, rather than access to the account's whole Drive. See [Google's scope guide](https://developers.google.com/workspace/drive/api/guides/api-specific-auth). The Drive permission is requested by the separate Drive connection action; an existing Sheets/Gmail connection continues working without it.

## Applicant and admin behavior

The student chooses a file, waits for its upload confirmation, then submits the form normally. Submission is disabled while a file is uploading. On failure, **Retry same file** uses the same upload attempt and reserved Drive file ID. File contents are checked against the allowed format and filename; empty files and oversized documents are rejected. At most ten document questions are allowed per form.

A successful form submission attaches each verified upload to that response. In **Forms Studio → Submissions / Responses**, the **Documents** column opens the files in Google Drive. The response CSV/Sheets data contains their Drive URLs. File access follows the Drive account and folder's sharing permissions. The portal does not publish documents or grant public/anyone permissions.

Uploads are available to attach for 24 hours. Uploading a file does not submit the application. If questions change, the student refreshes and uploads documents for the current form version. Removing an attachment or clearing a browser draft removes it from the form; it does not delete the file from Drive. Admissions staff can review unused files in the dedicated folder under their document retention policy.

## Persistence and recovery

The server saves upload metadata and reserved Drive IDs in `platform_state.data.documentUploads`; it stores no file bytes in the admissions snapshot. Bytes go directly from the portal server to Google's multipart upload endpoint. Google tokens remain encrypted in server storage and are never returned to applicants.

Each upload is bound to a form, question, version, content digest and unpredictable attempt key. A signed receipt is checked before attachment and can be claimed by only one response. An interrupted upload or final save can be retried with the same file and attempt: an existing Drive file is verified rather than duplicated. Folder and file creation do not run inside database retry callbacks. Google API calls use the documented [folder creation](https://developers.google.com/workspace/drive/api/guides/folder) and [multipart upload](https://developers.google.com/workspace/drive/api/guides/manage-uploads) APIs.

If Drive reports `DRIVE_API_DISABLED`, enable Drive API in the same Cloud project as `GOOGLE_CLIENT_ID`. If the folder is trashed or inaccessible, restore its access in the original account and check it again. Reconnecting a different Google account requires that account's own folder setup. Existing uploaded files stay with their original owner.

Verification: `tests/integration/drive-documents.test.ts` uses synthetic files and mocked Google APIs in isolated temporary storage. It verifies private folder setup, size/type validation, upload retries, signed receipt attachment and access restrictions. `google-connection-auth.test.ts` verifies explicit Drive consent without granting portal sign-in access. No real student documents are uploaded by the tests.
