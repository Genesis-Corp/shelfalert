# ShelfAlert change tracker

When Jericho says **“Next change”**, read this file, take the first unfinished item, implement it, then update this checklist and the notes below. Do not mark an item complete until it has been checked.

## Interface

- [x] Remove emoji from the application and alert email template.
- [x] Start the light Stone and Forest palette: warm surfaces, dark text, forest green actions, and readable status colours.
- [x] Refine the palette across signed-in screens and add an optional graphite dark theme in Settings. Theme choice is saved on this device.
- [x] Replace Syne, DM Sans and DM Mono with Atkinson Hyperlegible Next throughout the interface.
- [x] Make Dashboard a task-first Today view: rep visits, near-code alerts and priority gaps first; Log gap and View all gaps actions; supporting statistics below.
- [x] Group desktop navigation and simplify mobile navigation to Today, Issues, Suppliers, Reports, and More. Issues opens Gaps, Near Code and High Theft Items; More opens Settings.
- [x] Standardise Gaps, Near Code, Suppliers and incident lists with search, existing filters, result counts, clearer empty states and mobile row actions.
- [ ] Review layouts at phone, tablet, and desktop widths with authenticated data. Tablet navigation, narrow phone forms, supplier tabs, and modal spacing have been adjusted from source review; authenticated visual verification remains.
- [x] Show uploaded gap photos as thumbnails on Today, with a larger preview on selection.
- [x] Replace browser image-description API call with on-device OCR in Log New Gap. Suggest product text and fill supplier/aisle/bay only if clearly printed; keep every field editable. Bundle OCR assets with the site.
- [x] Replace Graphite & Forest with Navy & Citrus in Settings and throughout the dark theme; keep green only for positive-status signals.
- [x] Add an editable stock code to Log New Gap, read from the left of the shelf ticket without treating the barcode as a stock code; display it on Today and Gaps. Keep supplier manual.
- [x] Read aisle and bay from the two-number code below the printed date on green shelf tickets (for example `03-33` → aisle 3, bay 33), with an editable preview and support for bays beyond the default configured list.

## Email notifications

- [ ] Choose and configure an authenticated sender. Requested sender: `Jerichosams@gmail.com`. Resend cannot impersonate a personal Gmail address; use Gmail OAuth/SMTP with appropriate Google credentials, or a verified domain address with Gmail as reply-to. **Blocked on sender method and credentials.**
- [x] Remove the invalid hard-coded `noreply@shelfalert.app` sender. Require `EMAIL_FROM` (a Resend-verified sender), set Gmail as reply-to, and return a failure when the provider rejects an email. This does **not** enable sending until the provider is configured.
- [ ] Deploy the Supabase `send-rep-alerts` function and create an hourly scheduled invocation; confirm it runs in the production project.
- [ ] Report provider errors and show the last attempt and delivery result in Settings; add a test-send control.
- [ ] Avoid repeat emails within the same notification window; test today/tomorrow and timezone boundaries.

## Notes

- 2026-09-26: Responsive layout pass: switch from the 220px sidebar to compact navigation below 901px, preserve safe-area room below content, allow supplier tabs/actions to wrap, fit modals within phone height, prevent toast overflow, and stack aisle/bay fields below 381px. Build verification completed; a signed-in phone/tablet/desktop visual pass is still needed before checking this item complete.

- 2026-09-25: Began the light palette and removed emoji in source and email. Production email sending remains unverified; no credentials or scheduler are stored in this repository.
- 2026-09-25: Removed unused `DEPT_CODES` so warnings cannot turn into failures under `CI=true`. The initial changes were pushed to `codex/shelfalert-light-theme` on GitHub; Vercel deployment still needs verification.
- 2026-09-25: Completed the palette refinement with theme-aware status colours and a Settings theme control. Font options to review next: Source Sans 3, Nunito Sans, and Atkinson Hyperlegible.
- 2026-09-25: Jericho selected Atkinson Hyperlegible Next. Updated the interface font and reordered Today around store tasks, with the date and rep schedule using the store timezone. Next: navigation cleanup.
- 2026-09-25: Grouped desktop navigation and replaced the seven-item mobile bar with five destinations and an Issues menu. Verified with `CI=true npm run build`. Next: list screen consistency.
- 2026-09-25: Repository default branch is `master` (no `main` branch exists). At Jericho's request, the feature branch is being merged into that default branch so future changes can go directly to the production branch.
- 2026-09-25: Merged PR #3 into `master`; Vercel reported the deployment successful. Added consistent search and result counts to the four operational lists, improved supplier edit/delete labels and phone layout for gap and near-code actions. `CI=true npm run build` passes. Next: review authenticated phone, tablet and desktop layouts.
- 2026-09-25: Added Today photo previews and local OCR using Tesseract.js. OCR reads printed text and suggests form fields; it cannot infer a product from an unlabelled empty shelf. The OCR engine and English model are copied into the build so images are not sent to an OCR service. The original photo is still uploaded to Supabase when the gap is saved. Parser tests and production build pass. Awaiting dark palette choice.
- 2026-09-25: Corrected OCR after a real green shelf-ticket photo filled the form with gibberish. Detect the ticket and read its enlarged product-name strip; require a plausible, confident result before autofilling, and contain the diagnostic text within a short scroll area.
- 2026-09-26: Removed whole-photo OCR fallback when the green ticket cannot be isolated; the form now shows the actual product-name crop and never scans the barcode beneath it. If no crop is found, it prompts for a closer photo or manual description. Screenshot from zq-the-forge-of-genesis.vercel.app showed older whole-photo OCR behavior, so confirm that URL's deployment separately.
- 2026-09-26: Narrowed the OCR crop to the top 35% of the green ticket after testing the supplied photo: the earlier 42% included SKU/date text and returned gibberish. The isolated line yielded `C/BELLA CCNUT WTR COFFEE IL` with 84% Tesseract confidence in local testing; normalize terminal `IL` to `1L`. Keep human review before saving.
- 2026-09-26: Added stock-code recognition from a separate far-left ticket crop. The supplied photo yields `S346039` at 87% confidence; short alphanumeric codes are accepted without requiring an S prefix, while long barcodes are excluded. The code is saved in a structured prefix of the existing gap notes because this repo has no production database migration access; it is parsed back into its own UI field and hidden from ordinary notes. Supplier remains manually selected.
- 2026-09-26: Location OCR now isolates the `03-33` row under the print date. The colour crop misread the final 3 as 8 despite high confidence; thresholding the crop produced `03-33` at 95% confidence in local testing. Suggested bay 33 is made selectable even when the store's configured bay count is lower. Users should verify the preview.
- 2026-09-25: Jericho selected Navy & Citrus. The dark theme now uses navy surfaces and citrus accents; primary, secondary and muted text and button combinations were checked for contrast. Stone & Forest remains the light option.
