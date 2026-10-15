# Universal Delivery System

Universal is an independently configured installation under this repository's `universal-dispatch/` directory. Its backend is Supabase project `khvhcmncwzywqowfodnb`. NWTB root pages and the NWTB backend are separate.

## Route workflow

Office builds multiple PLANNED routes and reviews each native Office Route Screen. Every new route starts OFFICE ONLY. RELEASE TO DRIVER makes a planned route visible to its assigned driver; HOLD FROM DRIVER hides it again before START. Only that driver can START, PAUSE or RESUME. A paused route reserves the driver's ongoing-route slot. Reassignment returns a planned route to Office-only state.

The Office screen and both Driver editions use the same saved stop order, depot coordinates, road geometry and metrics. The preview has separate release/hold controls; editing priority requires opening the explicit editor and entering the management PIN. OSRM road estimates include service time separately and are labelled as having no live traffic adjustment. If road routing fails, unavailable figures remain unavailable rather than appearing as exact mileage.

GPS starts only after a driver's explicit START, RESUME or CONTINUE action on an ACTIVE route. The Standard edition does not upload live GPS. Its explicit NAVIGATE action can request a device location for navigation.

Office and Driver use different session storage keys. Read caches are hashed by session and only ongoing routes can be viewed from cache while offline. Release, start and delivery outcomes always require an online authenticated request.

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

`tests/database-release-gate.sql` copies the live tables and functions to temporary objects, verifies database enforcement, then rolls back. Run only against the Universal project. It does not insert production operational records.

After publishing, verify the GitHub Pages run for the exact main commit, compare served frontend files and deployed Edge Function source, and inspect the Office/Driver entry screens. Real mobile GPS, delivery outcomes, POD and chat still need a company-configured device test.
