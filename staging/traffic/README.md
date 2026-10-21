# Test Office traffic overlay and driver ETA

This feature is prepared ONLY for the isolated test environment. It is not deployed or loaded by production NWTB or Universal. The test Supabase project is still blocked by the account's two active free-project limit. No TomTom API key has been configured.

## Behavior

- Opening the test Live Drivers map enables traffic by default. A button can hide the overlay; this does not disable traffic-based ETA calculation.
- The overlay uses TomTom traffic flow colors above existing map tiles and below NWTB route lines and driver figures/vans. It includes provider attribution and a traffic-loaded timestamp. Hidden tabs stop refreshing.
- Clicking a driver opens their existing popup and adds an arrival time in America/Chicago, minutes remaining, traffic delay when provided, destination and calculation time.
- The destination is the next PENDING stop on their ACTIVE route. After the last stop, when the route is in its return phase, the destination is that route's configured return depot/endpoint. Palatine is not replaced with Bolingbrook. Custom return endpoints remain supported.
- No ETA is invented for no ACTIVE route, paused routes, stale/future/missing/low-accuracy GPS, invalid destination, unavailable traffic service or unconfigured provider. A missing provider never silently falls back to OSRM and labels that estimate traffic-aware.
- ETA requests are read-only, Office-authenticated and server-authoritative. They cannot create driver sessions, start/complete/release routes, save coordinates or modify a driver's route. If a stop/destination changes during a traffic request, its estimate is discarded.
- Existing tracker decorators may refresh popup content; the ETA block is reattached without replacing those modules. Opening another driver, closing a popup, hiding the tab, changing Office session or destroying the map cancels/discards obsolete responses.

## Required configuration in the separate test backend

Deploy backend/index.ts with backend/handler.mjs and policy.mjs preserving their relative paths. The Supabase runtime provides SUPABASE_URL and server credentials. Set these NEW test-only secrets/configuration:

- NWTB_ENVIRONMENT=STAGING
- NWTB_STAGING_PROJECT_REF: the actual new test project reference, never NWTB production or Universal.
- NWTB_STAGING_ORIGIN: exact separate test frontend origin.
- TOMTOM_API_KEY: a provider key entered through the provider/backend settings; never committed or sent to the browser.

The endpoint name is nwtb-office-traffic and it uses the existing custom x-nwtb-session authentication, with platform verify_jwt=false. Only the test Delivery Desk session (employee 9998) may use it. Check its guard, authorization, response and origin before publishing the test frontend. No new database schema is required by this feature.

The v1 TomTom Calculate Route endpoint is requested with traffic=true and departAt=now. Raster flow uses the supported relative0 style. Provider live-data coverage and real API entitlement still require verification with the actual account. No provider API requests are made by the offline tests.

## Frontend integration

First generate a fully isolated copy of the existing Delivery assets. Namespace Office/Driver storage and replace ALL project URLs/keys. Vendor both pinned legacy Dispatch and Tracker HTML; do not fetch live source at runtime. Regenerate the Driver QR for the test hostname. Keep production asset files unchanged.

The generated output must contain a .nwtb-staging.json identity file (environment, projectRef, siteOrigin), its own test CSP/network guard and the real native tracker page at tracker-live-core.html with window.__nwtbTrackerMap exposed. Then call installTraffic(outputDirectory, publicConfig) from install.mjs. publicConfig includes environment, projectRef, backendUrl, siteOrigin, publishableKey and an Office token key starting nwtb_test_. The installer rejects production connections, mismatched identities, wrapper HTML and installation into original app source. It copies the module and injects it after the original tracker scripts.

The original 4-digit Driver app and all route/release/hold workflows remain those of the existing system. Do not call a local fixture a deployed or complete test app. Complete the separate backend/frontend setup and run the entire Office-to-test-Driver flow before handing out a test link.

## Verification

From the repository root:

```
npm ci --prefix tests
node --test staging/traffic/tests/backend.test.mjs
node --test staging/traffic/tests/frontend.test.mjs
node --test staging/traffic/tests/install.test.mjs
npm --prefix tests test
```

Real Chicago-area traffic, real provider routing results, mobile rendering and the new separate deployment remain to be verified after project capacity and provider credentials are available.
