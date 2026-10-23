# Sales navigation and List Mode

After **Build Today's Route → Create + Preview → Done**, choose:

- **Start NWTB Turn-by-Turn**: follow the optimized stops in order. **Visit Complete / Next Stop** advances to the next business, then returns to Northwest Trucks in Bolingbrook.
- **List Mode**: open the selected businesses as a large, scrollable list. Tap any business to navigate from the current GPS location directly to it. **Visit Complete / Back to List** returns to the choices without automatically starting another destination. **Choose Another Stop** switches destinations without marking the current one visited. **Return to NWTB** navigates home.

The list opens full-screen on phones and as a large dialog on desktop. Visited indicators apply to this browser session and route; they do not create a saved Sales visit-history record.

## Navigation source and isolation

`sales-built-in-navigation.js` adapts the algorithms from `driver-navigation-native.js?v=20261021-progress1`: road projection, segment-duration ETA, GPS quality/staleness checks, location-watch recovery, turn announcement stages, map lifecycle, and arrival detection. Both use the existing `nwtb-driver-navigation` service. Sales directly loads the existing `driver-voice-live.js` transport.

The Delivery pages, scripts, database schema, routes, POD, driver tracking and completion actions are unchanged. The Sales adapter does not load the Delivery route/stop API or write Delivery records. The navigation service reads available fleet observations; the interface only labels traffic as live when the response supplies `traffic_aware: true`.

Sales validates the current route through `nwtbRequireSalesRoute` before startup, destination changes, rerouting and traffic refresh. HOLD or revoked approvals stop navigation. GPS alone never completes a visit or selects another business. Generations and request sequences reject stale GPS/HTTP responses. Ending navigation, editing/building another route or logging out clears GPS watches and pending navigation.

## Verification

```sh
node --test tests/sales-route-safety.test.cjs tests/sales-route-preview.test.cjs tests/sales-navigation.test.cjs
```

The navigation tests use the actual Sales adapter, policy, voice transport and Leaflet with synthetic GPS/API responses. They cover road-distance/segment ETA, stationary behavior, missing steps, stale/inaccurate GPS, permission recovery, turn cue deduplication, arrival, next stop/return, HOLD/revocation/outage handling, canonical coordinates, late responses, sign-out, and selecting arbitrary List Mode destinations. They do not claim a physical iPhone/Android driving test.
