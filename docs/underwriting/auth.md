# Underwriting Auth

Underwriting uses the app-wide server session check. It is switched off in production on purpose, so anyone with the site address can open the underwriting pages today.

## What the code does

- Every route under `app/api/underwriting` calls `requireApiUser` or `authorizeRequest` from `lib/auth/server.ts` before it touches the database.
- The `(app)` layout calls `authorizeRequest` and redirects to `/login` when the answer is not ok, so every underwriting page sits behind the same check.
- With sign-in on, the check reads the Supabase session, requires a verified email, and compares it to the `KULKA_AUTH_ALLOWED_EMAILS` allowlist. No session gives 401, an email off the list gives 403, and missing configuration gives 503.
- With `KULKA_AUTH_OPEN=1`, the check returns a fixed open-access user and `proxy.ts` redirects `/login` to `/`. Production runs this way (Matt, 2026-09-23).
- Published budget links under `/b/` sit outside sign-in in both modes.

## What it does not do

- The database enables row level security on the underwriting tables and gives browser roles no policies. The server connection still runs with no per-user check, so a signed-in user can read and change any case. Matt chose this on 2026-09-20 because the allowlist is small and internal. A project-membership check belongs in `lib/auth/server.ts` if the user base grows.
- While `KULKA_AUTH_OPEN=1` is set, the allowlist is not read at all.

## To turn sign-in back on

1. Remove `KULKA_AUTH_OPEN` from the production environment.
2. Set `KULKA_AUTH_ALLOWED_EMAILS` and the Supabase public keys.
3. Run the browser check in `docs/underwriting-browser-check.md` with a signed-in and a signed-out session.
