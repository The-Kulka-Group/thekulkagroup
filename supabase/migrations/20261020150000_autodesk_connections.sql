-- LA-2894: Kulka signed in to Autodesk as one person (3-legged OAuth), so the
-- app can read the ACC areas that refuse an app-only token: Issues, RFIs,
-- Submittals, Forms, Photos and Cost. Kulka reads as one person, so the table
-- holds at most one row. Disconnect deletes it. Both tokens are AES-256-GCM
-- ciphertext under a key that lives only in the AUTODESK_TOKEN_KEY env var;
-- the database never sees a token in plain text. This migration adds no
-- records.
create table autodesk_connections (
  id uuid primary key default gen_random_uuid(),
  one_row boolean not null default true unique check (one_row),
  autodesk_user_id text not null check (length(trim(autodesk_user_id)) between 1 and 200),
  autodesk_user_name text check (length(autodesk_user_name) <= 300),
  -- As Autodesk granted them, space separated.
  scopes text not null,
  access_token_encrypted text not null,
  access_expires_at timestamptz not null,
  refresh_token_encrypted text not null,
  refreshed_at timestamptz,
  connected_at timestamptz not null default now()
);
alter table autodesk_connections enable row level security;
-- Browser roles receive no policy. The authorized server owns access.
