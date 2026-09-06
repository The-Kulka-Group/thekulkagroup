-- Private workspace workflow. Browser roles have no table policies.
create table vision_workflows (
 opportunity_id uuid primary key references vision_opportunities(id) on delete cascade,
 revision integer not null check (revision > 0),
 state jsonb not null check (jsonb_typeof(state) = 'object'),
 updated_at timestamptz not null default clock_timestamp()
);
create table vision_people (
 id uuid primary key,
 name text not null check (length(trim(name)) > 0),
 company text not null default '',
 role text not null default ''
);
alter table vision_workflows enable row level security;
alter table vision_people enable row level security;
