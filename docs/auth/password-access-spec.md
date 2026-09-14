# Password setup and recovery

This extension closes the missing password step in LA-13. It keeps the existing
five-address allowlist, disabled public signup, server-side authorization, and
Daylight login design.

## User flows

1. An invited user opens a Kulka link and sees a short confirmation page.
2. The user presses Continue. The server verifies the single-use Supabase token,
   checks the verified email against the five-address allowlist, and stores the
   session in cookies.
3. The user chooses and confirms a password of at least 12 characters.
4. The server updates the Supabase user and sends the user to the requested safe
   internal page.
5. A user who forgets a password can request a recovery email from the login page.
   The form always returns the same response so it does not reveal which accounts
   exist or have access. The app preserves the safe page the user first requested.

## Security rules

- Public signup stays disabled.
- Only `invite` and `recovery` email tokens are accepted.
- Every return path passes through the existing same-origin path guard.
- A link creates no session until the user presses Continue. This prevents an
  email scanner's GET request from consuming the single-use token.
- The app never chooses, stores, logs, or sends a password.
- Invalid, expired, replayed, and forbidden links return a generic error.
- Auth pages and responses require revalidation in the browser and `no-store` at
  the CDN. Responses that set auth cookies also use `private, no-store`.
- The Supabase invite and recovery templates point to the Kulka confirmation page
  with `TokenHash`, not an access token.

## Guarded production release checklist

Do not merge or start this checklist without separate approval. Record the operator,
time, deployment commit, and evidence for each item. Stop the release if any check
fails. Do not work around a failed check by turning on the old access bypass.

### Before deployment

- [ ] Record the production Supabase URL. Confirm that `NEXT_PUBLIC_SUPABASE_URL`
  matches the approved `https://<project-ref>.supabase.co` project, then record the
  full URL in the release evidence.
- [ ] Confirm that `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` belongs to that same
  project. Do not paste the key into the release evidence.
- [ ] Set `KULKA_SITE_URL` to `https://kulka.ai`.
- [ ] Set `KULKA_AUTH_ALLOWED_EMAILS` to the five approved, unique email addresses.
  Keep the addresses in the server environment. Do not put them in client code or
  release notes.
- [ ] Remove `KULKA_AUTH_BYPASS` from every production environment. The application
  code no longer supports it, so any remaining value signals stale setup.
- [ ] In Supabase Authentication settings, disable public user signup.
- [ ] Set Authentication, URL Configuration, Site URL to `https://kulka.ai`.
- [ ] Add `https://kulka.ai/auth/continue*` to the allowed Redirect URLs. Remove any
  old production redirect that points to a preview or local host.
- [ ] Set the Invite user subject to `Set up your Kulka AI account` and copy
  `supabase/templates/invite.html` into the Invite user template.
- [ ] Set the Reset password subject to `Reset your Kulka AI password` and copy
  `supabase/templates/recovery.html` into the Reset password template.
- [ ] Confirm that custom SMTP can send from the approved Kulka sender and that its
  credentials remain in Supabase, not in the repository.
- [ ] Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and
  `npm run test:browser` on the delivery commit.

### After the approved deployment

- [ ] Confirm that the deployment serving `https://kulka.ai` matches the approved
  commit.
- [ ] Request `/pursuits` in a signed-out browser. Confirm that it redirects to
  `/login?next=%2Fpursuits` and that a signed-out API request returns 401.
- [ ] Invite each of the five approved users. Do not choose or send a password for
  another user.
- [ ] Open one real invite email. Confirm that its link reaches `/auth/continue`
  with `token_hash` and `type=invite`, and that opening the page does not consume
  the link before Continue is pressed.
- [ ] Finish password setup for the test account, reach the requested safe page,
  sign out, and sign in again with that password.
- [ ] Submit a rejected sign-in and confirm that it shows the generic credential
  error without revealing whether the address exists.
- [ ] Use Forgot password from a protected return path. Confirm that the real email
  reaches `/auth/continue` with `token_hash`, `type=recovery`, and the safe path.
- [ ] Finish the password reset, reach the safe path, sign out, and sign in with the
  new password.
- [ ] Confirm in a narrow and wide browser that sign-in, reset request, invite,
  recovery, password update, error, and pending states fit the viewport and remain
  usable by keyboard.
- [ ] Inspect the auth page and cookie-setting responses. Confirm the browser cache
  must not reuse them, each CDN header is `no-store`, and Referrer-Policy is
  `no-referrer`. Production should return `Cache-Control: private, no-store`.
- [ ] Sign in with an account outside the allowlist and confirm that a private API
  request returns 403 before any data query runs.

The invite and recovery email checks are release gates. The stock Supabase templates
do not support this scanner-resistant confirmation flow.

## Verification

- Unit tests cover accepted token types, return-path checks, site URL checks, and
  password validation.
- Browser tests cover recovery request, invite confirmation, password mismatch,
  password update, and the final safe redirect.
- Production proof requires one real password setup and sign-in by Matt.
