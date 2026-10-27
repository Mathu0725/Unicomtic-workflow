# Reminder UI check — 26 October 2026

- Added an explicit three-step flow: filter by missing step, choose recipients, review and queue.
- Stage cards now show which transition is missing and a visible selected/filter action.
- Recipient rows show Ready to remind or On hold with its reason. An already-sent reminder remained disabled during the live check.
- Preview now scrolls to and focuses the email panel. The compose and preview panels sit side by side on desktop; optional variables/action-link settings are collapsed.
- Empty groups hide the table and composer. Empty searches show a Clear search action.
- The admin sidebar stays visible when scrolling; the preview check measured its top at 0 while the page was scrolled.
- TypeScript passed. Browser checked group switching, empty results, search clearing, preview navigation and disabled queue state. No emails were queued or sent during these UI checks.

Screenshots: `reminders-ui-overview-2026-10-26.jpg` and `reminders-ui-preview-2026-10-26.jpg`.
