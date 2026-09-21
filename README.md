# NWTB Bolingbrook Daily Sales Route Creator — GitHub Pages Edition

This package is prepared for free GitHub Pages static hosting.

## Current sales intelligence
- GO FIRST: 79
- VERIFIED PROSPECTS: 11
- TRUE WIN-BACK: 269
- ACTIVE CUSTOMERS: 154
- TOTAL UNIQUE BUSINESSES: 513

## Files to upload to the repository root
- `index.html`
- `accounts.json`
- `.nojekyll`

The app uses browser-side OpenStreetMap/OSRM routing and then creates Google Maps navigation links. No Google Maps Platform API key is required.

## Important privacy note
On GitHub Free, GitHub Pages is published from a public repository. This means the website and the `accounts.json` file are publicly accessible to anyone who finds the URL. Do not publish this package if the customer/account list must remain private.

## GitHub Pages setup
1. Create a new public repository, e.g. `nwtb-route-creator`.
2. Upload the three site files to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch **main** and folder **/(root)**, then **Save**.
6. GitHub will provide a URL similar to `https://YOUR-USERNAME.github.io/nwtb-route-creator/`.

The `index.html` file uses a relative path for `accounts.json`, so it works correctly from a GitHub Pages project URL.
