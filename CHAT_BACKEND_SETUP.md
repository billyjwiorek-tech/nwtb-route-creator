# NWTB Chat + Route Sharing

This project needs a shared backend for cross-device chat and route sharing.

## Why
GitHub Pages is a static website. It cannot safely store shared chat messages, validate employee IDs privately, or push a route from one employee's browser to another employee's browser by itself.

## Intended behavior
- CHAT button in the route creator.
- 4-digit employee ID login.
- Employee ID is validated on the backend against the employee directory.
- Special ID `0000` displays as `Your Mom`.
- Messages show employee display name and time.
- `SEND CURRENT ROUTE` posts the current optimized route into chat.
- A route message contains the ordered stops and can be opened by another employee.
- `LOAD ROUTE` loads that route into the route creator.
- Updated routes can be posted as a new route message with a note.

## Security requirement
Do not publish the employee-number-to-name directory in the public GitHub Pages repository. Employee validation should happen in the shared backend.

## Recommended free backend
Use a free Supabase project with:
- `employees` table: employee_no, display_name, active
- `chat_messages` table: id, created_at, employee_no, display_name, message, route_payload

The public browser should use a Supabase anon key with Row Level Security. Employee directory reads should not be exposed directly; validation should be done by a database function / RPC or Edge Function.
