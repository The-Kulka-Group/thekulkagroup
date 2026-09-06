-- Several public filings may support one opportunity. Keep each filing's identity.
alter table vision_discovery_candidates
  drop constraint vision_discovery_candidates_opportunity_id_key;
create index vision_discovery_candidates_opportunity_idx
  on vision_discovery_candidates(opportunity_id) where opportunity_id is not null;

-- Record only completed collection coverage. A failed check retains the last scope.
alter table vision_discovery_sources add column coverage jsonb;
