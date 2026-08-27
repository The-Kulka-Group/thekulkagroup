# @kulka/engine

The deterministic ROM engine. `CONTEXT.md` defines both terms: a ROM is a ranged
budget with a confidence flag on every line and a plain list of what was assumed,
and the engine is the code that produces one from answers and database values.

The package is empty apart from its entry point. The first real code arrives with
the walking skeleton (LA-12).

The app imports it as `@kulka/engine`. Next compiles the TypeScript source
directly, so there is no build step.

Run the tests from the repo root:

    npm test
