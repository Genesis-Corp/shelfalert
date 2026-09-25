# ShelfAlert change tracker

When Jericho says **“Next change”**, read this file, take the first unfinished item, implement it, then update this checklist and the notes below. Do not mark an item complete until it has been checked.

## Interface

- [x] Remove emoji from the application and alert email template.
- [x] Start the light Stone and Forest palette: warm surfaces, dark text, forest green actions, and readable status colours.
- [ ] Refine the palette across every signed-in screen and add an optional graphite dark theme in Settings.
- [ ] Make Dashboard a task-first Today view: rep visits and urgent items first, obvious Log gap action, supporting statistics below.
- [ ] Group desktop navigation and simplify mobile navigation to Today, Issues, Suppliers, Reports, and More.
- [ ] Standardise list screens with search, filters, clear row actions, and consistent spacing.
- [ ] Review layouts at phone, tablet, and desktop widths with authenticated data.

## Email notifications

- [ ] Choose and configure an authenticated sender. Requested sender: `Jerichosams@gmail.com`. Resend cannot impersonate a personal Gmail address; use Gmail OAuth/SMTP with appropriate Google credentials, or a verified domain address with Gmail as reply-to. **Blocked on sender method and credentials.**
- [x] Remove the invalid hard-coded `noreply@shelfalert.app` sender. Require `EMAIL_FROM` (a Resend-verified sender), set Gmail as reply-to, and return a failure when the provider rejects an email. This does **not** enable sending until the provider is configured.
- [ ] Deploy the Supabase `send-rep-alerts` function and create an hourly scheduled invocation; confirm it runs in the production project.
- [ ] Report provider errors and show the last attempt and delivery result in Settings; add a test-send control.
- [ ] Avoid repeat emails within the same notification window; test today/tomorrow and timezone boundaries.

## Notes

- 2026-09-25: Began the light palette and removed emoji in source and email. Production email sending remains unverified; no credentials or scheduler are stored in this repository.
- 2026-09-25: Following a report of a Vercel build failure, removed unused `DEPT_CODES` so warnings cannot turn into failures under `CI=true`. `CI=true npm run build` now compiles successfully locally. The reported Vercel deployment's build log is still needed to identify its specific failure; local changes remain uncommitted and are absent from GitHub HEAD.
