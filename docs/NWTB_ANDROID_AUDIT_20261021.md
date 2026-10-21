# NWTB Android compatibility audit — October 21, 2026

Production baseline: `28f753efd12787eb852b37d543550090cbce5074`. Scope is the existing NWTB Delivery System only. Universal is unchanged.

## Fixes

1. Both Driver editions now use a shared service-worker notification path for added/removed stops and reoptimization. GPS arrival uses the same path. Android rejects the desktop `Notification` constructor; the previous code caught that error and silently lost the phone notification. In-app banners and audio remain available if phone notifications are unavailable or blocked.
2. Office return-alert pop-ups retain their existing desktop behavior, with the mobile-supported worker as a fallback. Notification taps target the correct Office or Driver edition, preserve chat behavior, reject other origins and never start a route. Office still has its separate seven-second sound.
3. Automatic Driver audio setup no longer requests notification permission on page load or an unrelated first tap. Explicit notification controls retain permission setup. Chat phone push remains separate from foreground route polling.
4. Short navigation distances now convert meters to feet before being labeled as feet. For example, 30.48 meters displays as 100 feet.
5. Offline delivery proof and exceptions remain bound to the driver who saved them. Another driver's login cannot upload or discard that backlog. Concurrent reconnect hooks cannot submit the same queued item concurrently; server outages preserve it for retry. Existing queued items infer their owner from their existing payload without a storage migration.
6. The updated offline shell includes the Leaflet engine/styles and the production Driver modules. A versioned static asset can fall back to its copy in the current shell cache. This query-insensitive fallback is limited to local static files and the pinned Leaflet assets; business searches and API requests retain their complete request identity.

## Coverage and evidence

The new `tests/android-compatibility.test.cjs` runs production HTML and JavaScript with Android-style mobile capabilities, including a Notification constructor that throws. It checks both Driver sign-ins, leading-zero employee numbers, expired sessions, Office/Driver token separation, route inspection versus explicit start, pause/reason/resume, route alerts, reoptimization, arrival, worker notification clicks, Office pop-up fallback, real Leaflet map lifecycle, orientation events, touch signature, large camera-image preparation, denied GPS, offline proof ownership/retry and static cache recovery. It also checks syntax and entry/dependency wiring for 72 production pages/modules.

`node tests/android-compatibility.test.cjs --prove-original` reproduces the lost Android route notification in both baseline Driver editions. All tests use isolated fixtures: they create no production deliveries, driver sessions, location reports, chat messages or test notifications.

The full existing suite also covers release/hold authorization, hidden office-only routes, route return confirmation, POD and exceptions, voice repetition, chat and seen receipts, encrypted phone push and account binding, driver presence/MPH freshness, native Office route preview, geocoding, business search, live traffic/ETA, Office alerts and Sales separation. CI checks the route/presence database migrations in disposable Postgres.

Read-only production inspection confirmed all 23 Edge Functions referenced by the audited pages are ACTIVE. Deployed tracking v15, Delivery Chat v7 and POD v3 exactly match the repository sources used by the tests. Navigation v5 was inspected for its current maneuver contract and CORS support. No backend deployment, database migration or production-data change is part of this release.

Publication must be verified against the final main SHA: GitHub Pages `completed/success`, main regression workflow success, and public asset bytes matching that exact commit. The public check now follows the Office/Driver dependency inventory in addition to the existing critical-asset manifest.

## Real Android phone checks still required

This is an automated source/capability audit, not physical-device certification. Current Android Chrome is the intended Android browser. A real Android phone must confirm the following while safely parked, followed by the next legitimate delivery:

| Area | Device check |
| --- | --- |
| Sign-in and routes | Scan the existing GPS QR, enter the driver's own four digits, and confirm only their released/active routes appear. Merely opening a planned route must leave it planned. |
| Installation | Add NWTB Driver to the Home Screen; reopen the correct edition and verify the launcher icon and saved sign-in. |
| GPS and map | Grant location access, start the actual assigned route, and check the map, movement, MPH freshness, rotation and foreground recovery. |
| Voice | Confirm one advance cue, one final cue, one arrival and deliberate REPEAT TURN on the phone speaker and the driver's Bluetooth setup if used. |
| Completion | On a real delivery, complete a photo or touch-signature POD; verify next-stop and return-depot maps remain visible. |
| Chat and phone push | Tap ENABLE PHONE NOTIFICATIONS, allow permission, then TEST PHONE ALERT. Lock the phone and check the alert and normal notification sound. Confirm MESSAGE SEEN and REPLY during an authorized chat test. |
| Reconnection | Confirm the offline indicator and later sync on an authorized delivery if coverage is lost; avoid clearing app/browser storage with updates pending. |

Continuous background GPS and spoken navigation are not reliable browser capabilities when the phone is locked, another app is in front, or the OS suspends the page. Home Screen installation does not remove that limitation. Server-sent chat push can wake the notification worker; foreground route-change polling cannot. New live routing, map tiles and traffic estimates require connectivity; viewed tiles and saved route data are not a complete offline-navigation product. Android notification permissions, sound settings, battery policies and Do Not Disturb remain under the phone owner's control.

Platform references: [MDN mobile Notification constructor limits](https://developer.mozilla.org/en-US/docs/Web/API/Notification/Notification), [Chrome page lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api), [Android web push behavior](https://web.dev/articles/push-notifications-faq), [speech synthesis compatibility](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis).
