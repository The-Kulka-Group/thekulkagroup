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

## Supabase production setup

The hosted Supabase project must use these settings before release:

1. Set Authentication, URL Configuration, Site URL to
   `https://kulka.ai`.
2. Add `https://kulka.ai/auth/continue*` to Redirect URLs.
3. Set the Invite user subject to `Set up your Kulka AI account` and copy
   `supabase/templates/invite.html` into the Invite user template.
4. Set the Reset password subject to `Reset your Kulka AI password` and copy
   `supabase/templates/recovery.html` into the Reset password template.
5. Send one new invitation to Matt. Open the email, confirm that its link reaches
   `/auth/continue` with `token_hash` and `type=invite`, press Continue, choose a
   password, sign out, and sign in with that password.
6. Use Forgot password from a protected return path. Confirm that the email reaches
   `/auth/continue` with `token_hash`, `type=recovery`, and the requested safe path.

The two live email checks are release gates. The default Supabase templates are not
compatible with this scanner-resistant confirmation flow.

## Verification

- Unit tests cover accepted token types, return-path checks, site URL checks, and
  password validation.
- Browser tests cover recovery request, invite confirmation, password mismatch,
  password update, and the final safe redirect.
- Production proof requires one real password setup and sign-in by Matt.
