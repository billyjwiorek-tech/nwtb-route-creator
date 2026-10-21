# NWTB Driver voice guidance

Production baseline: `43dc5492174ae7aa042c94fb0369287e17268d2f`.

The GPS Driver page loads `driver-navigation-native.js` and `driver-voice-live.js`. The navigation module owns maneuver progress; the voice helper selects the voice and unlocks/resumes browser speech after user interaction. Both are versioned `20261021-voice1` in the GPS page and its offline shell.

## Defects and resulting behavior

- The previous voice helper watched rendered instruction text and automatically repeated it after a twelve-second interval, even when the vehicle had not progressed. That independent speaker has been removed. GPS, distance, ETA, visibility and traffic refreshes do not independently trigger speech.
- The navigation module announces an advance cue and a final NOW cue at most once per maneuver. Progress survives traffic refreshes, rerouting to the same nearby junction and movement back and forth across the distance threshold. A different junction with the same instruction still receives guidance.
- Arrival interrupts automatic turn announcements and is announced once for the destination. This also fixes repeated depot arrivals that alternated between an arrival maneuver and the arrival message.
- REPEAT TURN remains an explicit repeat and can be used multiple times. Pointer, touch and click events unlock speech without adding duplicate utterances or canceling the current instruction.
- A new destination resets turn progress and clears the previous steps. Ending navigation clears progress and cancels speech. There are no deferred fallback utterances left to speak after navigation ends.

Maps, route creation/release/start, GPS reporting, completion/POD, return confirmation, employee sessions and the Standard Driver edition retain their existing workflows. Universal is outside this change. The deployed navigation Edge Function was inspected read-only and remains version 5; no backend or data changes are required.

## Verification

`node tests/driver-voice-guidance.test.cjs --prove-original` reproduces the repeated stationary turn and depot-arrival loops from the baseline commit using the actual navigation and voice modules. The regular test uses silent speech output, simulated GPS and an isolated DOM to verify automatic cue progression, refreshes, threshold jitter, repeated manual taps, next destinations, speech failure recovery, arrival and cancellation. No production routes, sessions or GPS reports are used by these tests.

Run `npm --prefix tests test` for the full NWTB regressions. Publication requires the exact main Pages deployment to complete successfully and the public byte check to match the GPS page, navigation module, voice helper and service worker. Physical phone audio still needs confirmation on the next legitimate driver trip after the updated GPS page is reloaded.
