# Form Builder audit and delivery plan

## Scope

Reorganize the existing admissions editor around a field library, an applicant-style canvas and contextual settings. Keep the current repository, staff authorization, Google connection, notification outbox, document uploads and admissions identity protections. Add missing capabilities that improve the daily admissions workflow; optional general-purpose survey features are listed separately.

## Existing feature inventory and gaps

| Area | Existing implementation | Work in this change |
| --- | --- | --- |
| Editor | All questions expose every setting; long technical integration cards; manual save only | Three-area editor, responsive panels, contextual field settings, drag reorder and keyboard buttons, duplicate question, undo/redo, actual unsaved preview |
| Saving | Version-checked manual updates change the public form immediately | Separate server-side editor draft, debounced autosave, confirmed save status, recovery after uncertain saves, conflict protection, explicit publish/update |
| Content | Plain description; customizable popup and bottom messages | Secure structured rich text, grouped message controls, preserved visibility switches |
| Questions | 13 stored field types; checkbox and number missing from library; checkbox missing from applicant renderer | Expose supported types, render checkboxes correctly, help text/defaults, relevant validation, informational sections, safe conditional visibility |
| Confirmation | Configured message and committed reference ignored by thank-you screen | Show the committed reference and configured success text, including recovered submissions |
| Identity and retries | Normalized email/NIC/phone, one registration/application per intake, transactional identity checks, persistent idempotency keys | Reuse safeguards; add optional unique custom answers without weakening admissions rules |
| Google Sheets | Per-form overrides, stable answer IDs, queued sync, retries and reference-based row upsert | Simpler destination modes, explicit off, worksheet lookup/access test and per-form spreadsheet creation without changing global destinations |
| Duplication | Copies a live form and its Google destinations | Copy to a closed draft with exports off; keep wording, fields and email templates for explicit review |
| Responses | Counts, search and CSV; browser receives every response; CSV formula injection risk | Bounded server pagination/filtering and safe CSV export |
| Storage/security | Private Supabase JSON snapshot, compare-and-swap transaction, staff roles, CSRF, safe file receipts | Reuse existing boundaries. No new table, policy, service or environment secret required |

## Implementation order

1. Add reusable editor values/history, safe rich content, field validation and draft version rules.
2. Replace the cluttered editor UI while preserving the existing integration actions and message controls.
3. Apply the same field rules to applicant rendering and server validation; repair confirmation.
4. Improve per-form Sheets setup, duplication and response exports/pagination.
5. Run regression and production-build checks, verify isolated flows, then publish and verify the release.

## Optional capabilities deferred

Signatures, rating/grid/country field variants, unrestricted regular expressions, respondent editing, arbitrary reference formats, multi-page branching, template catalogs, separate Google identities per form and custom spreadsheet column remapping are outside the current admissions requirements. A section is a heading within one page. Conditional rules reference earlier questions, which prevents dependency cycles. Stable answer IDs remain the spreadsheet keys so label edits preserve existing columns and historical answers.

Admission identity uniqueness remains mandatory. Turning it off would conflict with existing intake and workshop records. Additional field uniqueness may tighten the policy; it does not bypass the established admissions identity rules.

## Release verification

Controlled production-build verification on 2026-10-28 accepted 300 distinct concurrent synthetic submissions with 300 unique references in 3,959 ms on the local test machine. An idempotent retry returned the same committed reference, hidden answers were excluded, and pagination/CSV covered all 301 synthetic records. No external email or spreadsheet writes were requested. This measures the isolated local-storage test build; it is not a production Supabase throughput guarantee.

The two existing production form definitions were checked read-only against the new configuration schemas and passed. Existing public content was not changed by that check. Automated UI tests exercise real DOM interactions and the rich-text editor. Browser access is disabled in Work settings, so visual browser QA is not verified. Google worksheet inspection/creation and uncertain-creation handling are covered by mocked provider tests; production verification uses read-only inspection of the connected destination, without creating a test spreadsheet or sending applicants email.

Final regression verification passed 420 tests across 43 files on 2026-10-28. The final production build, including TypeScript validation, passed; all 89 function traces were checked and contained zero private files. Never include credentials or applicant records in verification artifacts.

Compatibility inspection also found an existing registration definition without its required NIC question and a custom district question without the admissions mapping. The user approved restoring NIC. The release includes a version-checked definition repair, preserving historical responses, and recognizes both an original answer ID and its system alias, including a phone answer also used for WhatsApp. The first newly added NIC/email/phone/district question is mapped automatically when that admissions field is missing.

## Administrator guide

1. Open a form's Builder. **Build** contains the field library, applicant-style canvas and settings for the selected question. On smaller screens, use **Add fields / Form canvas / Settings** to switch panels.
2. Click a question to edit its label, help, choices and applicable validation. Use drag handles or the up/down buttons to reorder. Duplicate creates a new question key; Undo restores deletions. Keep required admissions identity questions.
3. Changes autosave into a private editor draft after a short pause. **Draft saved** means the server confirmed that draft. Applicants keep seeing the published form until **Publish form / Update form** succeeds.
4. **Preview** shows the current draft with desktop/mobile widths and interactive conditional questions. Preview does not submit answers or upload documents.
5. Under **Settings**, configure general content and public URL, availability, **Messages & popup**, success text, email notifications and workshops. Choosing Draft, Paused or Closed for a live form takes it out of public use when updated. A new draft opens only after explicit publication.
6. Under **Integrations**, select the admissions destination, a separate spreadsheet or sync off. For a separate spreadsheet, paste a URL and load worksheets, or create a new spreadsheet. Creating a destination does not replace another form's destination. Publish to activate the selection. Google must grant the connected account Editor access for exports.
7. The optional external Google Form importer remains under an expandable section. Publish its configuration before copying Apps Script or importing responses. The existing installable **On form submit** trigger is required for live webhook imports.
8. Open **Responses** to search/filter, page through results, inspect a response by reference, export CSV or queue an existing response for export. CSV includes historical answers to removed questions and guards formula-like cells.

If another administrator saves a newer draft, local changes remain on the page and autosave stops. Review/reload the latest version before saving. Discard uses the draft version already reviewed by the administrator; it cannot silently discard a newer draft from another session.

## Files and data compatibility

The existing Builder route now delegates to reusable components under `src/components/form-builder/`. Shared question/rich-text/confirmation/response-detail components support the editor and public form. `src/lib/forms/` contains editor history, allowed rich content, field rules and safe CSV generation; `src/lib/client/use-form-editor.ts` manages draft persistence and conflict recovery. Existing form APIs, admissions validation, Sheets targeting and response APIs are extended in place. Tests live in the existing unit/integration directories. The committed Git diff is the complete changed-file inventory.

No SQL migration, new table, RLS policy, infrastructure service or environment variable is needed. Optional values are added to the existing private form JSON: editor draft/version, publishing status, structured description, availability and field rules. Existing forms derive their current status and default message visibility without rewriting stored records. Submission data and references are retained; new submissions also preserve their question labels for later review.

The existing server-only Google OAuth and notification configuration are reused. The canonical authorized callback remains `https://uticx.com/api/auth/google/callback`. No client secret or refresh token belongs in public configuration or in this document. The existing Google connection must have Sheets access; document uploads retain their existing Drive setup.

Rich descriptions use the pinned Tiptap editor with server-validated, allowlisted document nodes and React rendering. Raw user HTML is never injected. Integration follows the [official Tiptap Next.js guidance](https://tiptap.dev/docs/editor/getting-started/install/nextjs).

## Deployment and rollback

Run the regression suite, TypeScript check and source production build. Publish the tested source to the existing GitHub `main`; Vercel builds it using the project's existing production environment. Do not deploy the local mock-backed verification build. Confirm the deployment is READY for the exact GitHub commit and that the `uticx.com` alias points to it. Verify the editor assets, public forms, version-conflict guards, response paging and connected spreadsheet read access without modifying production responses.

Before release, retain a private backup of the existing form definitions outside Git. Initial rollback can promote the previous production deployment while form definitions remain unchanged. If administrators have already published new question types or rules, restore/review only the affected form definitions or ship a forward fix before using older code. Never restore the entire admissions snapshot to roll back this UI: doing so could discard new applicants and notification history. Existing submissions, references and original answers must remain intact.
