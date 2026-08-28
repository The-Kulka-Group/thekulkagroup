import { describe, expect, it } from "vitest";

import { vercelPostgresConnectionString } from "./db";

describe("vercelPostgresConnectionString", () => {
  it("uses PostgreSQL-compatible TLS rules for the Supabase pooler", () => {
    const result = vercelPostgresConnectionString(
      "postgresql://postgres.example:secret@pooler.supabase.com:6543/postgres?sslmode=require",
    );

    const parsed = new URL(result!);
    expect(parsed.searchParams.get("sslmode")).toBe("require");
    expect(parsed.searchParams.get("uselibpqcompat")).toBe("true");
  });

  it("requires encryption when the integration URL omits an SSL mode", () => {
    const result = vercelPostgresConnectionString(
      "postgresql://postgres.example:secret@pooler.supabase.com:6543/postgres",
    );

    const parsed = new URL(result!);
    expect(parsed.searchParams.get("sslmode")).toBe("require");
    expect(parsed.searchParams.get("uselibpqcompat")).toBe("true");
  });
});
