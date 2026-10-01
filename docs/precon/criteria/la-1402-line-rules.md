# Line Rules: Which Resource Lines Switch On

LA-1402, under LA-1394. Code: `packages/engine/src/line-rules.ts`. A rule reads the answers
and the schedule and says on, off or unknown. Each line shows the words ("On: 5 stories").
An unknown line stays off and is left for the estimator. The estimator's own switch wins
until they reset it, and a line they switched off never comes back on by itself.

| Rule | Lines it switches | Rule | Source | For Matt to confirm |
| -- | -- | -- | -- | -- |
| Hoisting and Scaffolding | Hoists, Cranes & Scaffolding | On at 4 or more stories above grade. | Stories Above Grade from New Budget. No Kulka job sets the threshold. | `HOISTING_MIN_STORIES = 4` |
| Cold-Weather Protection | Cold Weather Protection | With a start date, on when construction meets December to March. With weeks alone, on when construction is longer than 244 days, otherwise unknown. | The schedule's construction weeks (proposed or entered). Calendar arithmetic. C-00379 priced this section. | `WINTER` (December to March). No screen asks for a start date yet. |
| Site Security and Controls | Security, Site Controls | On at 100,000 SF or more, or 52 weeks or more of construction. Off when both are known and both are below. | Gross area from New Budget and the schedule's weeks. No question asks for site size, so building area stands in. C-00379 (120,000 SF, 65 weeks) carries guards, cameras and fencing. | `SECURITY_MIN_GSF = 100000`, `SECURITY_MIN_CONSTRUCTION_WEEKS = 52` |

A new General Requirements plan opens with one line for each row in `RULE_SEED_ROWS`
(`app/(app)/rom/resource-plan-form.ts`): rows with a rate on the card. The list of rows is
also for Matt to confirm. They used to open at a quantity of one; since LA-1401 each opens
with its rule's quantity, one lump sum, or blank for the estimator
(`la-1401-line-quantities.md`).
