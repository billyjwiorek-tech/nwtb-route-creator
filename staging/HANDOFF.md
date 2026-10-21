# TEST — NWTB isolated test environment

Checkpoint: 2026-10-21. The user requested moving this work to a separate chat named TEST so the original conversation can be used for the live app and questions.

## Authorized goal

Create a working copy of the existing NWTB Delivery System on a separate hostname and a separate Supabase project, then add business-name search inside the NWTB interface. Preserve the existing app and all delivery features. Test here first; do not update Universal or production NWTB until the user approves the tested change.

The business search should find internal Customer Master, Vendor Master and Saved Locations first, then external business candidates with name, full physical address and coordinates. Bias by selected depot/city, let the user select the correct branch, load the Stop form, and explicitly save a location for later SEARCH ALL. Searching or previewing must never create/release/start a route or start driver GPS.

## Exact source and production baseline

- Repository: billyjwiorek-tech/nwtb-route-creator.
- Production main confirmed: 8d46a3b8a042c3cf41d88fa8bc902d13dab520d2.
- Exact Pages deployment: run 39600439279, completed/success.
- Same-commit NWTB return lifecycle run 39600440801 and Sales safety run 39600440922 also completed/success.
- Production Supabase: ufnjyidhxuytrmbjzgtu, NWTB Sales Chat, us-east-2, ACTIVE_HEALTHY.
- Production Office: https://billyjwiorek-tech.github.io/nwtb-route-creator/delivery-live.html#dispatch and delivery-standard.html#dispatch.
- Production GPS Driver: https://billyjwiorek-tech.github.io/nwtb-route-creator/driver-live.html.
- Local isolated worktree: /workspace/scratch/ce59ca861587/nwtb-test-setup.
- Feature branch: feat/nwtb-isolated-staging-20261021.
- Separate older production worktree: /workspace/scratch/ce59ca861587/nwtb-dispatch-geocode. Do not use the Universal worktree.

## Actual work completed

The isolated test app is NOT deployed. No test database, test logins or public test link exists yet, and business-name search has not been implemented. Preparatory snapshots and the new traffic/ETA source described below are saved only on this feature branch.

1. Verified exact GitHub main and its successful deployment, without changing main.
2. Created the isolated local feature worktree from that exact commit.
3. Read production schema METADATA only, saved as backend/production-schema-metadata.json: 32 tables, 10 sequences, 122 constraints, 20 SQL functions, 7 triggers and 1 view. No live rows, PINs/hashes, credentials, subscriptions or sessions were exported. This is metadata, not a replayable migration yet.
4. Read 24 relevant deployed Edge Functions and saved their source snapshots in backend/functions with exact version/SHA metadata in backend/functions-manifest.json. These are unchanged snapshots, not test-ready deployments. Read the manifest rather than trusting old handoff version numbers.
5. Saved source/legacy-dispatch.html from the exact pinned legacy page used by the Office Admin wrapper.
6. Found the Vercel team for a future independent hostname: team_z4a4Io2DYq2RSdjLI4WmDupL, slug billyjwiorek-9806. No NWTB Vercel project or deployment was created.

## Latest test-copy addition: traffic overlay and clicked-driver ETA

The user additionally requested that opening the TEST Live Drivers tab automatically display traffic on the existing NWTB map, and clicking a driver display an ETA. Prepared implementation is in staging/traffic; read its README.md before integrating it. The existing map and popup modules are preserved. The frontend adds the traffic overlay and arrival block to the real existing tracker; its installer refuses unisolated output and runtime legacy-download wrappers. The backend is Office-authenticated, read-only, traffic-aware and explicitly refuses both production project refs.

ETA is for the next pending stop on the ACTIVE route, or its actual return depot/custom endpoint when returning. Stale/missing/future/inaccurate GPS, no ACTIVE route, paused route and unavailable/unconfigured provider produce an unavailable message. Stop/route changes while a provider request is pending invalidate the estimate. No OSRM fallback may be called traffic-aware. API keys remain server-side and are never encoded in tile URLs sent to the browser.

23 new offline backend/UI/installer tests passed locally, along with the entire existing NWTB regression suite. No real provider request, live route, session, driver GPS or notification was changed. Syntax checks passed. The primary runtime has Playwright but no installed browser executable, so a real-browser screenshot test could not be run here. Real provider data, separate staging deployment and physical-device testing are pending.

The original pinned tracker HTML is now also saved at staging/source/legacy-tracker.html from commit 52681eac6ded426c7e65ff9a37c42f7bae95010c. It must be vendored and transformed in the isolated output; tracker-live-core.html currently downloads it at runtime in production. The new CI workflow nwtb-staging-traffic.yml runs offline feature/regression checks only; it has no deploy jobs or secrets and does not publish Pages.

No TomTom API key has been supplied. Supabase project capacity remains blocked. Do not say the feature is live or that a working TEST link exists merely because this source is committed.

## Hard blocker: Supabase free-project limit

The account has ONE organization:

- ID xyohnuhedkgimnvfcmuk, name billy.j.wiorek@gmail.com's Org, plan FREE.
- Its two active projects are production NWTB and Universal (khvhcmncwzywqowfodnb).

A create_project request for NWTB Delivery Test in us-east-2 was rejected with: organization members have reached their maximum of 2 active free projects. NO project was created. Do not retry blindly, pause/delete a live project, or connect the test app to either production database.

get_cost returned $0/month under the current FREE plan, but that quote does not remove the active-project limit. Current official public pricing says Pro starts at $25/month, first project included, and additional projects start at $10/month. An organization upgrade can change billing for existing projects too; confirm the actual total with the user before any paid action. No paid upgrade was approved or performed.

The organization selection was asked through the optional input tool, which returned no answers. The existing organization is the only one visible. User authorization covers a separate test setup; it does not authorize a nonzero bill or disruption of either existing project.

## Isolation and implementation requirements

- Keep production main and both production Supabase projects unchanged while building.
- Work only on the feature branch. Do not merge into main, run a production Edge deployment, or create real test stops/routes in production.
- Use a different hostname, not merely a different github.io folder. Same-origin pages share localStorage. Also namespace all test storage keys, service-worker caches and manifests.
- Every frontend and backend endpoint must use the new test project. Add build-time rejection of both production project refs, runtime checks, and restrictive connect/frame CSP. Verify requests in a real browser before describing the test copy as isolated.
- Snapshot source files STILL CONTAIN production origins and other legacy references. NEVER deploy these snapshots or the raw feature branch as a test app. Generate test assets/backend source with explicit configuration and validate the result.
- Both Office editions and Driver editions must work. Test Driver QR must encode the TEST Driver hostname, never the live QR. Preserve the original NWTB visual style and native map.
- Office uses nwtb_delivery_token; Driver uses nwtb_driver_token. Preserve Office/Driver separation and separately namespace test keys.
- Seed only clearly named test employees/fixtures in the test project. Do not copy live employee/session/PIN/security rows, VAPID private keys, push subscriptions, chat, proof-of-delivery files, live route/order history, tracking devices or webhooks. Create new test notification credentials if that feature is tested.
- Copy the actual relevant schema/constraints/triggers/RPCs and deployed functions, not just the two recent repository migration files. Verify schema dependencies and service-only grants/RLS.
- Required release workflow: Office-only PLANNED by default, explicit RELEASE TO DRIVER, driver sees only own released PLANNED or ACTIVE, driver chooses START ROUTE, HOLD allowed only before start, one ACTIVE per driver. Preserve return leg ACTIVE until explicit driver depot-return confirmation.
- Never alter Anthony 7480's deliveries, route state or sessions. The old protected route ID was 3bb69fd5-9b31-4947-a0e1-4cbff21ff25d. Office independently cleared several completed routes on Oct 21; do not restore/reopen them or assume old route IDs are current. Read current state if asked about a live driver.
- Production nwtb-delivery v10 already contains the verified geocoding fix through the authenticated multi-source resolver. Do not redeploy/rewrite it as part of test setup.

## Important traced dependency

The current delivery-live.html and delivery-standard.html shells use dispatch-native.html for Dispatch. Their Administration view uses dispatch.html, which downloads legacy HTML at runtime from GitHub commit 397bb72eefd91f891f540dbe3cc85f6e35ea0951 then document.write's it. A shallow URL replacement would leave that downloaded HTML pointing at production. Vendor/use source/legacy-dispatch.html in the generated test app and rewrite/check that content too. Preserve its appended modules.

Root JavaScript contains many hardcoded project URLs and public keys. office-driver-qr.js and driver-gps-qr.svg also point at production. Driver manifests, service worker and cached/offline queues need independent identities. Frontend function dependencies include routing, location resolvers, route admin, matrix/multi-route, chat, tracking, POD, exceptions, profiles, roles, system control and health. Most relevant deployed sources are in this snapshot; inspect recursive function dependencies before deployment.

## Business-directory provider decision still open

No external business-search provider was implemented or connected yet. Do not promise Google-equivalent coverage.

- Google Places has storage limitations and requires Google Maps when its results are displayed on a map. The user wants the NWTB map/interface. Official policy: https://developers.google.com/maps/documentation/places/web-service/policies.
- ArcGIS supports business/POI searches, but stored results need forStorage=true and appropriate authorization. No licensed provider credential was supplied. Do not save temporary-only results under a different label. Docs: https://developers.arcgis.com/rest/geocode/find-address-candidates/.
- Public Nominatim policy has strict request limits and restrictions on generated generic lookup/vehicle-tracking offerings. Do not blindly add it as the new business directory. Policy: https://operations.osmfoundation.org/policies/nominatim/.
- Photon is a possible evaluation provider using OSM business data. Official komoot/photon README permits reasonable public-demo API usage, no availability guarantee; apply attribution, cautious explicit searches/caching and evaluate actual local business coverage. It has not been tested here. https://github.com/komoot/photon.

## Next actions in TEST

1. Read this checkpoint, inspect the branch/source snapshots and verify current production main read-only. Do not restart the system.
2. Resolve separate Supabase project capacity with the user without affecting live projects or incurring unapproved cost.
3. Build the fully isolated test configuration, schema, backend, seeded fixtures and separate frontend deployment using the existing source.
4. Implement the business-name search with an appropriately licensed provider, correct source/attribution and explicit save behavior.
5. Verify Office to API to isolated database to test Driver and all release/hold/session rules. Test failures and wrong-branch selection as well as successful searches. Preserve existing regression tests.
6. Verify exact deployed test commit and network isolation, then give working TEST links and clearly state what still needs physical-device testing. Only after user approval consider production/Universal changes.

## Tools / environment

GitHub MCP provides create_branch/create_tree/create_commit/update_ref with expected_sha lease. CLI git fetch works but git push lacks credentials; use the connected GitHub tools for checkpoint publication. Supabase tools are connected, but create_project failed solely because of the free-project cap. Node 24/npm and the primary runtime Playwright are available locally. psql, pg_dump, Docker, Supabase CLI and Vercel CLI are not installed. Do not claim local Postgres or browser tests were run in this setup task.

The user prefers direct action, simple explanations and explicit clicks. Keep frequent progress updates. Do not spawn subagents unless explicitly requested by the user or applicable instructions.
