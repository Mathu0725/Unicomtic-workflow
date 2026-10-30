# Leads and older-code review — 30 October 2026

## Leads change

`/admin/workshop-bookings` lists booking records across workshops, with search, status filter, contact, reference and links to each workshop's participant management. The Leads navigation now contains Registrations, Applications and Workshop bookings. Workshop planning remains under Workshops.

The page reads the existing authenticated `/api/admin/workshops` endpoint. It does not create a second booking store or alter existing records.

## Older paths still in use

| Path | Current role | Review decision |
| --- | --- | --- |
| `/register` and `/api/registrations` | Standalone registration form and submission endpoint | Keep until old public links are migrated and usage is checked. |
| `/apply`, `legacy-apply-client.tsx`, `/api/applications` | Redirects to a published form when available; fallback for older application links | Keep fallback until old links and candidate access are checked in production. |
| `/api/workshops` and `src/lib/workshops/legacy.ts` | Supplies workshop choices to standalone registration/application flows | Keep while those flows are live. |
| `/admin/workshops` and `/admin/workshops/[id]` | Current workshop creation, participants, reminders, Sheet and attendance management | Keep; these are active features, not obsolete duplicates. |

## Cleanup order

1. Confirm production traffic and published links for `/register` and `/apply`.
2. Move any remaining standalone links to the appropriate published form URLs.
3. Only then remove the legacy pages, APIs, workshop-choice adapter and related tests together.

No production data, migration or older public route was removed in this change.
