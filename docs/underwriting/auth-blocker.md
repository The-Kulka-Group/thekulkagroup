# Underwriting Auth Blocker

The app does not have a server auth or session pattern that underwriting can reuse.

The checked code shows:

- `app/login/page.tsx` renders email and password fields but has no submit handler or auth client.
- The repo has no middleware, server session helper, cookie check, or user lookup.
- `app/api/rom/route.ts` says that LA-13 will add the site auth gate.
- Server pages and API routes call `getDb()` without a user identity.
- The database enables row level security on underwriting tables and gives browser roles no policies. The server database connection still has no user-level access check.

An underwriting-only header or cookie check would leave the rest of the app open and would create a second auth rule. LA-13 must add the app-wide server session first. Once that exists, every underwriting page and API read or write must check the same session before the first database call.
