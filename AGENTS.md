# NWTB release requirements

Continue this existing Delivery architecture. Do not rebuild it. Preserve Sales and Universal; this Delivery workflow does not authorize changes to either.

Before edits, verify current main and deployed Supabase state. Inventory every public entry point, redirect, dynamically loaded module, service worker and deployed Delivery function. Reconcile source drift before redeployment. Read `docs/NWTB_RELEASE_INTEGRITY.md` and run the release integrity workflow in addition to the existing behavioral/database regressions.

Keep Office and Driver credentials separate. Retire older entry pages by forwarding their existing URLs to current pages. Never put a PIN, private key or service credential in a public client. Enforce ownership, explicit release, one ACTIVE route, POD and confirmed return on the server, including old endpoints.

Use synthetic providers, fake sessions and disposable databases. Do not create random production routes, log in a test Driver, emit GPS, send chat, enter a real PIN or change delivery/POD history to make a test pass. Rejected offline evidence must remain recoverable by its owner. A partial or mismatched offline build must not replace the working build.

Immediately before each production deployment, read the production ACTIVE route count. Require zero unless the user explicitly authorizes an identified exception. Confirm any additional user-specific return gate exactly; do not infer arrival from GPS silence or zero pending stops. Never cancel/complete a route to satisfy a gate. Keep protected historical records unchanged.

Require feature-branch CI success before promotion. Update reviewed source/client/dependency inventories with `node scripts/nwtb-build-release.cjs`; never update an inventory to conceal an unexplained mismatch. After deployment compare exact Edge source files and ACTIVE versions, fetch fresh main, require successful completed Pages/CI for that exact SHA and verify production asset bytes. Record physical-phone tests separately from simulations. Do not claim every bug was eliminated.

GitHub branch-protection settings require repository administration rights; a workflow alone does not prove required-check enforcement. Never claim that enforcement is installed without verifying it. A missing permission is a concrete blocker to report after finishing all independently authorized work.
