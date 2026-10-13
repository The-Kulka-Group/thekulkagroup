# Deploy and migrations

Merging to `main` ships to production on Vercel. A schema change reaches the database by itself. Nobody runs `supabase db push` by hand.

## The two pieces

**The build guard.** `npm run build` runs `scripts/check-migrations-applied.mjs` first, on production builds only. If a file in `supabase/migrations/` is not applied to the production database, the build fails and Vercel keeps the previous deployment live. A failed deploy after a merge that adds a migration is this guard working. Production is not broken: the old build is still serving. Read the deployment's status before telling Matt otherwise.

**The workflow.** `.github/workflows/migrate-and-deploy.yml` runs on each push to `main` that touches `supabase/migrations/`, and by hand from the Actions tab. It applies the migrations, then calls a Vercel deploy hook so production rebuilds with the schema in place. A failed push skips the deploy step.

Vercel's own build for the same merge usually starts first and stops at the guard. The deploy hook then rebuilds. Two deployments for one merge is expected.

## Secrets (repository settings, Actions)

- `SUPABASE_ACCESS_TOKEN`: a personal access token scoped to Kulka's project only, with Project Settings, API Keys, Data API Config and Connection Pooling at Read, and Database and Migrations at Read-write. Everything else stays None, which keeps auth config, API key secrets and the JWT secret out of reach.
- `VERCEL_DEPLOY_HOOK_URL`: a deploy hook for the `main` branch.

No database password is stored anywhere. The CLI turns the token into a short-lived login role for each run.

## Why the workflow has no `supabase link`

`link` reads auth, storage and network settings, and the scoped token cannot see them. The workflow sets `SUPABASE_PROJECT_ID` instead. GitHub runners have no IPv6 and Supabase's direct host is IPv6 only, so the workflow also writes `supabase/.temp/pooler-url` with the IPv4 pooler address (no password in it), which the CLI falls back to. Remove either piece and the push fails with "IPv6 is not supported on your current network" or an authorization error.

## Changing the workflow

GitHub runs `workflow_dispatch` workflows from the branch you pick. Run a changed workflow from its branch before merging (`gh workflow run "Apply migrations and deploy" --ref <branch>`). With no migration pending, the push changes nothing and production rebuilds once. LA-2299 needed three fixes (#243 to #245) that this would have caught before merge.

## If a migration needs a human

Write the migration so it is safe to apply with no one watching. A destructive change (dropping a column or table with data) needs Matt's approval before the pull request merges, because merging applies it.
