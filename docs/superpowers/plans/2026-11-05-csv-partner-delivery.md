# CSV Partner Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Record reviewed CSV rows in Salesforce for a chosen delivery date.
**Architecture:** Browser parses/matches CSV against fresh Salesforce verification; existing prepare/submit endpoint validates each CSV draft and records rows serially with existing authorization, audit and replay protection.
**Tech Stack:** Buildless JavaScript/CSS, Supabase Edge Functions, Node test runner.
**Spec:** docs/superpowers/specs/2026-11-05-csv-partner-delivery-design.md

## Global Constraints
- Current Eastern default; editable before review; frozen review inputs.
- Explicit Record All confirmation, no writes on upload or preview.
- 100 rows / 256 KiB; exact AM; positive safe integer <=1,000,000.
- No automatic retries or overwrite; per-row results; reuse protected writer permissions.

## Review Focus
- Duplicate normalized AMs must block every repeated row.
- Multiple partners in one program must share one remaining budget.
- Date or volume changes after preview cannot change a submitted draft.
- An uncertain row must stop later writes and preserve successes.
- Quoted CSV and formula-like input must not corrupt matches or result exports.

### Task 1: CSV parsing, preview and runner
Files: runtime-plugins/salesforce_delivery_verification.js; tests/delivery-csv.test.cjs.
Interfaces: parseDeliveryCsv(text) -> rows; buildDeliveryCsvPreview(text,data,date) -> rows with partner/errors; runDeliveryCsvRows(rows,call,onProgress,shouldStop) -> per-row results.
- [x] Write tests for quoted/BOM/CRLF CSV, invalid headers/quotes/counts/limits, duplicate AMs, exact matches, existing entries, dates, unavailable totals, shared program budget, sequential execution, stop/uncertain outcomes.
- [x] Run tests and observe missing behavior.
- [x] Implement pure helpers; run tests.

### Task 2: Server validation
Files: supabase/functions/salesforce-record-delivery/{handler,adapters}.mjs; tests/record-salesforce-delivery.test.mjs; tests/record-salesforce-transport.test.mjs.
Interfaces: prepare accepts source:'csv', expectedNumber; persisted review.csvNumber triggers fresh checks at submit; getPartner includes programVolume/programDelivered/start/end.
- [x] Test CSV prepare/submit rejection for identity change, overage, unavailable totals, invalid dates, and preservation of manual create.
- [x] Observe failures, implement checks, run transport and handler tests.

### Task 3: UI, review and publication
Files: runtime plugin JS/CSS plus design/plan/tests.
- [x] Add Upload Delivery CSV, template, selected date, file picker, preview, confirmation, progress/stop, result export; preserve dark navy theme and compact table.
- [x] Verify UI state via DOM integration tests and existing full suite; independent review before publication.
- [x] Deploy endpoint with JWT enabled, guarded runtime update, and GitHub main source commit. Verify deployed function and runtime state without recording real deliveries.

## Execution notes
Pre-flight: CSV helpers feed the modal; the modal consumes the existing protected prepare/submit contract. CSV source and expected AM persist in audit review, so submit ignores later client changes.

Final review: fixed shared-program concurrency — concurrent different-partner submissions regression RED→GREEN; new RLS server-only program mutex used by create/edit/delete and retained on uncertain writes. Suite 103/103. Added user-approved prefilled template. No deferred important findings.
