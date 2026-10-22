# Optional Office business-search radius

Baseline: `3e8432798d5ffbd7574455f08723618fa43141c6`.

Both Office editions load the same native Dispatch page. Dispatch and its custom route builder now provide visible, independent business-radius and depot selectors through `office-business-search.js`. The default is **No radius — search U.S. by name**. Optional radii are 5, 10, 25, 50 and 100 straight-line miles from NWTB Bolingbrook or Palatine.

With no radius, the backend sends the entered query to the public business directory with the existing U.S. restriction and no depot focus, bounding box or location bias. Name relevance determines the public result order. Changing the reference depot only changes displayed straight-line distances. A selected radius sends a geographic bounding box and depot focus, then the backend applies a precise circular distance cutoff and sorts the surviving businesses nearest first. A box corner outside the circle cannot leak into the results. Up to 50 directory candidates are requested and returned; provider coverage and its result cap still apply, so the list is not an exhaustive inventory of all businesses.

Radius is optional, validated server-side, and included in cache identity. Unsupported values are rejected rather than silently broadening the search. There is no automatic expansion when a local search is empty. Office can explicitly select a larger radius or No radius. Changing the name, radius or depot invalidates pending responses and clears old results. Customer, vendor and saved-location directories remain searchable independently of the public-business radius, and retain their existing review/add/save workflows.

The read-only `nwtb-office-map` function keeps its existing Office-session authentication and production-only project guard. Traffic tiles, live-driver ETA, route release/hold, Driver navigation and GPS/session behavior are unchanged. Search never saves a location, adds a stop, starts a route or creates a Driver session.

Both Office shells, both native Dispatch files and the legacy Dispatch wrapper load `20261022-radius1` search assets. The shared search-controls module loads before either search consumer. The full production-byte verifier discovers the new dependency through the deployed pages.

Verification covers no-radius requests without geographic bias, strict radius boundaries, bounding-box corners, nearest-first sorting, both depots, all radius choices, isolated cache scopes, invalid inputs, more than 15 candidates, both Office search interfaces and late-response rejection. Existing NWTB regression tests cover Driver distance/ETA, voice, Android support, POD/map/return lifecycle, release authorization, chat, presence, Office traffic/ETA and Sales separation. All database fixtures are disposable. No production route, delivery, saved location, driver login, chat message or GPS position is created or changed for testing.
