# Record Delivery in Salesforce

Approved user scope: only Salesforce Delivery Verification. Add Record Delivery for a linked row with no existing partner/date record; show program partner number, actual SF partner/publisher/program, campaign, delivery date and lead count, then explicit confirmation creates one Partner_Delivery__c. It records SF delivery only, never sends leads. Rates remain Salesforce formulas. On save refresh verification.

Use a separate authenticated write endpoint. Existing read endpoint and Revenue HQ are unchanged. Protected writer memberships initially include the existing Ian and operations editor accounts only, not all Hub readers or user-editable settings. Verify Supabase identity server-side and look up protected membership.

Create fields: Program_Partner__c, Program__c (resolved from partner server-side), Delivery_Date__c, Delivered_Volume__c. Validate positive integer lead count, valid nonfuture delivery date from 2026 onward, SF ID format, required-field create permission and no unknown mandatory fields. No editing existing records.

Prepare/review stores an expiring server-side draft; submit accepts its ID only and the same user. Server rechecks actual partner/program and existing partner/date records. An atomic database claim plus unique active partner/date index prevents simultaneous Hub submissions. Request ID replays return the recorded outcome. Salesforce timeouts remain uncertain, retain the lock, and never retry the POST automatically. Direct Salesforce edits outside the Hub are not serialized by the Hub lock; a fresh existing-record check immediately precedes posting.

Audit has user ID, validated email, draft/request ID, partner/program/date/count, timestamps, state and SF result ID. Client cannot insert/update audit or memberships; read own audit only. No privileged secrets in browser. No actual Salesforce delivery created during development/testing.

Alternatives: direct browser writes would expose privileged credentials; editing existing rows risks replacing another entry. Selected approach is one reviewed create operation through an isolated server endpoint with durable audit.
