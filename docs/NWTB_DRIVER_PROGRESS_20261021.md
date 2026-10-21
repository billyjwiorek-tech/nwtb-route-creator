# NWTB Driver distance and ETA recovery

Baseline: `478d1abd3423b0c598f4dd599f7c4da23c39efa7`.

The GPS Driver navigation banner previously overwrote the routing service's road distance with straight-line distance to the destination. Its remaining time subtracted wall-clock time from the original estimate, including while stationary. The navigation GPS watch had no health/recovery loop or foreground-resume request, so stalled updates could leave old numbers displayed indefinitely even if a separate map/location watch continued to run.

## Resulting behavior

- Each accepted GPS fix is projected onto the route's road segments. Remaining miles follow the road geometry and the provider's distance total, including bends. Sparse route geometry no longer causes false off-route detection based only on distant vertices.
- ETA follows remaining road progress and the provider's normalized per-step durations, scaled to its current total duration. It does not count down merely because time passes while stopped. Missing step durations use the remaining fraction of the provider's route duration. The existing routing source and traffic refresh policy are preserved; the GPS Driver navigation backend remains version 5.
- Distance and ETA update independently of whether the provider supplies turn instructions. Arrival shows zero remaining and still requires the driver's explicit POD/completion or return confirmation.
- A navigation GPS health check detects fixes older than 25 seconds, hides stale ETA/distance, shows `GPS LOST — ETA AND DISTANCE PAUSED`, and retries location while visible. Returning to the foreground or reconnecting requests a fresh position. Cached, out-of-order and very inaccurate fixes cannot advance progress. Blocked location permission receives a clear message.
- Retired GPS callbacks and superseded routing responses cannot overwrite a new destination or newer route estimate. Slow initial/recovery routing requests are allowed to finish rather than being continuously superseded by GPS updates. Navigation routing requests have a 20-second client timeout.
- The navigation map stays mounted through updates, POD, next stops and the return leg. Ending navigation clears its watch and health timer. Recovery does not start a route, create a driver session or use the Office token.
- Stored mileage/drive/service/return figures in both Driver editions are labeled `PLANNED ROUTE TOTALS` to distinguish saved route estimates from the GPS banner's live figures. Standard keeps its existing no-GPS workflow.

The GPS page and offline shell load `driver-navigation-native.js?v=20261021-progress1`; the shell cache is `nwtb-driver-shell-v10-route-progress`. Offline proof, phone notifications and session storage remain intact.

## Verification

`node tests/driver-route-progress.test.cjs --prove-original` reproduces the baseline's straight-line distance, ETA countdown while stationary, and silently stale GPS figures. The regular test drives the actual page, navigation module and Leaflet with isolated road geometry and simulated iPhone/Android GPS. It verifies road bends, segment duration weighting, stopped vehicles, traffic updates, sparse geometry, arrival, stale/poor GPS, recovery, foreground resume, permission restoration, delayed initial fixes, slow routing, late callbacks/responses, map persistence and Office session separation.

The full NWTB suite also verifies voice, maps/POD/return lifecycle, Android notification compatibility, release/hold authorization, chat receipts, phone push, Office preview, driver presence and traffic/business search. All fixtures are isolated; no production delivery, active route, driver login, chat message or GPS report is created or changed.

The deployed `nwtb-driver-navigation` function was inspected read-only and remains ACTIVE v5, identical to the source inspected during the Android audit. Its response supplies `geometry`, `distance_m`, `duration_s` and normalized per-step distance/duration fields. No backend deployment or database migration is needed.

Publication requires the exact main SHA's Pages deployment and regression workflow to complete successfully and all public asset bytes to match that commit. Physical-phone road testing is still required on the next legitimate trip after reloading while parked. Browser background suspension remains a limitation; recovery resumes when the app is visible and GPS becomes available.
