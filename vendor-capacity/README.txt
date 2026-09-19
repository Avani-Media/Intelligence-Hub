AVANI Vendor Capacity Portal - GitHub Upload

Replace the existing Intelligence-Hub/vendor-capacity folder in GitHub with this folder.

Included:
- index.html

This version reads the eligibility flags already returned by vendor-capacity-api:
- frontload_eligible
- incremental_eligible
- fulfillment_question_eligible

Behavior:
- Multi-month / before final month: Frontload can display.
- Final month or one-month campaign: “On Track to Fulfill by End Date?” displays instead of Frontload.
- Selecting No requires a Reason.
- Campaign names identified as Incremental/Incre by the API do not receive another Incremental Capacity question.
- Current Delivered uses the API valid-only delivery value.
- AVANI Mock descriptions are displayed when provided.

After uploading, refresh the GitHub Pages URL with a hard refresh if an older cached page appears.
