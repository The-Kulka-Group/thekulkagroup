# Kulka AI

Business development for The Kulka Group. Next.js App Router, TypeScript, and
the Daylight design language.

## Running it

```bash
npm install
npm run dev
```

Types and lint run from the repo root over the whole repo. Tests run from the
root over the workspace packages:

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
| `app/(app)/` | The framed routes: Home, Pursuits, a client record, a brief. |
| `app/login/` | The login cover, deliberately outside the app frame so it has no rail. |
| `components/` | Rail, Sheet, and the status marks. |
| `packages/engine/` | The deterministic ROM engine, `@kulka/engine`. Empty until the first ROM slice. |
| `lib/data.ts` | Example data. Invented names and dates only, no fabricated dollar figures. |
| `public/glyphs/` | The Phosphor state glyphs, vendored so nothing depends on a CDN at runtime. |
| `reference/` | The original static shells and the decision choosers. Design source of truth, not part of the build. |

The repo is an npm workspace. The Next app is the root package; everything under
`packages/` is a workspace beside it. Packages ship TypeScript source and Next
compiles them, so a package never needs its own build step.

## Two rules worth knowing before you edit

**No Tailwind, on purpose.** `daylight.css` carries the palette, the type scale,
and the component decisions that came out of two blind design reviews. Utility
classes would reintroduce the borrowed defaults the system exists to avoid. Add
to the stylesheet, and keep new values on the type and space scales.

**Icons live in two places only:** the rail, and state marks. Never on actions,
table rows, or body content. An icon always sits beside its word.
