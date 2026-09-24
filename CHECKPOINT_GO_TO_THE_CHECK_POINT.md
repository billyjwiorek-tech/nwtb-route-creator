# NWTB LIVE TRACKING ROLLBACK CHECKPOINT

Checkpoint phrase: **GO TO THE CHECK POINT**

Created before starting the from-scratch NWTB built-in web tracking engine.

## Exact frontend baseline
- Repository: `billyjwiorek-tech/nwtb-route-creator`
- Baseline branch: `checkpoint-go-to-the-check-point-2026-09-23`
- Exact application baseline commit: `85a880e4f76e64edfbbc647bc834bc89c0679e75`
- Main branch state at checkpoint: `85a880e4f76e64edfbbc647bc834bc89c0679e75`

Restoring the application to that commit restores the Live Tracking frontend to the state immediately before the new tracking-engine project began.

## Live Tracking state at checkpoint
- `delivery-live.html` = Live Tracking workspace
- `driver-live.html` = Live GPS + built-in navigation driver edition
- `tracker-live.html` = Live Drivers tracker wrapper with false always-live badge removed
- `driver-navigation.js` = current built-in turn-by-turn navigation implementation
- Existing GPS Routing App integration remains available
- Existing WEB_DRIVER browser geolocation integration remains available
- Current Standard edition and protected production files remain separate and must not be changed by the new tracking-engine experiment.

## Supabase backend baseline
Project: `ufnjyidhxuytrmbjzgtu`

Tracking-related functions at checkpoint:
- `nwtb-delivery-tracking` version 5 — SHA `979a7e654d278441b3b94f5c005017eb212e0db59d6274cfe72c1c893f7901db`
- `nwtb-traccar` version 2 — SHA `3b43b964b01d02defe5d207f5c18b80d9c6da2629a920a9f19685c7cf26d4282`
- `nwtb-traccar-provision` version 2 — SHA `b1b21043cda65d2032206f1f777b0e8e6388bd5e1ff3bdeff5457d36b22e0e34`
- `nwtb-delivery-route-ops` version 1 — SHA `9a4a4901aac84391ed12c41301a099c7391fb49f331ae711cf0094217facfa3a`
- `nwtb-driver-navigation` version 1 — SHA `ec0efbf8cb48c3f94e97459c05f89799c608784b799d16ea280de471320c084a`

## Rules for the new built-in tracking project
1. Build the new tracking engine under new/isolated files and, where practical, new Supabase function names.
2. Do not destroy or overwrite the current GPS Routing App infrastructure.
3. Do not modify Standard edition behavior.
4. Do not modify protected Sales files.
5. Avoid destructive database/schema changes. If an additive schema change becomes necessary, record its exact reverse operation before applying it.
6. Existing delivery history and GPS location records are operational data and are not erased by a code rollback.

## Meaning of the rollback phrase
When the user says **GO TO THE CHECK POINT**, restore the live application code to commit `85a880e4f76e64edfbbc647bc834bc89c0679e75` / this checkpoint branch and disconnect any new tracking-engine code from the live system. Restore any modified tracking-related backend functions to the versions recorded above if they were changed. Preserve operational route/order/location history unless the user separately requests data deletion.
