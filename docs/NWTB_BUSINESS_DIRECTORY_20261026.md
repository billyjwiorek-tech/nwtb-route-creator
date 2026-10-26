# NWTB business search: closest first and TomTom directory

Office business searches use the existing server-side `TOMTOM_API_KEY` with TomTom's supported POI Search API. Only POIs in the United States with usable street/city coordinates are returned. The key stays inside `nwtb-office-map`; Office session credentials are never forwarded to the provider.

Both Dispatch and the custom route builder prefer the selected Bolingbrook or Palatine depot. No radius keeps the search unrestricted within the United States while still preferring and displaying the closest returned matches. An explicit radius remains a hard circle; the backend checks the exact distance after provider filtering. Distances are straight-line estimates, not driving miles. Provider candidate limits mean this is not an exhaustive list of every branch.

TomTom is the primary directory. When no valid primary candidates are available, or the current key lacks Search access, the existing Photon/OpenStreetMap directory remains a labeled backup with depot preference and closest-first ordering. Missing keys, provider failures and raw provider error text never disclose secrets. Existing per-session rate limits, bounded caches, Office authentication, CORS and production-project guards remain intact.

Customer, vendor and saved-location results retain their identities and existing load/add actions. Located NWTB matches and public businesses share closest-first order. Records without verified coordinates remain visible after located matches with an explicit distance-unavailable label. Numeric account searches retain account-match order. Internal NWTB directories are not radius-filtered.

Searching and loading a candidate remain read-only. ADD STOP, SAVE AS FREQUENT LOCATION, route creation, release and Driver start remain separate explicit actions. Office and Driver tokens, active routes, delivery status, GPS navigation, traffic maps and route preview ETAs are unchanged.

Validation covers primary and backup providers, California versus local ordering, no radius, selected-depot caches, exact radius boundaries, malformed/foreign/non-POI results, incomplete addresses, missing coordinates, provider access/outage fallback, credential isolation, query encoding and stale search responses. Full existing NWTB and Sales regression checks are required before deployment. Real production verification uses business searches only and must not create or activate deliveries.

Office and Dispatch cache references use `20261026-nearby1`; public app addresses and the existing Driver QR remain unchanged.

Provider reference: https://docs.tomtom.com/search-api/documentation/search-service/points-of-interest-search
