# Review, refill, and print Sales routes

Click **CREATE + PREVIEW ROUTE** to review the proposed customer stops. Use **REMOVE** to skip a business for this route, or **UNDO** to restore a removal. Preview stops are not available for navigation, printing, or sharing until finalized.

Click **DONE** to keep the remaining stops, select eligible replacements up to the originally requested customer count, and re-optimize the round trip. For example, requesting 10 and removing 2 keeps the other 8 and adds 2 alternatives when available. Replacements use the captured route type, subtype, area, map selection, and follow-up settings. New Business alternatives minimize added road travel around the kept stops; other route types retain their existing selection rules.

The account list is refreshed before replacement selection. The existing cloud route validator checks the optimized stops before final rendering and again before printing. HOLD, excluded, DO NOT ROUTE / NOT A FIT, duplicate, or otherwise invalid stops remain blocked. If too few eligible alternatives remain, the finalized route explicitly reports its shorter count. A network or validation failure leaves the preview available for retry.

Final routes have **EDIT STOPS** and **PRINT ROUTE LIST** controls. Earlier removals remain excluded through repeated edits of the same route. A new CREATE starts a new removal session; removals do not change customer categories or visit statuses. Canceling an edit restores the previous finalized route after a fresh safety check.

The print layout contains the date, numbered businesses and addresses, phone numbers, customer numbers, account categories, visit-note space, and return to NWTB. It prints the finalized replacement list. Browser Print during an unfinished preview shows a reminder to finalize instead of printing an old route.

Sales uses `sales-build-version.json` for this release. Shared Delivery build-version files, Delivery pages, routing/navigation services, and account data are unchanged.

Validation: `node --test tests/sales-route-safety.test.cjs tests/sales-route-preview.test.cjs`. Desktop, 390-pixel phone, and alternate Sales entry-point browser flows were also exercised with synthetic accounts and intercepted fixture APIs; no route was posted to live chat.
