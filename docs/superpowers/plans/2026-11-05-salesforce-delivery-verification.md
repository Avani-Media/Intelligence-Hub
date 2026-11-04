# Salesforce Delivery Verification Implementation Plan

**Goal:** A working Salesforce entry checklist in Syndication Delivery.
**Architecture:** An isolated runtime plugin and authenticated, read-only Edge Function. Existing performance snapshots and CDD schedules supply campaign rows; explicit saved links identify SF program partners.
**Tech Stack:** Vanilla JavaScript/CSS, Node tests, Supabase Edge runtime, Salesforce REST.
**Spec:** docs/superpowers/specs/2026-11-05-salesforce-delivery-verification.md

## Global Constraints
- No Salesforce writes, no existing forecast/syndication source changes.
- Preserve missing-link, zero-volume, shared-partner and failed-refresh distinctions.
- Use selected delivery date, not entry creation date; default yesterday in Asia/Manila.

## Review Focus
- Duplicate program partner links cannot certify two independent campaigns.
- Pagination must finish or fail rather than silently truncate.
- Empty/failed SF fetch cannot become a missing-record assertion.
- Changing date must not retain old-date results.
- Escape all campaign and SF display text.

## Tasks
- [x] Write model and HTTP tests; observe expected failures.
- [x] Implement exact partner/date verification and authenticated SF reader.
- [x] Add isolated sidebar subsection, filters, explicit saved linking and styling.
- [x] Run model/HTTP tests and existing suites, inspect navigation integration.
- [x] Publish new function/plugin with readback verification and commit source.

Ruling: approved concept plus user's 'let try it' authorizes implementation and publication. Existing GitHub-based Hub uses Supabase runtime plugins, not Sites hosting; preserve that deployment path.

Verification: 39 Node checks passed, including real entrypoint HTTP simulation, pagination and saved partners outside program dates. New Edge Function ACTIVE with JWT verification; new runtime plugin enabled and source hashes confirmed. Browser QA attempted separately.
Review: independent review identified saved partners omitted when outside program dates. Fixed by including validated saved IDs in partner lookup; regression and injection tests observed failing, then passing. No existing functions or runtime plugins changed.

