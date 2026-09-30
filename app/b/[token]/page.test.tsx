import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { newToken, publishBudget, revokePublishedBudget } from "@/lib/rom/published-budgets";
import { runRom } from "@/lib/rom/run";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import PublishedBudgetPage, { metadata } from "./page";

// LA-1417. /b/<token> renders a published budget from its snapshot alone.
// The engine is switched off and the runs table renamed away mid-test; the
// page must come out the same, which is the proof it reads neither.

const engine = vi.hoisted(() => ({ off: false }));

vi.mock("@kulka/engine", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const guarded: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(real)) {
    guarded[name] =
      typeof value === "function"
        ? function (this: unknown, ...args: unknown[]) {
            if (engine.off) throw new Error(`The engine is unavailable (${name}).`);
            return new.target
              ? Reflect.construct(value as new (...a: unknown[]) => unknown, args, new.target)
              : (value as (...a: unknown[]) => unknown).apply(this, args);
          }
        : value;
  }
  return guarded;
});

const testDb = vi.hoisted(() => ({ current: null as Db | null }));

vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getDb: () => {
    if (!testDb.current) throw new Error("No test database.");
    return testDb.current;
  },
}));

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  engine.off = false;
  db = await seededDatabase();
  testDb.current = db as Db;
});

afterEach(async () => {
  engine.off = false;
  testDb.current = null;
  await db.close();
});

const COPY = {
  preparedFor: "Harbor Point Partners (example)",
  preparedBy: "Devin (example)",
  validityDays: 90,
  coverSentence: null,
};

async function publish() {
  const { runId } = await runRom(db as Db, TEST_PROJECT_ID);
  return publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });
}

async function render(token: string): Promise<string> {
  const element = await PublishedBudgetPage({ params: Promise.resolve({ token }) });
  return renderToStaticMarkup(element);
}

/** next/navigation's notFound() throws an error whose digest names the 404. */
async function statusOf(token: string): Promise<number | "rendered"> {
  try {
    await render(token);
    return "rendered";
  } catch (error) {
    const digest = String((error as { digest?: unknown }).digest ?? "");
    if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;")) return Number(digest.split(";")[1]);
    throw error;
  }
}

describe("/b/<token>", () => {
  it("renders the same page with the engine and the runs table unavailable", async () => {
    const { token } = await publish();
    const before = await render(token);

    engine.off = true;
    // The switch is live: a new run cannot compute.
    await expect(runRom(db as Db, TEST_PROJECT_ID)).rejects.toThrow(/engine is unavailable/);
    await db.query(`alter table runs rename to runs_unavailable`);
    const after = await render(token);

    expect(after).toBe(before);
  });

  it("prints the snapshot's headline figures", async () => {
    const { token } = await publish();

    const html = await render(token);

    // The seeded test benchmark is $1/GSF on 1,000 GSF, with no markups.
    expect(html).toContain("Synthetic test project");
    expect(html).toContain("Conceptual Budget");
    expect(html).toContain("Version 1");
    expect(html).toContain("Harbor Point Partners (example)");
    expect(html).toContain("Devin (example)");
    expect(html).toContain("Figures valid 90 days from issue.");
    expect(html).toContain("Kulka Contract");
    expect(html).toContain("Total Project Cost");
    expect(html).toMatch(/\$1,000/);
    expect(html).toContain("per gross square foot");
  });

  it("prints no figures and names whom to ask when the link is withdrawn", async () => {
    const published = await publish();
    await revokePublishedBudget(db as Db, published.id);

    const html = await render(published.token);

    expect(html).toContain("This budget was withdrawn");
    expect(html).toContain("Devin (example)");
    expect(html).not.toMatch(/\$\d/);
    expect(html).not.toContain("Synthetic test project");
  });

  it("keeps an old version's figures under a band that links the newer one", async () => {
    const first = await publish();
    const second = await publish();

    const html = await render(first.token);

    expect(html).toContain("Version 1");
    expect(html).toMatch(/Version 2 replaces this budget/);
    expect(html).toContain(`href="/b/${second.token}"`);
    expect(html).toMatch(/\$1,000/);
  });

  it("answers an unknown or malformed token with a plain 404", async () => {
    expect(await statusOf(newToken())).toBe(404);
    expect(await statusOf("nope")).toBe(404);
  });

  it("asks search engines not to index it and sends no referrer", async () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.referrer).toBe("no-referrer");
  });
});
