# Revenue HQ implementation plan

**Goal:** Implement Dana's approved items 1–7 in the existing runtime plugin.
**Architecture:** Update revenue_forecast_studio and its KPI interaction plugin. Preserve authentication, Salesforce sync, notes, working edits, solution overrides and Scale split editing. No Salesforce writes or schema changes.
**Approved scope:** Remove Avani Category controls and grouping; group by Salesforce stage. Show selected-quarter nonzero schedules, retaining delivery-only exceptions for reconciliation. Exclude Closed Lost. Make numbers readable. Flag overdelivery and past-month differences individually. Make Remaining Revenue open a filterable, itemized breakdown that reconciles to its signed net total.
**Implementation decisions:** Money comparisons use cent rounding. Past calendar months are review candidates, not automatically marked finalized. Alerts compare delivered revenue to Salesforce and working forecasts, retaining source-specific labels. Overdelivery is visually red with a reduced-motion-safe emphasis. Remaining drilldown includes negative offsets instead of silently clamping them.

1. Add regression fixtures for zero schedules, close-date mismatch, delivery-only records, Closed Lost, archived records, offsetting month differences, cent rounding, role controls and Scale splits. Run against baseline.
2. Change filtering, stage-based grouping, alerts, remaining drilldown and scoped styles. Retain original plugin content for rollback and compare update timestamp before publication.
3. Run syntax, behavior and local browser checks. Publish only changed plugin rows with a guarded transaction. Re-read deployed content and compare exact source. Verify unrelated plugins unchanged.

## Validation

- 11 Node regression tests pass; both scripts pass syntax checks.
- Browser test prepared but could not run: Chromium is absent and the environment returned truncated browser downloads. Visual and browser-interaction QA remains unverified.
- Deployment guards compare original plugin hashes and preserve disabled rollback copies.
