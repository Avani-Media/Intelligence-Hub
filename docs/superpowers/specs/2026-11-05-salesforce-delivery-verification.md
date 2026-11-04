# Salesforce Delivery Verification

Approved direction: a dedicated Syndication Delivery subsection, using the reviewed Soft Steel/blue checklist layout. A selected delivery date, search, status filter, Scheduled Client Delivery Day, SF lead volume, and Salesforce links help delivery staff check their entries.

Use live read-only Salesforce Partner Delivery queries. Match using a team-confirmed Salesforce program-partner link per Convertr CID and publisher; current SF programs have no CID values. Never guess matches by client alone. Missing links are Link needed, missing records are No SF record found, and zero-volume records are Record found — zero leads. Reused partner mappings must be marked shared and not certified individually. Scheduled day is a current planning reference, not historical proof of an expected delivery. Retain TechnologyAdvice records here because this verifies actual SF entries rather than net revenue.

Keep existing navigation, forecasting, automation and Salesforce data unchanged. Save links as separate existing hub_settings records using signed-in team access. Queries validate the signed-in user. No secrets or personal lead records reach the client. A failed refresh hides old statuses until a successful check.

## Automatic linking, approved follow-up
On each check, automatically resolve a single clear candidate using exact normalized client and publisher (explicit INFUSE/INFUSEmedia alias), service, region and Named/Core segment, compatible quarter, and overlapping campaign dates. Source start within 14 days and end within 45 days; overlap covers at least 60% of the longer period. More than one qualifying candidate or insufficient evidence stays Needs confirmation. Normalize punctuation/underscores before extracting labels. Manual saved links, including explicit unlink, override automatic results. Automatically resolved links are recalculated without persisting inferred matches; badge them Auto-linked. Shared partner totals stay review-only.

## Fully delivered campaigns, approved follow-up
Hide linked campaigns by default when Salesforce Program Delivered Volume >= Program Volume and booked volume is positive, with both totals present and finite. Use the complete program total across all delivery dates, not one publisher's allocation or selected-day volume. Keep unresolved links and missing/zero goals visible. Offer Show fully delivered campaigns for historical review, label completed rows, and report the hidden row count. Calculate sharing before filtering, preserving verification safeguards.
