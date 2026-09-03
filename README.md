# Kulka AI

Business development for The Kulka Group. Next.js App Router, TypeScript, and
the Daylight design language.

## Running it

```bash
npm install
npm run dev
```

The ROM module needs a database. `DATABASE_URL` points the app at Kulka's
Supabase during local work. Vercel's Supabase integration provides the same
connection as `POSTGRES_URL`. Without either variable the site runs but `/rom`
cannot.

`ROM_PROJECT_ID` names an approved project already in that database. The page
stays disabled when it is absent. Production migrations contain no example
projects or cost values.

Schema changes are migrations in `supabase/migrations/`. Run `supabase link`
once against Kulka's project, then `supabase db push` applies them. Nothing
changes the schema by hand.

Every table has row level security on with no policies, which denies everyone
holding a browser key. Server-side code connects as the owner and is unaffected.

Types, lint, and tests all run from the repo root over the whole repo:

```bash
npm test
npm run typecheck
npm run lint
```

## How it is put together

| Path | What it is |
|---|---|
| `daylight.css` | The whole design system: tokens, then component classes. The token authority for DESIGN.md. |
| `DESIGN.md` | The design language and the dated record of every owner decision behind it. |
| `app/(app)/` | The framed routes. Unconnected modules show empty states instead of sample records. |
| `app/login/` | The login cover, deliberately outside the app frame so it has no rail. |
| `components/` | Rail, Sheet, and the status marks. |
| `packages/engine/` | The deterministic ROM engine, `@kulka/engine`. Answers plus a data snapshot in, ROM out, reading nothing else. |
| `supabase/migrations/` | The schema. Projects, benchmarks with provenance, and the run record every execution writes. |
| `app/api/rom/` | The one API the surfaces call. The site calls it today; the Claude wrapper calls the same route later. |
| `app/(app)/rom/` | The conceptual budget page. Runs a ROM and shows the ranged lines it came back with. |
| `lib/rom/` | The run: loads a snapshot, calls the engine, writes down what happened. |
| `test/database.ts` | An in-process Postgres built from the migrations, for the API tests. |
| `lib/data.ts` | Shared status labels used by the interface. |
| `public/glyphs/` | The Phosphor state glyphs, vendored so nothing depends on a CDN at runtime. |
| `reference/` | The original static shells and the decision choosers. Design source of truth, not part of the build. |

The repo is an npm workspace. The Next app is the root package; everything under
`packages/` is a workspace beside it. Packages ship TypeScript source and Next
compiles them, so a package never needs its own build step.

## Testing

The tests sit at the two seams LA-9 named.

The engine seam is pure. Answers and a data snapshot go in and a ROM comes out,
and nothing in between reads a network or a clock. That is what makes the same
inputs give the same ROM and a backtest repeatable.

The API seam runs the real route against a real Postgres built in process from
`supabase/migrations/`, then adds synthetic inputs inside that throwaway test
process. A passing test covers the schema that ships without putting invented
cost values in the production migration chain. It wants neither Docker nor a
network.

## Rules worth knowing before you edit

**No Tailwind, on purpose.** `daylight.css` carries the palette, the type scale,
and the component decisions that came out of two blind design reviews. Utility
classes would reintroduce the borrowed defaults the system exists to avoid. Add
to the stylesheet, and keep new values on the type and space scales.

**Production starts empty.** DESIGN.md bans invented records, counts, names, dates,
and financial values in the shipped app. Migrations create schema only. Tests add
synthetic inputs after the migrations run, inside an in-process database that is
discarded after each test.

**Icons live in two places only:** the rail, and state marks. Never on actions,
table rows, or body content. An icon always sits beside its word.
