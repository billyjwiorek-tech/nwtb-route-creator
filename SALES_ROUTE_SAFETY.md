# Sales route location approval

Phase 1, 2026-10-01: Sales routes require a current included account with explicit `finalRouteApproved` approval, a physical commercial address, usable coordinates, and no DO NOT ROUTE / NOT A FIT visit restriction. GO FIRST also requires its existing GO FIRST approval. An account without an explicit location approval is held from routes; its sales category remains unchanged.

The cloud account ID is the primary stop identifier. Legacy shared routes resolve through a unique customer number or exact name/address match. The server replaces submitted stop details with current cloud records. Unknown custom stops, ambiguous matches, exclusions, duplicate stops, and any route containing a blocked stop fail entirely.

The Sales account API validates before rendering and again before optimization, sharing, exports, Google Maps, and built-in navigation. The Sales branch of the chat API independently validates before saving a shared route. A cloud or visit-status lookup failure prevents routing. The browser and edge functions use identical policy files.

The October 1 location review preserved 440 included accounts: GO FIRST 66, Verified Prospects 7, Win-Back 232, Active 135. Its original snapshot had location approvals of 54, 7, 35, and 26 respectively (122 total), with 318 accounts held. Categories and sales history were preserved. This is a conservative review of public business-location evidence, not a site visit or a new Excede sales-history reconciliation. Missing evidence remains HOLD rather than a claim that a business is closed. Account-specific evidence is private and is not committed here.

October 2, 2026 reconciliation: ROADRUNNER TRANSPORTATION SERVICES customer 11935 was resolved from `COORDINATES_PENDING` to `COMMERCIAL`. Roadrunner's current Chicago-area commercial terminal at 850 Windham Pkwy, Bolingbrook, IL 60440 was confirmed and its stale 250 Old Chicago Dr route address/coordinates were replaced in the cloud Sales record. The current included-account routing counts are GO FIRST 66 total / 55 route-approved / 11 HOLD; Verified Prospects 7 / 7 / 0; Win-Back 232 / 35 / 197; Active 135 / 26 / 109. Current total location approvals are 123 and current HOLDs are 317. The 11 remaining GO FIRST HOLD accounts remain blocked because the location audit has residential/no-separately-verified-commercial-stop evidence.

Delivery UI, Delivery data, shared matrix/navigation engines, and Component Trainer files are outside this change. The chat function's existing Delivery behavior is preserved.

Run the synthetic security regression tests with Node 24 or newer:

```sh
node --test tests/sales-route-safety.test.cjs
```

When changing the policy, keep `sales-route-policy.js` and `supabase/functions/_shared/sales-route-policy.js` identical, deploy both Sales-related edge functions, and publish both Sales HTML entry points with new script cache versions.
