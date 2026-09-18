# Cost data lives in a relational database, not a vector store

The question an estimator needs answered is what Kulka carried per square foot for a
given trade, on a building of a given type, in a given market, bought out in a given
year, and how many jobs stand behind that number. That is a filtered aggregate over
structured fields with a denominator, a date and a count. We store budgets as normalized
rows in Postgres and compute ROMs with deterministic code over them.

## Considered options

Retrieval-augmented generation over the budget files was the obvious first move and is
what will get suggested again. Devin spent about two hours trying it in a chat window in
August 2026 and got nothing usable. The reason is structural rather than a failure of
prompting: similarity search returns passages that read like the question. It cannot
divide by gross square feet, cannot weight Autodesk actuals above ProEst budgets, cannot
produce a range, cannot count the jobs behind a number, and cannot cite provenance as a
join. Every one of those is a requirement in `docs/precon/rom-spec.md`.

Semantic search keeps one job, proposing how a free-text line description maps to a
canonical work item during import. That is a pgvector column on the lines table, not a
separate system.
