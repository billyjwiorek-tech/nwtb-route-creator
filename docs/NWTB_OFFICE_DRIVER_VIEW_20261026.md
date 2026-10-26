# NWTB Office Driver View and return voice recovery

The existing GPS and Standard Office shells open `office-driver-preview.html` for Driver View. Office remains an observer until a user deliberately selects OFFICE OVERRIDE, verifies the existing management PIN, selects a pending stop or an available order, enters a reason, and confirms the concrete change.

## Office view

- Driver and route selectors show staged, released, active and recent completed routes. The saved route and uploaded POD remain available before a phone has the new screen reporter.
- The navigation panel uses the actual text values reported by the Driver app: instruction, turn distance, ETA, remaining distance, arrival popup and POD form phase. It does not relabel an independently calculated Office ETA as the phone's ETA.
- A report must come from the same driver's unexpired session, match the selected route and pending target, be visible in the foreground, and be at most 25 seconds old. Stale or mismatched reports clear live figures and the purple phone path.
- Blue road legs follow the saved stop order. Orange is the assigned return. Purple is the actual navigation geometry most recently reported by the phone. These are separate from TomTom traffic colors. Missing coordinates or a provider failure do not produce fake road lines.
- CHAT WITH DRIVER opens the existing private Dispatch conversation in a dialog on this screen, preserving sent/seen receipts and phone alert behavior. No previous message is required to select a registered driver. Opening the observer does not send chat or acknowledge messages.
- Saved POD photos and signatures use the existing authorized POD API and expiring storage URLs. Recipient drafts and unsaved signature/photo data are never sent by screen syncing.

## PIN overrides

The new `nwtb-office-driver-view` Edge Function validates the existing Office session. Every mutation calls `nwtb_office_override`, which verifies the existing backend PIN hash again, locks the route and relevant rows, checks the displayed route/stop revisions, applies the change and records an audit in one transaction. Incorrect PIN attempts are limited durably to five per five-minute window. The UI keeps the supplied PIN only in page memory for up to five minutes and clears it when the dialog closes, Office session changes, or the page exits. No PIN is embedded in the source, audit or browser storage.

Operations are complete stop, change priority (with an explicit optional move to the next pending slot), add an available located order, and remove a pending stop back to AVAILABLE. Office completion is identified as an override and creates no POD. Completed/POD stops cannot be removed. Existing release gates, paused-route guards, one-active-route constraint, and the explicit driver return confirmation remain in force. Editing an office-only planned route does not release it.

Driver route-change polling opts into the additional Office audit event types. It refreshes the saved stop list and reconciles an already-running navigation target after an explicit override. Opening Office Driver View never invokes that mutation path, a driver login, route start or GPS request.

New tables have RLS enabled and no browser role privileges. New RPCs are security invoker functions with execution granted only to the service role. The screen table contains one latest report per driver; it is not a video feed or a full recording of every driving action. Supabase project `ufnjyidhxuytrmbjzgtu` only.

## Return guidance

The previous navigation code advanced maneuvers only when a GPS fix entered a 28 m radius. A fix before a junction followed by another after it could leave an already-passed instruction selected. The new code also uses projected progress along the actual road geometry to retire passed maneuvers. This does not infer that the driver took a wrong turn.

Speech now handles browser start, end and error events and retains the current utterance while it is queued. A blocked or stalled utterance produces a RESUME VOICE control rather than silently counting it as spoken or repeating it on every GPS update. The return announcement is queued before return route calculation so it cannot cancel a newly issued first turn. A failed post-save route read offers reconnect/retry controls. No active route is started again to resume navigation.

These fixes address reproduced code behavior. Existing production event history cannot establish whether the driver's phone was locked, its volume was audible, or whether its speaker played a particular utterance. Web navigation still requires the browser/phone to allow foreground GPS and speech; real iPhone/Android checks are required.

## Verification

- `tests/driver-return-handoff.test.cjs --prove-original` reproduces the old skipped-GPS-corner defect using the previously deployed source.
- `tests/driver-return-handoff.test.cjs` verifies the corrected maneuver, last-stop-to-return transition on simulated iPhone/Android, asynchronous speech failure and explicit recovery.
- Existing Driver map/POD, voice, road-progress, Android, presence, chat receipts/push, release/return, Office map/traffic and NWTB Sales checks remain required.
- New backend and DOM checks exercise observer isolation, exact values, stale clearing, PIN controls, empty-driver conversations and route geometry using fixtures. Passive screen syncing is tested without geolocation access or Office credentials.
- Disposable PostgreSQL CI validates all four override operations, PIN denial/rate limits, optimistic checks, audit/idempotency, release preservation, return lifecycle, storage ordering and anonymous access denial. Fixture schemas and fake PINs must never be applied to production.
- Release requires exact main-SHA Pages success, successful lifecycle/Sales checks, deployed Edge source comparison, public asset byte comparison and read-only production inspection.

Existing Driver URLs and QR contents are preserved. A phone already on the old page needs a normal reopen/reload while parked to load the new reporter and voice code; no remote refresh is forced. Actual phone ETA/arrival/POD changes and notification sound still need a driver-assisted check. Universal is untouched.
