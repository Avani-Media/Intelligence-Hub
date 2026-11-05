# Edit and delete delivery entries

User requested edit/delete features inside Salesforce Delivery Verification. Add Manage entries on linked rows with SF records. List individual entries for the selected partner/date. Edit only delivery date and positive integer lead count; never change partner/program/rates. Delete one explicitly reviewed entry through standard SF DELETE, never hard-delete or bulk-delete. Display record name/ID, partner number/name/program, before/after values and free/rejected counts when applicable. Require a confirmation checkbox and explicit Save changes/Delete entry button. Existing approved writer accounts only.

Prepare is read-only in Salesforce and creates an expiring audit draft. Submit owns a durable claim, shares a per-partner mutex with creates, rechecks the original LastModifiedDate and field values, and sends If-Unmodified-Since. Date moves cannot collide with another partner/date record. Known rejections release claims; timeouts/unknown results retain claims and never automatically retry. Successful audit replay performs no additional SF write. No actual Salesforce records are changed/deleted during development.

An additional protected change-audit table stores actor, original SF version, before/after data and result. Client has own-row SELECT only. Per-partner locks serialize Hub creates/edits/deletes. Existing create audit uniqueness excludes succeeded entries so a deleted or moved delivery can be recorded again with a new request, while replaying its original request remains idempotent.

Native SF REST conditional headers are used for concurrent external changes; direct external SF creates are not serialized by Hub locks. UI refreshes live verification after success. Existing dates in verification retain their selected-day meaning; edit form starts from the existing record date, while new-record default stays Eastern today.

Verification: independent reviewer found no important blockers. 86 Node tests passed; native PostgreSQL mutex collision/release test was rolled back. New tables use RLS and deny authenticated client INSERT/UPDATE/DELETE. Existing Salesforce data was not changed or deleted during testing.
