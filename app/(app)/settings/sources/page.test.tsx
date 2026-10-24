import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { seededDatabase } from "@/test/database";

// LA-3050. The Data Sources page reads every row in data_sources with its
// health, and each source's page reads its own run log, against a seeded
// Postgres built from the migrations.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const { default: DataSources } = await import("./page");
const { default: SourceRuns } = await import("./[key]/page");

const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

beforeAll(async () => {
  db = await seededDatabase();
}, 60_000);
beforeEach(async () => {
  await db.query(`delete from source_runs`);
  await db.query(`update data_sources set connection_status = 'connected' where key = 'autodesk_connection'`);
});
afterAll(async () => db?.close());

const run = (key: string, outcome: string, finishedAgo: number, error: string | null = null, trigger = "schedule") =>
  db.query(
    `insert into source_runs (source_key, trigger, started_at, finished_at, outcome, rows_added, rows_changed, error)
     values ($1, $5, $2::timestamptz - interval '12 seconds', $2, $3, 0, 2, $4)`,
    [key, ago(finishedAgo), outcome, error, trigger],
  );

const cards = (html: string) =>
  [...html.matchAll(/<article class="ds-card" aria-label="([^"]+)">.*?<span class="ds-health ds-tone--(\w+)"><i><\/i>([^<]+)<\/span>.*?<b class="num[^"]*">([^<]+)<\/b>/g)].map((m) => [
    m[1],
    m[3],
    m[4],
  ]);

describe("Data Sources", () => {
  it("shows one card per source with each health state", async () => {
    await run("autodesk_projects", "ok", 3 * HOUR);
    await run("autodesk_connection", "ok", 3 * HOUR);
    await run("fireflies_meetings", "ok", 8 * 24 * HOUR);
    await run("proest_imports", "failed", HOUR, "The file had no cost codes.");
    await db.query(`update data_sources set connection_status = 'expired' where key = 'autodesk_connection'`);

    const html = renderToStaticMarkup(await DataSources());
    expect(cards(html)).toEqual([
      ["Autodesk Connection", "Not Connected", "3h"],
      ["Autodesk Projects", "Current", "3h"],
      ["Fireflies Meetings", "Late", "8d"],
      ["ProEst Imports", "Failing", "By Hand"],
      ["Vision Discovery", "Off", "Off"],
    ]);
    expect(html).toContain("<b>Autodesk Connection is not connected.</b> 2 more sources need a look too.");
    expect(html).toContain('href="/api/autodesk/connect"');
    expect(html).toContain("Daily at");
    expect(html).not.toContain("ds-strip");
  });

  it("says every source that is on is current", async () => {
    await run("autodesk_projects", "ok", HOUR);
    await run("autodesk_connection", "ok", HOUR);
    await run("fireflies_meetings", "ok", HOUR);
    const html = renderToStaticMarkup(await DataSources());
    expect(html).toContain("<b>Vision Discovery is off.</b> Every other source is current.");
  });
});

describe("Source run log", () => {
  it("lists each run with its length, outcome, rows, trigger and error", async () => {
    await run("autodesk_projects", "ok", 2 * HOUR, null, "button");
    await run("autodesk_projects", "failed", 26 * HOUR, "Autodesk said too many requests.");
    const html = renderToStaticMarkup(await SourceRuns({ params: Promise.resolve({ key: "autodesk_projects" }) }));
    expect(html).toContain("Autodesk Projects");
    expect(html).toContain("Refresh Button");
    expect(html).toContain("0 added, 2 changed");
    expect(html).toContain("12s");
    expect(html).toContain(">Failed<");
    expect(html).toContain('<p class="ds-error">Autodesk said too many requests.</p>');
    expect(html.match(/ds-day ds-day--/g)).toHaveLength(14);
  });

  it("says when a source has no runs, and turns away an unknown source", async () => {
    const html = renderToStaticMarkup(await SourceRuns({ params: Promise.resolve({ key: "proest_imports" }) }));
    expect(html).toContain("No runs logged yet.");
    await expect(SourceRuns({ params: Promise.resolve({ key: "nope" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
