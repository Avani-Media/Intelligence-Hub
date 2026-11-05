# Record Delivery Implementation Plan

**Goal:** Let authorized Hub editors record a reviewed Salesforce partner delivery from Delivery Verification.
**Architecture:** Separate Edge Function with prepare/submit stages, protected memberships and durable submissions. Existing verification read path remains intact.
**Tech Stack:** Vanilla JS, Deno/native fetch, PostgreSQL, Node tests.
**Spec:** docs/superpowers/specs/2026-11-05-record-salesforce-delivery.md

## Constraints
- Never send leads or edit existing Salesforce deliveries.
- No real Salesforce writes while implementing or testing.
- No privileged secrets in client code; membership controlled server-side.

## Tasks
- [x] Write failing engine tests for authorization, validation, duplicate and retry behavior.
- [x] Implement protected database audit and concurrent claims.
- [x] Implement actual Salesforce describe/query/create transport and server-resolved fields.
- [x] Add review/confirmation dialog, writer gating and refresh.
- [x] Verify unit/integration tests, review independently, deploy and verify source hashes.

## Review Focus
- Replay and concurrent requests must never perform a second POST.
- Timeout after POST is uncertain, not safely retryable.
- Confirmation data must match the stored submitted payload.
- Changed partner relationship or new SF entry must require re-review.
- Audit failure after SF success must not report an ordinary unsaved failure.

Verification: 71 Node checks passed. Protected writer/audit tables have RLS; authenticated users cannot insert/update either table. Unique active partner/date claim verified in PostgreSQL using a fully rolled-back test. Two existing editor accounts seeded. No Salesforce records created during development.
Independent review: found a stale expiry read could release an active lock. Removed expiry mutation and restricted claim to unexpired prepared drafts; regression observed failing and then passing. Remaining review had no additional blocker.
Live submission and signed-in browser confirmation require the user to use a real intended delivery; no synthetic business record will be created for testing.
