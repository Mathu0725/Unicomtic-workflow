# Admin sidebar height check — 26 October 2026

The admin layout now fills the dynamic viewport, with independent scrolling for page content and the navigation list. The brand and staff profile do not shrink; the profile stays at the sidebar bottom.

TypeScript passed. At the bottom of the Reminders page, browser measurements showed sidebar and profile bottoms at 720px, main height 720px with 1548px of scrollable content, and body height/scroll height both 720px. Keyboard navigation to the final menu link scrolled the menu independently. No reminder actions were performed.

Screenshot: `admin-sidebar-full-height-2026-10-26.jpg`.
