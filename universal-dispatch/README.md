# Universal Delivery System

Universal is an independently configured installation under this repository's `universal-dispatch/` directory. Its backend is Supabase project `khvhcmncwzywqowfodnb`. NWTB root pages and the NWTB backend are separate.

## Route workflow

Office builds multiple PLANNED routes and reviews each native Office Route Screen. Every new route starts OFFICE ONLY. RELEASE TO DRIVER makes a planned route visible to its assigned driver; HOLD FROM DRIVER hides it again before START. Only that driver can START, PAUSE or RESUME. A paused route reserves the driver's ongoing-route slot. Reassignment returns a planned route to Office-only state.

The Office screen and both Driver editions use the same saved stop order, depot coordinates, road geometry and metrics. The preview has separate release/hold controls; editing priority requires opening the explicit editor and entering the management PIN. OSRM road estimates include service time separately and are labelled as having no live traffic adjustment. If road routing fails, unavailable figures remain unavailable rather than appearing as exact mileage.

GPS starts only after a driver's explicit START, RESUME or CONTINUE action on an ACTIVE route. The Standard edition does not upload live GPS. Its explicit NAVIGATE action can request a device location for navigation.

Office and Driver use different session storage keys. Read caches are hashed by session and only ongoing routes can be viewed from cache while offline. Release, start and delivery outcomes always require an online authenticated request.

## Driver completion and proof

The next stop shows ARRIVED, COMPLETE and NOT COMPLETED. COMPLETE opens the proof-of-delivery form: recipient name and either a signature or photo are required; notes and capture location are optional. Photos are resized before upload. Proof, stop/order status, route completion and the audit event save in one database transaction. Retrying a successful submission returns the original receipt rather than replacing or duplicating it. Office and Driver can explicitly view recorded receipts. Images are stored privately behind the existing authenticated API and are not included in normal route-list responses.

The form clears the recipient, notes, image selection and signature between stops, and resets its submit button after errors or subsequent deliveries. The existing company employee-number/PIN login remains in place.

## GPS and navigation

Office displays the phone GPS estimate, capture age and location accuracy. Unknown speed remains unknown. Speed is hidden for fixes older than 20 seconds or with missing/poor location accuracy; a fresh timestamp alone is not a guarantee of speed accuracy. Locations remain tied to the same driver's ACTIVE route. A recent accurate fix within 500 feet of the pending stop displays NEAR NEXT STOP and does not complete it automatically.

The GPS edition checks for delayed fixes, requests a fresh location after interruptions, and uses a screen wake lock when supported. Browser and operating-system restrictions can still suspend GPS when the app is in the background or the phone is locked; real device testing is required. Tracking starts only after START, RESUME or CONTINUE. Standard has no background tracking.

NAVIGATE NEXT provides an in-app road map, turn guidance, optional spoken directions and rerouting to the same assigned stop when a reliable fix is off course. Navigation rerouting does not alter the saved delivery route, its release state, or Office metrics. Pausing/finishing a route or signing out stops tracking and navigation.

## Entry points

- Office: `./`
- GPS Driver: `./?view=driver`
- Standard Driver: `./?view=driver&edition=standard`

Universal keeps its original company setup, employee-number/PIN login, configurable locations, imports, customer/vendor records, POD, dispatch chat and private driver chat. First company setup must be completed by the owner before operational use. No company, employee or operational delivery data is seeded by this release.

## Backend sources and migrations

`server/` contains the deployed Edge Function source. `udp-core` provides company/auth/import/chat functions; `udp-routing` provides authorized route reads and driver actions; `udp-route-optimizer-v2` performs single/multi-driver optimization and priority edits. Both route builders use the same atomic database persistence function. `udp-app` redirects older frontend links to the current Pages application.

The functions retain custom `x-udp-session` authentication. Do not expose a service-role key to the browser or enable anonymous table policies. All production tables have RLS enabled; application access passes through the authenticated Edge Functions. The transition, staging and reorder SQL functions are executable only by `service_role`.

Migrations are under `supabase/migrations/`. The route release guard, progress guard and unique ongoing-route index also protect requests from older clients. Stop edits invalidate the stored map and metrics, which are recalculated for the saved order. Pending-stop reordering is atomic and checks for concurrent route changes.

## Verification

Run from this directory:

```sh
npm --prefix tests ci
npm --prefix tests test
```

The backend tests run the actual handler source with an in-memory database/OSRM fixture. The frontend tests run the actual application and shared map/session modules in a DOM fixture. They cover release visibility, ownership, permissions, identical Office/Driver geometry, GPS activation, Standard behavior, session separation and offline restrictions. They do not create production data.

`tests/database-release-gate.sql` and `tests/database-pod.sql` copy the live tables and functions to temporary objects, verifies database enforcement, then roll back. Run only against the Universal project. They do not insert production operational records.

After publishing, verify the GitHub Pages run for the exact main commit, compare served frontend files and deployed Edge Function source, and inspect the Office/Driver entry screens. Real mobile GPS, delivery outcomes, POD and chat still need a company-configured device test.
