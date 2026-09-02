-- Evidence fixes for the internal underwriting review workflow.

alter table underwriting_case_assumptions
  alter column source_label drop not null,
  alter column source_label drop default,
  alter column source_date drop not null,
  alter column source_date drop default;

with changed_cases as (
  update underwriting_case_assumptions
  set source_label = null,
      source_date = null,
      review_state = 'working',
      value_changed_at = now(),
      updated_at = now()
  where source_label = 'User entered'
  returning case_id
)
update underwriting_cases cases
set case_revision = cases.case_revision + 1,
    updated_at = now()
where exists (
  select 1 from changed_cases changed where changed.case_id = cases.id
);

create function valid_underwriting_fact_metadata(metadata jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  fact_key text;
  fact jsonb;
  fact_field text;
begin
  if jsonb_typeof(metadata) <> 'object' then
    return false;
  end if;

  for fact_key, fact in select * from jsonb_each(metadata)
  loop
    if fact_key not in ('proposedUnits', 'averageUnitSquareFeet', 'grossBuildingSquareFeet')
      or jsonb_typeof(fact) <> 'object'
      or not (fact ? 'reviewState')
      or fact->>'reviewState' not in ('working', 'done')
      or not (fact ? 'lastChangedAt')
      or jsonb_typeof(fact->'lastChangedAt') <> 'string'
      or not (fact ? 'caseRevision')
      or jsonb_typeof(fact->'caseRevision') <> 'number'
      or (fact->>'caseRevision')::numeric <= 0
      or (fact->>'caseRevision')::numeric <> trunc((fact->>'caseRevision')::numeric)
      or (fact ? 'sourceLabel' and (
        jsonb_typeof(fact->'sourceLabel') <> 'string'
        or btrim(fact->>'sourceLabel') = ''
      ))
      or (fact ? 'sourceDate' and (
        jsonb_typeof(fact->'sourceDate') <> 'string'
        or fact->>'sourceDate' !~ '^\d{4}-\d{2}-\d{2}$'
      ))
    then
      return false;
    end if;
    for fact_field in select jsonb_object_keys(fact)
    loop
      if fact_field not in (
        'sourceLabel',
        'sourceDate',
        'reviewState',
        'lastChangedAt',
        'caseRevision'
      ) then
        return false;
      end if;
    end loop;
  end loop;

  return true;
end;
$$;

create function reconcile_underwriting_fact_metadata(
  existing_metadata jsonb,
  old_proposed_units numeric,
  old_average_unit_square_feet numeric,
  old_gross_building_square_feet numeric,
  new_proposed_units numeric,
  new_average_unit_square_feet numeric,
  new_gross_building_square_feet numeric,
  supplied_metadata jsonb,
  new_revision bigint,
  changed_at timestamptz
)
returns jsonb
language plpgsql
as $$
declare
  result jsonb := '{}'::jsonb;
  fact_key text;
  old_value numeric;
  new_value numeric;
  old_fact jsonb;
  supplied_fact jsonb;
  new_source_label text;
  new_source_date text;
  evidence_changed boolean;
  next_fact jsonb;
begin
  foreach fact_key in array array[
    'proposedUnits',
    'averageUnitSquareFeet',
    'grossBuildingSquareFeet'
  ]
  loop
    old_value := case fact_key
      when 'proposedUnits' then old_proposed_units
      when 'averageUnitSquareFeet' then old_average_unit_square_feet
      else old_gross_building_square_feet
    end;
    new_value := case fact_key
      when 'proposedUnits' then new_proposed_units
      when 'averageUnitSquareFeet' then new_average_unit_square_feet
      else new_gross_building_square_feet
    end;
    if new_value is null then
      continue;
    end if;

    old_fact := coalesce(existing_metadata->fact_key, '{}'::jsonb);
    supplied_fact := coalesce(supplied_metadata->fact_key, '{}'::jsonb);
    new_source_label := nullif(btrim(supplied_fact->>'sourceLabel'), '');
    new_source_date := nullif(supplied_fact->>'sourceDate', '');
    evidence_changed := old_value is distinct from new_value
      or nullif(btrim(old_fact->>'sourceLabel'), '') is distinct from new_source_label
      or nullif(old_fact->>'sourceDate', '') is distinct from new_source_date;

    next_fact := jsonb_strip_nulls(jsonb_build_object(
      'sourceLabel', new_source_label,
      'sourceDate', new_source_date,
      'reviewState', case
        when evidence_changed then 'working'
        else coalesce(supplied_fact->>'reviewState', old_fact->>'reviewState', 'working')
      end,
      'lastChangedAt', case
        when evidence_changed then to_jsonb(changed_at)
        else coalesce(old_fact->'lastChangedAt', to_jsonb(changed_at))
      end,
      'caseRevision', new_revision
    ));
    result := result || jsonb_build_object(fact_key, next_fact);
  end loop;

  return result;
end;
$$;

alter table underwriting_cases
  add column fact_metadata jsonb not null default '{}'::jsonb,
  add constraint underwriting_cases_fact_metadata_check
    check (valid_underwriting_fact_metadata(fact_metadata));
