# Verified NWTB releases

The October 30 audit found deployed/repository drift, obsolete public entry points, a public PIN literal, permissive completion/supervisor APIs, lost rejected offline proof, an incomplete-cache activation path, an outdated spreadsheet reader and inconsistent route dates. Tests reproduce these failure types without production deliveries or credentials.

The `NWTB release integrity / release-integrity` check validates the complete source and client inventories, compatibility forwards, reviewed dependency versions/hashes, public credential/PIN scanning and the installed Driver shell. Its behavior tests cover the actual handlers and browser modules, including rejected requests and interrupted downloads. Existing lifecycle tests continue to exercise routing, return/POD, chat, release/hold and Office isolation. Database checks run in disposable PostgreSQL.

All 31 deployed Delivery/shared functions are recorded in `release/nwtb-functions.json`. Sales-only functions are outside this release inventory. Sources copied from production are reconciliation, not permission to redeploy unchanged functions. Historical database migrations pre-dating the five checked-in migrations remain in Supabase's existing history; this change does not claim to reconstruct a fresh production database.

Run `npm ci --prefix tests --ignore-scripts`, `node scripts/nwtb-build-release.cjs`, `node scripts/nwtb-release-check.cjs`, `node --test tests/release-integrity.test.cjs` and `npm --prefix tests test`. Review inventory diffs. A fresh authorized connector export can be passed to `node scripts/nwtb-verify-deployed.cjs <private-evidence.json>` to compare every remote source/version/auth setting and require current exact-SHA deployment evidence. Keep that export outside Git; it is not a credential input and makes no delivery API requests.

For each production mutation, re-read the zero-ACTIVE gate immediately beforehand. Preserve Roy's already ended route and POD and every other existing delivery record. No test Driver login, GPS, chat or route transition is part of this release. Verify both Office editions and both Driver editions safely, then ask the driver to reopen the canonical app while parked.

The Driver worker downloads and hashes all critical resources before activation. It serves the critical shell from one installed release. An interrupted/mismatched update leaves the prior worker in charge. Online provider/GPS availability and locked-phone suspension are still separate device/network limits.

Required-check enforcement in repository settings is distinct from running CI. Configure the integrity job and the existing lifecycle/database jobs as required checks through repository administration, and verify that setting. The connected GitHub integration cannot read or modify branch protection; do not claim that setting is enforced merely because a workflow exists. No Sales or Universal workflow is modified.
