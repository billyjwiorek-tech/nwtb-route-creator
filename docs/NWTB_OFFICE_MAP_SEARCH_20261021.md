# NWTB Office business search, presence and traffic

Production baseline: `8d46a3b8a042c3cf41d88fa8bc902d13dab520d2`.
Scope: the existing NWTB app and project `ufnjyidhxuytrmbjzgtu`. Universal and the isolated test branch are outside this change.

## Resulting behavior

- Both Office editions load the updated native Dispatch and Live Drivers assets. Standard Office uses its existing SHOW DRIVERS tool to open the same NWTB map.
- SEARCH ALL retains customers, vendors and saved locations, then adds explicit public business searches biased toward Bolingbrook or Palatine. Directory coverage varies. Public candidates use LOAD / REVIEW rather than creating a stop. Incomplete street addresses must be corrected before adding or saving. Saving remains an explicit SAVE AS FREQUENT LOCATION action. The custom route builder supports the same business directory and address review.
- Online presence requires an unexpired saved session plus app activity in the last two minutes. A valid 30-day sign-in alone is not current presence. Offline records retain labeled historical positions and visible ACTIVE/return routes. GPS age and app presence are separate; stale GPS never establishes that the phone is locked or the driver stopped.
- Current MPH and proximity calculations require a fresh GPS fix. Old, invalid, future or inaccurate fixes cannot supply a current MPH. Map popups and tooltips identify OFFLINE and LAST KNOWN LOCATION; timestamps use America/Chicago.
- Opening the visible Live Drivers map enables traffic by default when configured. Clicking a driver adds a traffic-based ETA to the next pending stop or actual return endpoint. The route's stored estimates are not replaced. No ETA is invented for unreleased/planned routes, paused routes, stale GPS or provider failure. Stop/destination changes invalidate pending estimates.
- The new `nwtb-office-map` Edge Function validates the existing Office session (employee 9998), uses database SELECTs only and never changes a delivery, route, Driver session or GPS state. Only the NWTB production URL/origin is accepted. Traffic provider keys and service credentials stay server-side. Browser requests carry the Office session in headers, not URLs.

## Provider configuration

Business search uses the Photon public OpenStreetMap directory with attribution, bounded caching, manual queries and Office rate limiting. It has no availability guarantee; internal search and manual address entry continue during an outage. References: https://github.com/komoot/photon and https://github.com/komoot/photon/blob/master/docs/api-v1.md.

Live traffic tiles and traffic-aware routing require `TOMTOM_API_KEY` in this project's Edge Function secrets. A missing key shows TRAFFIC SETUP REQUIRED and no ETA. A configured key still needs real API entitlement/response verification; a key-present flag is not proof that the provider works. No paid account or plan was enabled by this change. TomTom's pricing and account allowances are external configuration: https://docs.tomtom.com/pricing.

The frontend pauses traffic refreshes when hidden and calculates ETA only for an open driver popup. Bounded provider caches reduce repeated requests. Multiple operators, map panning and long viewing sessions can increase usage.

## Verification and deployment

Run `npm ci --prefix tests --ignore-scripts` and `npm --prefix tests test`. The suite includes the existing release/hold, return, maps, alerts, chat, POD, session isolation and geocoding checks, plus Office map service, traffic UI and business search fixtures. The GitHub workflow also checks the existing migrations in disposable Postgres; no production routes are created for tests.

Deployment must match the exact main SHA: wait for Pages completed/success, the NWTB workflow, and public asset byte verification. Edge Function source/version and API authorization/provider results are verified separately. Physical driver-device behavior still requires a real phone test. No live route or Driver session should be changed for verification.

Rollback consists of restoring the preceding Office/frontend commit; the new read-only map endpoint is additive. Existing routing, Driver pages, release/hold endpoints and production records are not migrated by this change.
