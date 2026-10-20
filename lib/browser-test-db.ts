import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";

import type { Db } from "@/lib/db";

declare global {
  var kulkaBrowserTestDatabase: Promise<PGlite> | undefined;
}

export function getBrowserTestDb(): Db {
  globalThis.kulkaBrowserTestDatabase ??= createBrowserTestDatabase();
  return {
    query: async <Row>(text: string, params: unknown[] = []) => {
      const database = await globalThis.kulkaBrowserTestDatabase!;
      const { rows } = await database.query<Row>(text, params as never[]);
      return { rows };
    },
    // PGlite is one in-process connection with its own internal exclusivity
    // lock, so its own `.transaction()` (real BEGIN/COMMIT/ROLLBACK) is
    // enough -- no client checkout needed the way lib/db.ts's pool-backed
    // implementation does.
    withTransaction: async <T>(fn: (tx: Db) => Promise<T>): Promise<T> => {
      const database = await globalThis.kulkaBrowserTestDatabase!;
      return database.transaction(async (pgliteTx) => {
        const tx: Db = {
          query: async <Row>(text: string, params: unknown[] = []) => {
            const { rows } = await pgliteTx.query<Row>(text, params as never[]);
            return { rows };
          },
          withTransaction: () => {
            throw new Error("Nested transactions are not supported.");
          },
        };
        return fn(tx);
      });
    },
  };
}

async function createBrowserTestDatabase() {
  const database = new PGlite();
  const migrations = join(process.cwd(), "supabase", "migrations");
  for (const file of readdirSync(migrations).sort()) {
    if (file.endsWith(".sql")) {
      await database.exec(readFileSync(join(migrations, file), "utf8"));
    }
  }
  await seedVisionMapFixtures(database);
  await seedRomFixtures(database);
  await seedMeetingFixtures(database);
  return database;
}

/**
 * The project id the ROM screens run against in browser-test mode. Set
 * `ROM_PROJECT_ID` to this to walk the ROM surface locally.
 */
export const BROWSER_TEST_ROM_PROJECT_ID = "30000000-0000-4000-8000-000000000001";

/**
 * Enough of a ROM to render every screen: one project, benchmarks across the
 * source kinds so the blend and the drill-down have something to show, one
 * approved judgment rule so a line carries an adjustment, and enough stated
 * classification for the block board to show all four levels, an element
 * reaching four divisions, and a block carved out of a level 1 lump.
 *
 * Every figure here is synthetic and says so in its own label. None of it is a
 * Kulka cost, and none of it may be read as one. Real benchmarks arrive only
 * through the ingestion gate, and a real classification is Kulka's to state.
 */
async function seedRomFixtures(database: PGlite) {
  await database.exec(`
    -- LA-1145: the lines below carry plain trade names so the screen reads
    -- like the real thing. Every figure is still fake, so the project names
    -- keep "Synthetic" as the marker on screen.
    -- LA-1199: stories_above_grade, unit_count, building_count and zip are
    -- synthetic figures, clearly fake, so the Facts step and Edit project
    -- have something plausible to show on the main browser-test project.
    -- LA-1212: elevator_count joins them the same way, on the same project,
    -- so the local ROM page has a count to price item 26 and 26a per stop
    -- with; the two past projects get null, the same as their other three
    -- LA-1199 fields, since neither was ever run through New budget's flow.
    insert into projects
      (id, name, project_type, construction_kind, gross_square_feet, percent_complete,
       stories_above_grade, unit_count, building_count, zip, elevator_count)
    values
      ('${BROWSER_TEST_ROM_PROJECT_ID}', 'Synthetic browser test project', 'multifamily', 'new', 100000, null,
       4, 120, 1, '55555', 2),
      ('30000000-0000-4000-8000-000000000002', 'Synthetic past project A', 'multifamily', 'new', 90000, 100,
       null, null, 1, null, null),
      ('30000000-0000-4000-8000-000000000003', 'Synthetic past project B', 'multifamily', 'new', 120000, 56,
       null, null, 1, null, null);

    insert into benchmarks
      (id, cost_code, label, unit, value, project_type, construction_kind, comparable_count,
       provenance_kind, provenance_export_label, provenance_recorded_by, provenance_recorded_at)
    values
      ('40000000-0000-4000-8000-000000000001', '03-300', 'Concrete', 'usd_per_gsf', 20,
       'multifamily', 'new', 1, 'actuals', 'Synthetic browser test export', 'Browser test fixture', '2026-09-01'),
      ('40000000-0000-4000-8000-000000000002', '03-300', 'Concrete', 'usd_per_gsf', 24,
       'multifamily', 'new', 1, 'proest_budget', 'Synthetic browser test export', 'Browser test fixture', '2026-09-02'),
      ('40000000-0000-4000-8000-000000000003', '09-900', 'Finishes', 'usd_per_gsf', 12,
       'multifamily', 'new', 1, 'proest_budget', 'Synthetic browser test export', 'Browser test fixture', '2026-09-03'),
      ('40000000-0000-4000-8000-000000000004', '31-200', 'Sitework', 'usd_per_gsf', 8,
       'multifamily', 'new', 0, 'llm_proposal', 'Synthetic browser test export', 'Browser test fixture', '2026-09-04'),
      ('40000000-0000-4000-8000-000000000005', '26-100', 'Electrical', 'usd_per_gsf', 25,
       'multifamily', 'new', 1, 'proest_budget', 'Synthetic browser test export', 'Browser test fixture', '2026-09-06'),
      ('40000000-0000-4000-8000-000000000006', '22-100', 'Plumbing rough-in', 'usd_per_gsf', 14,
       'multifamily', 'new', 1, 'proest_budget', 'Synthetic browser test export', 'Browser test fixture', '2026-09-06'),
      ('40000000-0000-4000-8000-000000000008', '26-200', 'Elevator wiring', 'usd_per_gsf', 0.72,
       'multifamily', 'new', 1, 'proest_budget', 'Synthetic browser test export', 'Browser test fixture', '2026-09-07'),
      ('40000000-0000-4000-8000-000000000009', '22-300', 'Elevator pit sump', 'usd_per_gsf', 0.26,
       'multifamily', 'new', 1, 'proest_budget', 'Synthetic browser test export', 'Browser test fixture', '2026-09-07'),
      ('40000000-0000-4000-8000-00000000000a', '28-300', 'Elevator fire alarm interface', 'usd_per_gsf', 0.17,
       'multifamily', 'new', 1, 'proest_budget', 'Synthetic browser test export', 'Browser test fixture', '2026-09-07'),
      ('40000000-0000-4000-8000-00000000000b', '22-400', 'Bathroom fixtures', 'usd_per_gsf', 4.4,
       'multifamily', 'new', 1, 'proest_budget', 'Synthetic browser test export', 'Browser test fixture', '2026-09-08'),
      ('40000000-0000-4000-8000-00000000000c', '22-500', 'Toilets, labor and material', 'usd_per_gsf', 0.35,
       'multifamily', 'new', 1, 'proest_budget', 'Synthetic browser test export', 'Browser test fixture', '2026-09-08');

    insert into benchmark_source_projects (benchmark_id, project_id)
    values
      ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002'),
      ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003'),
      ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000002'),
      ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000002'),
      ('40000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000002'),
      ('40000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000003'),
      ('40000000-0000-4000-8000-000000000009', '30000000-0000-4000-8000-000000000003'),
      ('40000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000003'),
      ('40000000-0000-4000-8000-00000000000b', '30000000-0000-4000-8000-000000000002'),
      ('40000000-0000-4000-8000-00000000000c', '30000000-0000-4000-8000-000000000002');

    update benchmarks set scope_side = 'site' where cost_code = '31-200';

    -- Stated classification for the block board. Every row here is a fixture
    -- statement, not Kulka's. '31-200' is deliberately left out so the board
    -- has an unclassified block to show. The three elevator breakouts sit
    -- inside level 1 lumps whose rates already cover them, so they are priced
    -- on the board and excluded from both totals.
    -- LA-1332: the Elevator element's priced lines are the migrated items 26
    -- (Elevators) and 26a (Elevator Bulkhead), with their stated rates,
    -- classification and gate. This fixture used to add its own 14-200 and
    -- 14-201 beside them, so a local budget priced the elevator twice.
    insert into block_classification
      (cost_code, detail_level, element, breakout_of_cost_code, buyout_package,
       stated_by, stated_on, reason)
    values
      ('03-300', 1, null, null, 'Concrete',
       'Browser test fixture', '2026-09-09',
       'A synthetic fixture so the board has a level 1 area block. Not a Kulka classification.'),
      ('09-900', 1, null, null, 'Drywall and Finishes',
       'Browser test fixture', '2026-09-09',
       'A synthetic fixture so the board has a second level 1 area block. Not a Kulka classification.'),
      ('26-100', 1, null, null, 'Electrical',
       'Browser test fixture', '2026-09-09',
       'A synthetic fixture standing in for the one electrical rate per square foot that a breakout is carved out of. Not a Kulka classification.'),
      ('22-100', 1, null, null, 'Plumbing',
       'Browser test fixture', '2026-09-09',
       'A synthetic fixture standing in for the plumbing rough-in lump that a breakout is carved out of. Not a Kulka classification.'),
      ('26-200', 2, 'Elevator', '26-100', 'Electrical',
       'Browser test fixture', '2026-09-09',
       'A synthetic fixture so the board has a block carved out of the electrical lump. Not a Kulka classification.'),
      ('22-300', 2, 'Elevator', '22-100', 'Plumbing',
       'Browser test fixture', '2026-09-09',
       'A synthetic fixture so the Elevator element reaches plumbing as a carve-out. Not a Kulka classification.'),
      ('28-300', 2, 'Elevator', '26-100', 'Electrical',
       'Browser test fixture', '2026-09-09',
       'A synthetic fixture so the Elevator element reaches a fourth division. Not a Kulka classification.'),
      ('22-400', 3, 'Bathroom', null, 'Plumbing',
       'Browser test fixture', '2026-09-09',
       'A synthetic fixture so the board has a level 3 block counted in fixture points. Not a Kulka classification.'),
      ('22-500', 4, null, null, 'Plumbing',
       'Browser test fixture', '2026-09-09',
       'A synthetic fixture so the board has a level 4 block split between material and labor. Not a Kulka classification.');

    insert into judgment_rules
      (id, cost_code, label, project_type, construction_kind, condition_fact, condition_value,
       adjustment_usd_per_gsf, stated_by, stated_on, reason, status, approved_by, approved_at)
    values
      ('50000000-0000-4000-8000-000000000001', '09-900', 'Synthetic browser test rule',
       'multifamily', 'new', 'amenity_scope', 'yes', 3,
       'Browser test fixture', '2026-09-05',
       'A synthetic fixture so the drill-down has a judgment row to show. Not a Kulka figure.',
       'approved', 'Browser test fixture', now());

    -- LA-1145: scope-gate rules for the synthetic lines above, so a scope
    -- answer takes a block out locally the way the shipped rules do on real
    -- item numbers (supabase/migrations/20260924140000_branch_gate_items.sql).
    -- Each mirrors a shipped rule's shape: the elevator gate closes the
    -- elevator's breakouts the way it closes item 26, site conditions closes
    -- sitework, and concrete closes only on two answers, the way item 34a
    -- reads levels below grade and site conditions together.
    insert into branch_gate_items
      (section, cost_code, closes_on, requires_all_sections, stated_by, stated_on, reason)
    values
      ('elevator', '26-200', array['no'], null, 'Browser test fixture', '2026-09-26',
       'A synthetic fixture so the elevator question takes its electrical breakout out. Not a Kulka rule.'),
      ('elevator', '22-300', array['no'], null, 'Browser test fixture', '2026-09-26',
       'A synthetic fixture so the elevator question takes its plumbing breakout out. Not a Kulka rule.'),
      ('elevator', '28-300', array['no'], null, 'Browser test fixture', '2026-09-26',
       'A synthetic fixture so the elevator question takes its fire alarm breakout out. Not a Kulka rule.'),
      ('site_conditions', '31-200', array['no'], null, 'Browser test fixture', '2026-09-26',
       'A synthetic fixture so the site conditions question takes the sitework block out. Not a Kulka rule.'),
      ('levels_below_grade', '03-300', array['no'], array['site_conditions'], 'Browser test fixture', '2026-09-26',
       'A synthetic fixture shaped like item 34a: concrete is off only when both questions are no. Not a Kulka rule.');

    -- LA-860: three derived assumptions so the Design Criteria cards show
    -- locally. Nothing called Jev for these: every value, step and reason is
    -- a fixture, not a code result and not a Kulka figure. M-1 rests on an
    -- assumed fact (the climate zone), so the dashed card, the orange dot and
    -- the count chip have something to show. This file only ever builds the
    -- in-process browser-test database; none of it reaches production.
    insert into derived_assumptions
      (project_id, code, label, value, method, inputs, steps, confidence, confidence_reason,
       cost_codes, derived_by, jev_confidence)
    values
      ('${BROWSER_TEST_ROM_PROJECT_ID}', 'E-1', 'Electrical Service Size',
       '{"kind":"spec","text":"800A, 3-Phase, 120/208V"}',
       'Synthetic fixture: demand load for 60 dwelling units',
       '[{"name":"Units","value":"60","basis":"stated"},{"name":"Gross Area","value":"100,000 SF","basis":"stated"}]',
       '[{"label":"Connected load, 60 units","result":"1,020 kVA"},{"label":"Demand factor, 60 units","result":"23%"},{"label":"Demand load","result":"235 kVA"},{"label":"At 208V, 3-phase","result":"652A"},{"label":"Service size, next standard frame","result":"800A"}]',
       'high', 'Synthetic fixture: every input is a stated fact.',
       array['26-100'], 'Browser test fixture', 0.92),
      ('${BROWSER_TEST_ROM_PROJECT_ID}', 'M-1', 'HVAC Cooling Capacity',
       '{"kind":"quantity","amount":250,"unit":"Tons"}',
       'Synthetic fixture: about 1 ton per 400 SF',
       '[{"name":"Gross Area","value":"100,000 SF","basis":"stated"},{"name":"Climate Zone","value":"4A","basis":"assumed"}]',
       '[{"label":"Gross area","result":"100,000 SF"},{"label":"Rule of thumb, Zone 4A","result":"400 SF/ton"},{"label":"Cooling capacity","result":"250 tons"}]',
       'low', 'Synthetic fixture: a rule of thumb, and the climate zone was assumed rather than stated.',
       array['22-100', '26-100'], 'Browser test fixture', 0.54),
      ('${BROWSER_TEST_ROM_PROJECT_ID}', 'V-1', 'Elevator Type',
       '{"kind":"spec","text":"Hydraulic, 2 Cars, 4 Stops"}',
       'Synthetic fixture: travel under 50 ft stays in hydraulic range',
       '[{"name":"Stories","value":"4","basis":"stated"},{"name":"Units","value":"60","basis":"stated"}]',
       '[{"label":"Stories","result":"4"},{"label":"Floor to floor, typical","result":"10.5 ft"},{"label":"Travel","result":"31.5 ft"},{"label":"Hydraulic limit, planning","result":"50 ft"}]',
       'high', 'Synthetic fixture: travel sits well inside the hydraulic range.',
       array['26'], 'Browser test fixture', 0.88);
  `);
}

/** Give browser tests one source and one area marker for each record type. */
async function seedVisionMapFixtures(database: PGlite) {
  await database.exec(`
    insert into vision_opportunities
      (id, name, town, county, address, latitude, longitude, source_title, source_url, source_date, notes)
    values
      ('10000000-0000-4000-8000-000000000001', 'Tracked exact location', 'Islip', 'Suffolk', '100 Main Street, Islip, NY', 40.7298, -73.2104, 'Browser test source', 'https://example.test/tracked-exact', '2026-09-10', 'Synthetic browser test record.'),
      ('10000000-0000-4000-8000-000000000002', 'Tracked approximate area', 'Smithtown', 'Suffolk', '', null, null, 'Browser test source', 'https://example.test/tracked-approximate', '2026-09-11', 'Synthetic browser test record.');

    insert into vision_discovery_sources (id, record_count)
    values ('nassau-applications', 2);

    insert into vision_discovery_candidates (id, source_id, external_id, snapshot)
    values
      (
        '20000000-0000-4000-8000-000000000001',
        'nassau-applications',
        'browser-test-exact',
        jsonb_build_object(
          'externalId', 'browser-test-exact',
          'name', 'Discovery exact location',
          'town', 'Uniondale',
          'county', 'Nassau',
          'address', '200 Charles Lindbergh Boulevard, Uniondale, NY',
          'latitude', 40.7004,
          'longitude', -73.5929,
          'sourceTitle', 'Browser test source',
          'sourceUrl', 'https://example.test/discovery-exact',
          'sourceDate', '2026-09-10',
          'sourceDateLabel', 'Filed',
          'details', jsonb_build_object('Record type', 'Planning application')
        )
      ),
      (
        '20000000-0000-4000-8000-000000000002',
        'nassau-applications',
        'browser-test-approximate',
        jsonb_build_object(
          'externalId', 'browser-test-approximate',
          'name', 'Discovery approximate area',
          'town', 'Hauppauge',
          'county', 'Suffolk',
          'address', '',
          'latitude', null,
          'longitude', null,
          'sourceTitle', 'Browser test source',
          'sourceUrl', 'https://example.test/discovery-approximate',
          'sourceDate', '2026-09-11',
          'sourceDateLabel', 'Filed',
          'details', jsonb_build_object('Record type', 'Planning application')
        )
      );
  `);
}

/**
 * LA-2280: two synthetic Fireflies meetings from the last few days, so the
 * Meetings page renders its list, sentiment and analytics locally. Every name
 * and figure is invented and says "Synthetic" or "Example" on screen.
 */
async function seedMeetingFixtures(database: PGlite) {
  await database.exec(`
    insert into meetings
      (fireflies_id, title, started_at, duration_minutes, organizer_email, attendees, summary, transcript_url,
       sentences, meeting_type, topics, chapters, attendance, analytics, positive_pct, neutral_pct, negative_pct,
       summary_status)
    values
      ('SYNTH-FF-1', 'Synthetic Job Weekly OAC', date_trunc('hour', now()) - interval '1 day', 58, 'meetings@example.com',
       '[{"name":"Example PM","email":"pm@example.com"},{"name":"Example Owner Rep","email":"owner@example.com"},{"name":"Example Architect","email":"arch@example.com"}]',
       '{"overview":"Synthetic overview: the team reviewed the schedule and two open RFIs.","actionItems":"**Example PM**\\nSend the revised lookahead (05:12)\\n**Example Architect**\\nAnswer the roof drain RFIs (27:40)","keywords":["schedule"],"bullets":null}',
       'https://app.fireflies.ai/view/SYNTH-FF-1', '[]', 'OAC Meeting', '["Schedule","Open RFIs"]',
       '[{"title":"Schedule","start_time":60},{"title":"Open RFIs","start_time":900}]',
       json_build_array(
         json_build_object('name','Example PM','joinedAt',to_char((date_trunc('hour', now()) - interval '1 day') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'leftAt',null),
         json_build_object('name','Example Architect','joinedAt',to_char((date_trunc('hour', now()) - interval '1 day' + interval '9 minutes') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'leftAt',null)
       )::jsonb,
       '{"sentiment":{"positive":30,"neutral":58,"negative":12},"categories":{"questions":4,"dates":2,"metrics":1,"tasks":3},"speakers":[{"name":"Example PM","seconds":2100,"share":61,"words":5200,"wordsPerMinute":150,"questions":1,"fillerWords":10,"longestMonologue":120,"monologues":8},{"name":"Example Owner Rep","seconds":1340,"share":39,"words":3100,"wordsPerMinute":140,"questions":3,"fillerWords":6,"longestMonologue":80,"monologues":5}]}',
       30, 58, 12, 'processed'),
      ('SYNTH-FF-2', 'Synthetic Job Owner Meeting', date_trunc('hour', now()) - interval '2 days', 62, 'meetings@example.com',
       '[{"name":"Example PM","email":"pm@example.com"},{"name":"Example Owner Rep","email":"owner@example.com"}]',
       '{"overview":"Synthetic overview: the owner raised concerns about the window delivery.","actionItems":"","keywords":[],"bullets":null}',
       'https://app.fireflies.ai/view/SYNTH-FF-2', '[]', 'Owner Meeting', '[]', '[]', '[]',
       '{"sentiment":{"positive":14,"neutral":52,"negative":34},"categories":{"questions":6,"dates":1,"metrics":0,"tasks":2},"speakers":[]}',
       14, 52, 34, 'processed');
    -- LA-2282: a synthetic Kulka Brief on the first meeting.
    update meetings set
      brief = '{"decisions":[{"text":"Synthetic decision: the lobby finish selection moved to November.","evidence":[1]}],"risks":[{"text":"Synthetic risk: two roof drain RFIs are open after ten days.","evidence":[3]}],"actionItems":[{"owner":"Example PM","action":"Send the revised lookahead","due":"Friday","evidence":[2]},{"owner":null,"action":"Confirm the elevator cab finish","due":null,"evidence":[4]}]}',
      brief_model = 'claude-opus-5-5', brief_written_at = now(), brief_input_tokens = 1200, brief_output_tokens = 300
    where fireflies_id = 'SYNTH-FF-1';
    -- LA-2281: two synthetic Autodesk jobs; both meetings above sit on the first,
    -- and an internal huddle stays unmatched.
    -- LA-2881: the first carries the address, counts and tools; the second has none.
    insert into jobs (id, autodesk_id, name, job_number, status, address_line1, city, state_or_province,
                      postal_code, latitude, longitude, member_count, company_count, sheet_count, autodesk_tools) values
      ('40000000-0000-4000-8000-000000000001', 'acc-synth-1', 'Synthetic Job', 'C09001', 'active',
       '100 Example Street', 'Example City', 'NY', '00001', 40.75, -73.25, 24, 6, 180, '{build,cost,docs,projectAdministration}'),
      ('40000000-0000-4000-8000-000000000002', 'acc-synth-2', 'Example Harbor', 'C09002', 'active',
       null, null, null, null, null, null, null, null, null, null);
    update meetings set job_id = '40000000-0000-4000-8000-000000000001', match_source = 'job_name'
     where fireflies_id in ('SYNTH-FF-1', 'SYNTH-FF-2');
    insert into meetings (fireflies_id, title, started_at, duration_minutes, attendees, summary, sentences)
    values ('SYNTH-FF-3', 'Weekly Ops Huddle', date_trunc('hour', now()) - interval '3 days', 20,
            '[{"name":"Example PM","email":"pm@example.com"}]', '{"overview":""}', '[]');
  `);
}
