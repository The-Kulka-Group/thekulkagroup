import type { Db } from "@/lib/db";
import { recordRun, setConnectionStatus } from "@/lib/sources/runs";

import { decrypt, encrypt } from "./crypto";
import { AutodeskSignInError, refreshTokens, type AutodeskUser, type Tokens, type UserSettings } from "./oauth";

// LA-2894. The one Autodesk sign-in Kulka reads as. Tokens go in and out of
// the table sealed; only accessToken() below opens one, and it hands it
// straight to the caller that sends it to Autodesk.

const ACCESS = "autodesk-access-token";
const REFRESH = "autodesk-refresh-token";
// Refresh a little early, so a token never runs out partway through a readout.
const EARLY_MS = 2 * 60 * 1000;

/** What the page may show. It holds no token. */
export type ConnectionStatus = {
  userId: string;
  userName: string | null;
  scopes: string;
  connectedAt: string;
  accessExpiresAt: string;
};

type Row = {
  autodesk_user_id: string;
  autodesk_user_name: string | null;
  scopes: string;
  access_token_encrypted: string;
  access_expires_at: Date | string;
  refresh_token_encrypted: string;
  connected_at: Date | string;
};

const iso = (value: Date | string) => new Date(value).toISOString();

/** Replaces any earlier connection: Kulka reads as one person at a time. */
export async function saveConnection(db: Db, settings: UserSettings, user: AutodeskUser, tokens: Tokens) {
  await db.query(
    `insert into autodesk_connections
       (autodesk_user_id, autodesk_user_name, scopes, access_token_encrypted, access_expires_at, refresh_token_encrypted)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (one_row) do update set
       autodesk_user_id = excluded.autodesk_user_id,
       autodesk_user_name = excluded.autodesk_user_name,
       scopes = excluded.scopes,
       access_token_encrypted = excluded.access_token_encrypted,
       access_expires_at = excluded.access_expires_at,
       refresh_token_encrypted = excluded.refresh_token_encrypted,
       refreshed_at = null,
       connected_at = now()`,
    [
      user.id,
      user.name,
      tokens.scopes,
      encrypt(tokens.accessToken, ACCESS, settings.key),
      tokens.expiresAt.toISOString(),
      encrypt(tokens.refreshToken, REFRESH, settings.key),
    ],
  );  await setConnectionStatus(db, "autodesk_connection", "connected");
}

export async function readConnection(db: Db): Promise<ConnectionStatus | null> {
  const { rows } = await db.query<Row>(`select * from autodesk_connections limit 1`);
  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.autodesk_user_id,
    userName: row.autodesk_user_name,
    scopes: row.scopes,
    connectedAt: iso(row.connected_at),
    accessExpiresAt: iso(row.access_expires_at),
  };
}

/** Deletes the row and returns its refresh token, opened, for revoking at Autodesk. */
export async function deleteConnection(db: Db, settings: UserSettings): Promise<string | null> {
  const { rows } = await db.query<Pick<Row, "refresh_token_encrypted">>(
    `delete from autodesk_connections returning refresh_token_encrypted`,
  );
  await setConnectionStatus(db, "autodesk_connection", "missing");
  return rows[0] ? decrypt(rows[0].refresh_token_encrypted, REFRESH, settings.key) : null;
}

export class NotConnectedError extends Error {
  constructor(message = "Autodesk is not connected. Connect Autodesk on the Projects page.") {
    super(message);
    this.name = "NotConnectedError";
  }
}

/**
 * A live access token for the connected person, refreshed when it is within
 * two minutes of running out. The row is locked while refreshing: Autodesk
 * retires a refresh token once used, so two refreshes at once would lose the
 * connection.
 */
export async function accessToken(db: Db, settings: UserSettings, now = Date.now()): Promise<string> {
  // An expired sign-in deletes the row, so the transaction returns rather than
  // throws for it; a throw would roll the delete back.
  const result = await db.withTransaction(async (tx): Promise<{ token: string } | { expired: true }> => {
    const { rows } = await tx.query<Row>(`select * from autodesk_connections limit 1 for update`);
    const row = rows[0];
    if (!row) throw new NotConnectedError();
    if (new Date(row.access_expires_at).getTime() - EARLY_MS > now) {
      const token = decrypt(row.access_token_encrypted, ACCESS, settings.key);
      if (token) return { token };
    }
    const refresh = decrypt(row.refresh_token_encrypted, REFRESH, settings.key);
    if (!refresh) {
      throw new NotConnectedError("The saved Autodesk sign-in cannot be opened with the current key. Connect Autodesk again.");
    }
    let tokens: Tokens;
    try {
      tokens = await refreshTokens(settings, refresh, now);
    } catch (cause) {
      if (cause instanceof AutodeskSignInError && cause.expired) {
        // Only a new sign-in brings this back, so the dead row goes.
        await tx.query(`delete from autodesk_connections`);
        return { expired: true };
      }
      throw cause;
    }
    await tx.query(
      `update autodesk_connections set
         access_token_encrypted = $1, access_expires_at = $2, refresh_token_encrypted = $3, scopes = $4, refreshed_at = $5`,
      [
        encrypt(tokens.accessToken, ACCESS, settings.key),
        tokens.expiresAt.toISOString(),
        encrypt(tokens.refreshToken, REFRESH, settings.key),
        tokens.scopes,
        new Date(now).toISOString(),
      ],
    );
    return { token: tokens.accessToken };
  });
  if ("expired" in result) {
    await setConnectionStatus(db, "autodesk_connection", "expired");
    throw new NotConnectedError("The Autodesk sign-in has expired. Connect Autodesk again.");
  }
  return result.token;
}

/**
 * LA-2911. Autodesk retires a refresh token after 15 days unused, so the daily
 * cron asks for a live token once a day. After an hour idle that means a
 * refresh, and a fresh 15 days. Returns "connected" or the reason it is not;
 * it never throws for Autodesk's answer.
 */
export async function keepSignInAlive(db: Db, settings: UserSettings, now = Date.now()): Promise<string> {
  try {
    await accessToken(db, settings, now);
    return "connected";
  } catch (cause) {
    if (cause instanceof NotConnectedError || cause instanceof AutodeskSignInError) return cause.message;
    throw cause;
  }
}

/** keepSignInAlive, logged as one Autodesk Connection run (LA-3048). Any answer but "connected" is a failed run. */
export function keepSignInAliveLogged(db: Db, settings: UserSettings, now = Date.now()): Promise<string> {
  return recordRun(
    db,
    "autodesk_connection",
    "schedule",
    () => keepSignInAlive(db, settings, now),
    async (answer) => {
      if (answer !== "connected") return { outcome: "failed", error: answer };
      await setConnectionStatus(db, "autodesk_connection", "connected");
      return {};
    },
  );
}
