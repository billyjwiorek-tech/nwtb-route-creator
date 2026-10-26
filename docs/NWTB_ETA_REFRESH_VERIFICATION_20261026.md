# NWTB Office ETA refresh repair

The Office Route Screen's Refresh ETA button previously sent the same request as automatic polling. The server could return a cached calculation for 30 seconds, the button gave no progress or completion feedback, and update times omitted seconds. Its From now column also remained fixed between calculations.

## Result

- An explicit click sends `refresh: true`, bypasses the automatic polling cache, and does not join an older automatic calculation. Automatic refreshes keep the bounded cache.
- The button shows REFRESHING ETA while busy, then a REFRESHED timestamp including seconds. A fresh calculation can legitimately produce the same travel duration.
- From now uses the actual arrival timestamp and updates without recreating or removing focus from stop controls. Stale estimates and stale GPS still clear.
- A slow automatic response cannot replace a newer manual result in the server cache.
- Shared Office traffic requests have an 18-second timeout covering response reading. A stalled Live Drivers ETA becomes unavailable and can recover on the next request.
- Traffic tiles have at most four requests in flight per map. Panning away cancels removed or queued tiles; closing, hiding or logging out cancels remaining work. CORS preflight permissions cache for ten minutes; every data request still requires Office authorization.
- Opening a Driver popup while traffic connects no longer cancels traffic configuration.
- Both Office editions, Dispatch variants, Driver View and Live Drivers load the updated modules with `20261026-etarefresh1` cache versions. Driver URLs and QR content remain unchanged.

## Verification

The new tests reproduce the original manual-cache, frozen countdown, stalled popup and unbounded tile-request problems before the fixes. Tests cover explicit button clicks, progress/confirmation, duplicate clicks, request failures, out-of-order completion, authorization, changed stops/route status, stale GPS, logout, hidden views and canceled tiles. Fixtures enforce zero route, location or Driver session writes.

The broader regression suite covers Standard/GPS Driver routes, map persistence, navigation progress and return handoff, speech failure recovery, iPhone/Android behavior, wake lock, release/hold and single ACTIVE route, POD and exceptions, chat receipts and push, online presence, Office overrides, business search and radius filtering. Separate CI jobs validate return lifecycle, registration/push storage and atomic Office overrides in disposable PostgreSQL.

All tracked NWTB browser JavaScript and inline HTML scripts are syntax-checked separately. Deployed critical delivery, tracking, route-admin, legacy route-ops, POD and Office Driver View sources are compared with the tested repository. Public Pages asset byte checks and the exact Pages run are required after publishing.

Production validation is read-only: inspect an existing Office-only route, click Refresh ETA, inspect map tiles and compare stored route/release/stop/POD state. Do not create deliveries, sign in as a test Driver, start or complete a route, send chat, consume real message receipts or use a real override PIN.

## Limits and maintenance

Simulated trips cannot verify a physical phone speaker, GPS permissions or operating-system suspension. Those still require a normal trip with the app open. Route preview traffic estimates remain separate from saved OSRM metrics and the phone's reported screen values.

Existing database advisories were reviewed separately: the staging trigger lacks a pinned search path, the legacy Mapbox quota RPC retains public SECURITY DEFINER grants, and a chat index is duplicated. These predate this repair. No database schema, grants, keys or indexes are changed by this release.
