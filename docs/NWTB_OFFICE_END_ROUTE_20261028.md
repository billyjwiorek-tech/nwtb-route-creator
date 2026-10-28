# Office END ROUTE

Driver View has a prominent red END ROUTE button. The full Office Route Screen also exposes END ROUTE near the release state. Both open the same PIN-protected Office override, preselect the entire-route action and show the exact driver, route date, depot, current status and unfinished-stop count.

The Office operator enters the existing management PIN, supplies a reason and confirms the displayed route. Merely opening either screen or verifying the PIN does not modify a delivery. An empty ACTIVE route can be ended without selecting a stop. PLANNED, paused and returning routes use the same explicit flow.

## Recorded behavior

- The route becomes CANCELED. Office records an `end_route` audit entry and `OFFICE_ROUTE_ENDED` event with the actor and reason. It does not fabricate a driver return or mark undelivered stops as delivered.
- Pending orders return to AVAILABLE (`UNASSIGNED`). Their old route-stop rows remain as SKIPPED history with an Office-ending note. Completed deliveries, POD, route metrics, release history and return timestamps remain intact.
- The ended route releases its single-ACTIVE slot. Other planned routes are not started or released automatically.
- The existing route/stop/order locks and mandatory server PIN verification apply. Reviewed route and stop revisions are checked again under lock. A conflicting order, duplicate live assignment or saved POD on a pending stop blocks requeueing.
- Updated GPS and Standard Driver pages handle either the event or canonical CANCELED status, stop navigation and route polling, clear obsolete controls and show ROUTE ENDED BY DISPATCH. GPS presence continues in idle mode; neither Driver nor Office is logged out. Late route responses cannot redraw the canceled route.
- Both Office editions load the new controls with `20261028-endroute1`; the Driver shell cache is v12. Existing Driver URLs and QR content stay the same.

## Validation

Fixtures cover empty ACTIVE routes, planned/unreleased routes, paused/returning routes, pending and completed stops, preserved POD, stale route/stop reviews, wrong PIN, Driver/anonymous denial, system lock, duplicate requests and conflicting assignments. The real POD finalizer rejects a late completion after route cancellation. The existing four Office override operations and return lifecycle remain in the regression suite.

Real Driver page code is exercised in iPhone, Android and Standard fixtures to confirm navigation cleanup, session isolation, an unchanged Driver login, idle GPS handoff and rejection of late route reads. Production checks only inspect controls and open/cancel the PIN dialog; they do not end an actual route or enter a production PIN.

As a web app, the phone handles the notification when it is connected and executing the updated page. An older open page should be reopened while parked. This does not provide native background execution on a locked or suspended phone.
