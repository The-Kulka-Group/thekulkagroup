# CLAUDE.md

## Agent skills

### Issue tracker

issues live in Linear team BLDG LABS (LA), project Kulka. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, label strings unchanged. See `docs/agents/triage-labels.md`.

### Deploy and migrations

A merge to `main` ships to production and applies new migrations by itself. A deploy that stops at the migration check is the guard working. See `docs/agents/deploy.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
