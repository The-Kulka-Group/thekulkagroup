-- LA-1212: item 26 (Elevators, LA-1205) prices per stop by elevator type, and
-- item 26a (the bulkhead) prices per shaft, but both need Elevator Count and
-- neither ever gets one on a saved project. New budget's guided flow already
-- asks it (config/rom/tier1-flow.json's "elevator_count", intake field
-- "elevatorCount"), but the answer only ever lived in that run's `responses`
-- -- never on the project row -- so Run ROM on a saved project, and Edit
-- project, had no elevator count to read or set. This is the column LA-1199
-- added for Stories Above Grade, Unit Count, Building Count and ZIP; nothing
-- else in the schema changes.
--
-- Nullable, and the check is `>= 0` rather than `> 0` (unlike Stories Above
-- Grade): zero elevators is itself a legal answer, not an unanswered one --
-- packages/engine/src/elevator.ts's priceElevator already reads an Elevator
-- Count of exactly zero as "no elevator, no line", distinct from "not asked
-- yet" (null).
alter table projects
  add column elevator_count integer check (elevator_count >= 0);
