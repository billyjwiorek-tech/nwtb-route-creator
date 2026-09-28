# NWTB Bolingbrook Daily Sales Route Creator — Cloud Production

The production Sales Route Creator is a cloud-hosted web application. It does not require a local Windows server, Command Prompt window, localhost, `127.0.0.1`, or an office PC to remain powered on.

## Production architecture

**Authorized browser / phone → GitHub Pages frontend → Supabase authentication + private Sales data + routing services**

Production URL:

`https://billyjwiorek-tech.github.io/nwtb-route-creator/`

## Sales data

The customer/prospect source is stored in the private Supabase `sales_accounts` table and is returned only through the authenticated `nwtb-sales-app` Edge Function.

The public `accounts.json` runtime file has been removed from the current production branch.

## Authentication

The Sales frontend requires an active NWTB employee number before it loads the customer/prospect database. The Sales login reuses the existing NWTB employee/session system so Sales chat and route sharing can use the same browser session.

## Routing

- Sales selection, priority and territory rules remain Sales-specific.
- Route ordering uses the NWTB Delivery road-matrix routing engine.
- Built-in Sales turn-by-turn navigation uses the cloud-hosted NWTB navigation service plus browser GPS and OpenStreetMap/Leaflet.
- Google Maps remains available as a backup launcher.
- The final route returns to Northwest Trucks — Bolingbrook.

## My Maps exporters

The My Maps sync/export pages also load Sales data through the authenticated cloud source. They no longer require a public `accounts.json` file.

## Local-server rule

Do not reintroduce a dependency on port `8765`, `localhost`, or `127.0.0.1` for the Sales application. Production must remain usable when the office PC is shut down.

## Data-history note

The current branch no longer publishes the Sales account JSON file. Because this repository was historically public, older Git commit objects may still contain prior copies until repository history is separately purged or the repository is made private. Do not treat deletion from the current branch as a historical Git purge.
