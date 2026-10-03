# Comments, questions and assumption flags on the client budget page

Spec for LA-1480. It settles how an owner holding a published budget link attaches a
comment, a question or an assumption flag to anything on the page, how Kulka hears
about it, and how the thread reads afterward. Building it is out of scope. Matt approved
this spec on 2026-10-02, with the answers recorded under Decisions Matt Made. ADR 0007 records the two
decisions a later session would otherwise reopen.

Sources: the LA-1480 issue; LA-1309 "Stable element ids for Version 2"; LA-1479
(division drill-down frames, drawn in parallel); PRs 134 and 135; the code at
`app/b/[token]/`, `lib/rom/presentation.ts`, `lib/rom/published-budgets.ts`,
`lib/rom/published-pdf.ts`, `proxy.ts` and
`supabase/migrations/20260930010000_published_budgets.sql`.

## Problem

A client who opens `/b/<token>` today can read every line, fact, note and total, but
cannot say anything back on the page. A question about Structure Demolition becomes a
phone call or an email that names the line in its own words, and Kulka has to work out
which figure it means. Matt wants an obvious way for the owner to click any element and
leave a comment or a question, with every one coming to Kulka. At the BLDG Labs and
Kulka sync on 2026-10-02, Rob asked that clients can flag or correct an assumption in
place. Both requests need the same three things: a known commenter, a comment tied to
one element of one version, and a way for Kulka to find out.

Four constraints bind every decision below.

- Production runs with sign-in off (`KULKA_AUTH_OPEN=1`), and Matt deferred password
  sign-in. Nothing here proposes it.
- `kulka.ai` DNS and Resend SMTP are blocked on Kulka's COO. Nothing here depends on the
  app sending email.
- A published budget is frozen. Its snapshot, token and figures never change, and a
  comment must not change them either.
- No client-facing text names AI (LA-1309 copy guard), and an AI answer must reach a
  client only after a Kulka person releases it.

## What exists today

**The link.** `newToken()` in `lib/rom/published-budgets.ts` makes 16 random bytes as a
22-character base64url token. `/b/[token]/route.ts` checks the shape with `isToken`,
reads the row through `loadPublishedBudget`, and answers an unknown token with a plain
404. `proxy.ts` passes every `/b/` path through before any auth handling and stamps
`PUBLISHED_BUDGET_HEADERS` (`noindex`, `no-referrer`, `private, no-store`). The page is
the same for everyone who holds the link.

**Versions.** `publishBudget` locks the project row, takes the next version number,
inserts a row with a new token and a complete snapshot, and marks every earlier open
version as superseded. A trigger freezes the row. Only `revoked_at`, `superseded_by`
and `pdf_path` can be set, once each, and nothing deletes a row. A superseded page
shows its own figures under a band naming the newest open version. A withdrawn page
shows no figures.

**The PDF.** `lib/rom/published-pdf.ts` prints `renderBudgetPage(page, { print: true })`
once at publish with headless Chromium, stores it, and serves it at `/b/<token>.pdf`.
`withDestinations` in `render.ts` turns every `data-el` into a named PDF destination.
The PDF is as frozen as the snapshot.

**Database access.** The server reaches Postgres through `lib/db.ts` as the owner role.
Every table has row level security on with no policies, so the anon key reaches
nothing. `published_budgets` follows that rule.

**Notification paths without email.** None are wired. The repo has no Slack, Teams or
webhook sender, and no `process.env` key for one. Home (H-100) renders an empty slot
that reads "New activity will appear here when its source is connected." The Rail's nav
items already carry a `count` field, set to `undefined` everywhere. Vision has a
Discovery Inbox, but it lists public source records, not messages.

**Element ids.** `presentBudget` gives every addressable element a `data-el` id built
from snapshot keys, each once on the page. A figure that shows twice carries
`data-el-ref` pointing at the element that holds the id. The MN Test #4 fixture
(`test/fixtures/published-budget-mn4.json`) renders 146 ids, counted after PR 136
(LA-1483) took past jobs off the page.

| Kind | Key today | Count on MN Test #4 | Examples |
| -- | -- | -- | -- |
| `section` | section slug | 8 | `section:your-number`, `section:letter`, `section:the-project`, `section:where-the-money-is`, `section:design-and-engineering`, `section:from-trades-to-total`, `section:what-is-in`, `section:what-happens-next` |
| `record` | record field | 10 | `record:per-sf`, `record:per-unit`, `record:prepared-for`, `record:issued`, `record:gross-area`, `record:units`, `record:validity`, `record:project`, `record:version`, `record:prepared-by` |
| `fact` | answer key | 28 | `fact:projectType`, `fact:grossSquareFeet`, `fact:grossSquareFeet:figure`, `fact:framingSystem`, `fact:laborType`, `fact:demolition` |
| `element` | slug of the element's label | 2 | `element:demolition`, `element:elevator` |
| `line` | cost code | 38 | `line:1a`, `line:31a` |
| `unpriced` | cost code | 11 | `unpriced:28a`, `unpriced:31f`, `unpriced:26b` |
| `division` | MasterFormat division | 0 (the fixture has no full division map) | `division:26`, and `division:26:31a` for an item inside it |
| `total` | total key | 7 | `total:trades`, `total:trade-cost`, `total:kulka-contract`, `total:kulka-contract:low`, `total:kulka-contract:high`, `total:owner-direct`, `total:total-project-cost` |
| `markup` | ADR 0004 code | 3 | `markup:90-20-00`, `markup:90-30-00`, `markup:90-40-00` |
| `plan-line` | Allocated Resources line id | 0 (the fixture has no plan) | `plan-line:superintendent` |
| `criterion` | criterion code | 9 | `criterion:A-1`, `criterion:A-2`, `criterion:S-1`, `criterion:M-0`, `criterion:M-1`, `criterion:E-1`, `criterion:V-1` to `criterion:V-3` |
| `gate` | cost code or gate section | 11 | `gate:demolition`, `gate:elevator`, `gate:15a`, `gate:levels_below_grade` |
| `note` | note number, by position in `rom.assumptions` | 14 | `note:1` to `note:14` |
| `parameter` | slug of the engine parameter | 5 | `parameter:fee-rate`, `parameter:spread-low`, `parameter:insurance-rate` |

The letter's figures and the record line point at ids with `data-el-ref`:
`record:project`, `record:prepared-for`, `record:version`, `record:issued`,
`record:gross-area`, `record:prepared-by`, `total:kulka-contract` with its low and
high, and `total:total-project-cost`.

Three kinds do not meet LA-1309's own rule that keys come from the snapshot and never
from order or wording. `note:<n>` is a position in a list, and PR 136 already shifted
it: dropping one note renumbered every note after it. `element:<slug>` comes from the element's label, so renaming it renames the id.
`division:<d>:<code>` names a line by its grouping, so the same line has a different id
under By Scope and By Division. Within one version none of this matters, because the
snapshot is frozen. Across versions it does, and the orphan rule below handles it.

## Decision 1: who the commenter is

**Decision: a reader link per named person.** The estimator adds each person who should
comment (name, email, company) to the project on the saved budget's Publish panel and
copies that person's own link, `/b/r/<readerKey>`. The key is 16 random bytes, the same
form as a budget token. Opening it sets an `HttpOnly`, `Secure`, `SameSite=Lax` cookie on
path `/b`, then redirects with a 303 to the project's newest open version at
`/b/<token>`. The key leaves the address bar on that redirect. Every post carries that
reader. The plain version link `/b/<token>` stays as it is today: anyone who
holds it can read the budget, nobody can post from it, and it shows no comments.

A reader belongs to the project, not to a version, so one link works for the life of
the project. When Version 2 is published, the same reader link opens Version 2.

**Why.** A typed name and email prove nothing, and every way to prove an email or a
phone number needs a sender Kulka does not have yet. The estimator already sends the
budget link from their own mail, so sending a personal link costs nothing new. It also
names the person on every comment without the client ever typing who they are.

**What stops a forwarded link posting as someone else.** Nothing can fully stop it
without a second factor, and every second factor available (an email code, an SMS code,
a password) is either blocked or deferred. The spec limits the damage instead.

1. Forwarding the plain budget link shares no identity. A client who copies the address
   bar after opening their reader link copies the plain link, because the redirect
   dropped the key.
2. The composer always shows "Commenting As Dan Reyes, Fieldstone" with a "Not You?"
   control that clears the cookie. A colleague who opens a forwarded reader link sees at
   once that they are posting as someone else.
3. Each browser gets a random device cookie on first open, and every reader post
   records it. The internal inbox marks a post from a device that reader has never used
   before with "New Device for This Reader". It does not block the post.
4. Kulka can revoke a reader link from the Publish panel. A revoked key answers like an
   unknown one, its cookie stops working on the next request, and its earlier posts
   stay under its name.
5. Once Kulka's SMTP works, a later ticket can ask for an emailed code on a new device.
   The device id is already on every post, so that needs no schema change.

**Rejected.**
- Name and email typed into the composer, unchecked: anyone with the link can post as
  anyone.
- An emailed code or magic link: blocked on Kulka's SMTP.
- Client accounts with passwords: Matt deferred password sign-in.
- An SMS code: a new vendor, a cost, and phone numbers Kulka does not hold.
- Comments open on the plain link: a client hands that link to a lender or partner
  (LA-1309 story 10), who would then read and write the owner's questions.

## Decision 2: where comments live

**Decision: three new tables.** `budget_readers` holds the people. `budget_threads` holds
one comment, question or flag on one element of one version. `budget_messages` holds the
opening post and every reply in a thread. A thread points at `published_budgets.id` and
a `data-el` id string, never at a DOM node or a page position. At post time the server
builds the page model from the frozen snapshot, checks the element id is one of that
version's ids, and stores a small anchor (section, label, the text or figure as shown)
taken from the model, never from the browser.

**Why.** A published budget never changes, so a thread on Version 1's `line:1a` points
at the same figure forever. The anchor lets a later version, or a person reading the
inbox, see what the client was looking at without rendering the old page again.

### Proposed DDL

This is a proposal, not a migration file. Matt runs `supabase db push` for any merge
that carries a migration.

```sql
-- Composite keys so a thread's version, project and reader can never disagree.
create unique index published_budgets_id_project_idx on published_budgets (id, project_id);

create table budget_readers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete restrict,
  -- 16 random bytes as unpadded base64url, the same form as a budget token.
  reader_key text not null unique check (reader_key ~ '^[A-Za-z0-9_-]{22}$'),
  name text not null check (btrim(name) <> ''),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+$'),
  company text check (company is null or btrim(company) <> ''),
  created_at timestamptz not null default now(),
  created_by text not null check (btrim(created_by) <> ''),
  revoked_at timestamptz,
  unique (id, project_id)
);
create index budget_readers_project_idx on budget_readers (project_id);

create table budget_threads (
  id uuid primary key default gen_random_uuid(),
  published_budget_id uuid not null,
  project_id uuid not null,
  -- A data-el id from that version's page model, or page:general.
  element_id text not null check (element_id ~ '^[a-z][a-z-]*:[A-Za-z0-9_.:-]+$'),
  -- From the page model at post time: {section, label, text, figure}.
  anchor jsonb not null check (jsonb_typeof(anchor) = 'object'),
  kind text not null check (kind in ('comment', 'question', 'flag')),
  -- A flag's correction, in the owner's words: "What It Should Be".
  proposed text check (proposed is null or btrim(proposed) <> ''),
  -- Set when the reader asked Kulka to remove a flag's correction. proposed is cleared.
  proposed_removed_at timestamptz,
  opened_by uuid not null,
  opened_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  outcome text check (outcome in ('accepted', 'declined', 'withdrawn')),
  closed_at timestamptz,
  closed_by_reader uuid references budget_readers (id) on delete restrict,
  closed_by_staff text check (closed_by_staff is null or btrim(closed_by_staff) <> ''),
  -- An accepted flag, once a later version is published.
  addressed_in uuid references published_budgets (id) on delete restrict,

  foreign key (published_budget_id, project_id) references published_budgets (id, project_id) on delete restrict,
  foreign key (opened_by, project_id) references budget_readers (id, project_id) on delete restrict,
  check ((kind = 'flag') = (proposed is not null or proposed_removed_at is not null)),
  check (proposed is null or proposed_removed_at is null),
  check (outcome is null or kind = 'flag'),
  check ((status = 'closed') = (closed_at is not null)),
  check (status <> 'closed' or (closed_by_reader is null) <> (closed_by_staff is null)),
  check (kind <> 'flag' or status <> 'closed' or outcome is not null),
  check (outcome <> 'withdrawn' or closed_by_reader is not null),
  check (outcome not in ('accepted', 'declined') or closed_by_staff is not null),
  check (addressed_in is null or outcome = 'accepted')
);
create index budget_threads_version_idx on budget_threads (published_budget_id);
create index budget_threads_project_open_idx on budget_threads (project_id) where status <> 'closed';

create table budget_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references budget_threads (id) on delete restrict,
  author_kind text not null check (author_kind in ('reader', 'staff', 'ai')),
  reader_id uuid references budget_readers (id) on delete restrict,
  -- The name the client reads, and the account that wrote it
  -- (open-access@kulka.invalid while sign-in is off).
  staff_name text check (staff_name is null or btrim(staff_name) <> ''),
  staff_account text check (staff_account is null or btrim(staff_account) <> ''),
  -- Null only after the writer asked for removal (removed_at set).
  body text check (body is null or char_length(btrim(body)) between 1 and 4000),
  -- client: shown on the page. internal: Kulka only. draft: an AI reply no one has released.
  visibility text not null check (visibility in ('client', 'internal', 'draft')),
  -- AI replies only: model, prompt version, the element ids and snapshot paths it cites.
  provenance jsonb check (provenance is null or jsonb_typeof(provenance) = 'object'),
  released_at timestamptz,
  released_by text check (released_by is null or btrim(released_by) <> ''),
  hidden_at timestamptz,
  hidden_by text check (hidden_by is null or btrim(hidden_by) <> ''),
  -- Set when the writer asked Kulka to remove their words. The body is cleared.
  removed_at timestamptz,
  removed_by text check (removed_by is null or btrim(removed_by) <> ''),
  -- Reader posts only: the random device cookie.
  device_id text check (device_id is null or device_id ~ '^[A-Za-z0-9_-]{22}$'),
  created_at timestamptz not null default now(),

  check ((author_kind = 'reader') = (reader_id is not null)),
  check ((author_kind = 'reader') = (device_id is not null)),
  check (author_kind <> 'staff' or (staff_name is not null and staff_account is not null)),
  check ((author_kind = 'ai') = (provenance is not null)),
  check (author_kind <> 'reader' or visibility = 'client'),
  check (visibility <> 'draft' or author_kind = 'ai'),
  check ((released_at is null) = (released_by is null)),
  check (released_at is null or author_kind = 'ai'),
  check ((hidden_at is null) = (hidden_by is null)),
  check ((removed_at is null) = (removed_by is null)),
  check ((body is null) = (removed_at is not null))
);
create index budget_messages_thread_idx on budget_messages (thread_id, created_at);

alter table budget_readers enable row level security;
alter table budget_threads enable row level security;
alter table budget_messages enable row level security;
```

A trigger on `budget_messages`, in the style of `reject_published_budget_change`,
rejects every delete and every update except three, each allowed once: an AI draft moving
from `draft` to `client` with `released_at` and `released_by` set, `hidden_at` with
`hidden_by` set, and a removal that sets `removed_at` and `removed_by` and clears `body`
in the same update. A body is never edited in any other way. A trigger on `budget_threads` rejects deletes
and any change to `published_budget_id`, `project_id`, `element_id`, `anchor`, `kind`,
`opened_by` or `opened_at`, and allows `proposed` to change only once, to null, in the
same update that sets `proposed_removed_at`. Status may move only from open to answered,
from answered to open, and from either to closed. Closed is final, and `addressed_in`
is write-once. `budget_readers` rejects deletes and allows only `revoked_at`, once.

### RLS and the checks on every request

Row level security stays on with no policies, as on every table here. The browser never
reaches these tables. Every read and write goes through a server route as the owner
role.

New routes under `/b/`, which `proxy.ts` already lets through before auth:

| Route | What it does |
| -- | -- |
| `GET /b/r/<readerKey>` | Sets the reader and device cookies, then redirects to the newest open version. A malformed, unknown or revoked key gets the same plain 404 as an unknown token. |
| `POST /b/<token>/threads` | Opens a thread with its first message. |
| `POST /b/<token>/threads/<id>/messages` | Adds a reader reply. |
| `POST /b/<token>/threads/<id>/close` | Closes a comment or question, or withdraws a flag, by the reader who opened it. |

Every one of these checks the following, in order, and answers any failure with a plain
404 or 403 that does not say which check failed.

1. The token has a token's shape and names a row. A withdrawn version takes no posts.
   A superseded version takes no new threads, and its page shows threads read-only with
   a pointer to the current version.
2. The reader cookie names a reader whose `revoked_at` is null and whose `project_id`
   equals the version's `project_id`.
3. The `Origin` header equals the site's own origin (`linkOrigin`), and the request is
   JSON under 8 KB. This is the CSRF check, since the cookie rides on every same-site
   request.
4. For a new thread, the server builds `presentBudget` from the frozen snapshot and
   checks that `element_id` is one of its `data-el` ids or `page:general`. A
   `data-el-ref` target is posted as the id it points at. The anchor comes from the
   model, not the request body.
5. A flag is accepted only on an assumption element (see Decision 4).
6. For a reply or close, the thread belongs to this project and shows on this version's
   page under the carry rule below.
7. A reader may open 20 threads and post 60 messages in a day. Past that the route
   answers 429 and the composer says to call Kulka.

Rendering threads into the page follows the same reader check. The route renders the
comment layer into the HTML only when the reader cookie is valid for the project, so the
plain link carries no comment data at all. `PUBLISHED_BUDGET_HEADERS` already set
`private, no-store`, so a page with one reader's layer is never cached for another.
Every body is escaped with `render.ts`'s `esc` and printed as text. Links in a body are
not made clickable.

Internal routes for replying, closing, releasing, hiding and removing sit under `/api/rom/` and
follow the app's own auth. While `KULKA_AUTH_OPEN=1` is set, anyone who has the app's
address can read and answer client comments, and every staff write records
`open-access@kulka.invalid` as the account. That is the same exposure the rest of the
app has today.

### The version and orphan rule

A thread belongs to the version it was posted on. Inside that version its element can
never change or disappear, because the snapshot is frozen. The rule only matters when a
new version is published.

1. **A thread stays on its own version's page in every state.** Version 1's page always
   shows Version 1's threads, including closed ones.
2. **Open and answered threads carry forward.** The newest version's page also shows
   every thread on the project that is not closed. Each sits on the element with the
   same id in the new version and reads "From Version 1". When the anchor's text or
   figure differs from the new model's, it also reads "Changed Since Version 1" and
   shows both values. Replies to a carried thread stay on the original thread.
3. **Accepted flags carry once.** Publishing a new version sets `addressed_in` on every
   accepted flag on the project that has none, in the same transaction as the insert.
   The new version shows those flags closed, reading "Carried Into Version 2".
4. **A missing element orphans the thread.** When the id is absent from the new
   version, the thread does not move to a guessed element. It shows in a "From Earlier
   Versions" list at the end of What Happens Next, quoting its anchor. The internal inbox
   marks it "Element Not in Version 2" until Kulka replies and closes it.
5. **Position-keyed ids carry only on an exact match.** `note:<n>` carries only when
   the new model's text for that id equals the anchor's. Otherwise the thread orphans,
   so a comment on old note 4 never lands on a different new note 4.

### Id scheme for the LA-1479 drill-down

The drill-down adds divisions that open to sub-items, sub-items that open to their
assumptions with what is included and excluded, and a confidence level per division with
the owner items that would raise it. The scheme keeps every existing id and adds kinds
whose keys come from the data.

| Kind | Key | Example | Notes |
| -- | -- | -- | -- |
| `division` | MasterFormat division, two digits | `division:02` | Already in use. |
| `line` | cost code | `line:1a` | A sub-item is a canonical work item, so it keeps the one line id wherever it shows. `division:<d>:<code>` stops being an id and becomes `data-el-ref` to the line, so a thread survives a regrouping. |
| `assumption` | cost code and a stated key | `assumption:1a:structure-type` | The model must give each assumption a key from its data, such as an answer key or criterion code. |
| `inclusion` | cost code and a stated key | `inclusion:1a:foundations-removed` | What the sub-item includes. |
| `exclusion` | cost code and a stated key | `exclusion:1a:hazmat-abatement` | What the sub-item excludes. |
| `confidence` | division | `confidence:02` | The division's confidence level. |
| `raise` | division and the fact key that would raise it | `raise:02:structureType` | One owner item that would raise confidence. |
| `ve` | cost code and option key | `ve:1a:salvage-steel` | Reserved for VE options. Empty until Kulka supplies them. |
| `page` | `general` | `page:general` | A comment on the budget as a whole. Not on any element. |

Three rules apply to any new id.

1. A key comes from the snapshot's data (cost code, answer key, criterion code, ADR 0004
   code, a stated assumption key) and never from a label, a list position or the DOM.
2. One element has one id wherever it shows. A second appearance uses `data-el-ref`.
3. Where the model lacks a key, LA-1479's build adds one to the model rather than
   deriving it from a label.

The build should also move `element:<slug>` to the element's own key when the model
gains one. It keeps today's slug as the key for elements that exist now, so no Version 1
id changes.

## Decision 3: how Kulka hears about a new one

**Decision: a Client Comments list inside the app, plus a count on the Rail.** Home
(H-100) fills its empty activity slot with every thread that needs Kulka, newest first,
one plain sentence and one action each: "Dan Reyes at Fieldstone asked about Structure
Demolition on Version 2." with a "Reply" action. A thread needs Kulka when it is open
and its last client-visible message came from the reader. The saved budget gets a Client
Comments panel beside the Publish panel, with every thread on the project grouped by
version. The Rail's Conceptual Budget item shows the count of threads that need Kulka,
using the `count` field it already has.

A webhook push to a chat channel is a separate ticket. It is built behind an env var
(`KULKA_COMMENT_WEBHOOK_URL`) and stays off for now. When it is turned on, it posts to a
channel Kulka owns, not a BLDG Labs one, and reaches the version's Prepared By plus one
person Rob names. It sends the
same sentence and a link to the thread, never the body. It never sends to the client.

**Why.** The in-app list needs nothing from outside the repo, so it works the day it
merges, and no client's words go into a chat tool until Matt says so. The push goes to
Kulka's own channel because the feature exists to get Kulka talking to its client, and
the client relationship is Kulka's.

**The client's side.** The app cannot email the client either. A reader learns about a
reply by opening their link. The page's Comment control shows how many replies arrived
since that browser last opened it, kept in `localStorage` under try/catch. The estimator
can still tell the client by their own mail or phone.

**Rejected.**
- Email to Kulka staff: blocked on SMTP.
- Slack through BLDG Labs' own workspace by default: the only standing post rule covers
  `#software-updates` for deploys, and a client's words are not a deploy.
- A browser push notification: needs a service worker and a staff sign-in to know whom
  to notify.

## Decision 4: the three kinds

| Kind | Composer label | Where it can go | Who closes it | Client-visible states |
| -- | -- | -- | -- | -- |
| Comment | "Comment" | Any element, or `page:general` | The reader who wrote it, or Kulka | Open, Closed |
| Question | "Ask a Question" | Any element, or `page:general` | The reader who asked it, or Kulka | Open, Answered, Closed |
| Flag | "Flag This Assumption" | Assumption elements only | Kulka, as Accepted or Declined. The reader may withdraw their own open flag. | Open, Accepted, Declined, Withdrawn, Carried Into Version 2 |

**Assumption elements** are the ones a client can correct: `fact:*` (stated and
assumed), `criterion:*`, `note:<n>`, `gate:*`, and LA-1479's `assumption:*`,
`inclusion:*`, `exclusion:*` and `raise:*`. A line's figure, a total, a markup, a
parameter and a record take comments and questions, not flags. A client who thinks a
figure is wrong asks about it, and Kulka answers with the assumption behind it.

**A flag** has two fields: "What It Should Be", which is required and stored in
`proposed`, and "Why", which is optional and becomes the opening message. The panel shows
"Budget Says" from the anchor next to "Owner Says" from the flag.

**Status rules.**
- A new thread is open.
- A client-visible Kulka reply on an open question makes it answered.
- A reader reply on an answered thread makes it open again.
- Closed is final. A reader with more to say opens a new thread.
- Declining a flag needs a client-visible reply from Kulka in the same action, so the
  owner always learns why.

**Accepting a flag changes nothing in the budget.** Data enters through an approval gate
(controlled goalposts). The estimator changes the fact in Edit Project, reruns, and
publishes the next version, and the flag then reads "Carried Into Version 2". The flag
never writes a fact, an answer or a rate.

**On the page.** The header gains one control, "Comment". Pressing it turns on comment
mode: every addressable element shows a thin outline on hover or tap, and a tap opens
the composer anchored to that element with the kinds it allows. On a phone the composer
is a bottom sheet. Outside comment mode, an element with threads carries a small dot
with a count at its right edge, in the page's dot-plus-ink status style, and tapping it
opens the thread. Comment mode must not fight the ledger's own tap-to-open rows or the
scroll engine. Element outlines sit in an overlay layer, and `scrollcraft.js` stays
untouched. The look is decided in frames that Matt scores before the build (ticket 1).

**In the internal app.** The Client Comments panel lists threads by version with the
element's label, the reader, the kind, the state, and "New Device for This Reader" or
"Element Not in Version 2" when they apply. Each thread offers "Reply", "Internal Note"
(visible to Kulka only), "Close" and, on a flag, "Accept for Next Version" and
"Decline". A "Reply As" field defaults to the version's Prepared By and is remembered per
browser. It is the name the client reads, because sign-in is off and the account alone
would read `open-access`.

**Who at Kulka may resolve.** Anyone using the internal app, for now. The app has no
roles in v1 (CONTEXT.md, Admin permission), and with sign-in off there is no person to
check. When sign-in returns, a flag's Accept and Decline could move behind a permission.

## Decision 5: what the client sees afterward

**The thread.** Opening a dot shows the element's label and the anchor's text, then the
messages oldest first. Each shows the author's name and company (a reader) or name and
"The Kulka Group" (staff), and the date. A reader's email never shows on the page.
Internal notes, unreleased drafts and hidden messages never reach the page. A reply box
and the close or withdraw control sit at the foot of a thread the reader may act on.

**Who sees which threads.** Every reader of the project sees every thread on it, because
the people Kulka adds are the client's own team. Anyone holding only the plain link sees
no comments and no comment control.

**The resolved state.** A closed thread keeps its dot in Done green and folds to its
first line and its state: "Closed", "Accepted for Next Version",
"Declined", "Withdrawn" or "Carried Into Version 2". It never disappears from the
version it was posted on.

**When a client asks for their words to be removed.** Hiding stays the default for
taking a message off the page. When the writer asks Kulka to remove what they wrote,
Kulka uses Remove instead. It clears the message's body, or a flag's "What It Should
Be", and keeps the row, which then reads "Removed at the Writer's Request". The thread
still reads in order, and Kulka keeps none of the words it was asked to take out. Only
Kulka can remove, from the Client Comments panel.

**The PDF leaves comments out, always.** The stored PDF is rendered once at publish,
before any comment exists, and it is the copy a client hands a lender. The print render
(`?print=1`) never reads the reader cookie, and the page's print styles hide the comment
layer, so the browser's own Print leaves it out too.

**Rejected.**
- Printing threads into the stored PDF: it would mean printing a version a second time,
  which breaks the rule that the PDF is as frozen as the snapshot.
- Printing threads only from the browser: a client would get two different documents
  from one link depending on how they printed it. If Kulka later wants a record of the
  discussion, a separate Comment Log export can come from the tables.

## Decision 6: the hook for AI answers later

**Decision: an AI reply is a `budget_messages` row with `author_kind = 'ai'` and
`visibility = 'draft'`.** Its `provenance` names the model, the prompt version, and the
element ids and snapshot paths it cites. Kulka sees it in the thread as a draft and can
release it as it stands. Release moves it to `client` and sets `released_at` and
`released_by`. The page shows a released reply as Kulka's, signed by the person who
released it, with no AI wording, so the LA-1309 copy guard holds. To change a draft, the
staff member writes their own reply from it and leaves the draft unreleased. Bodies are
never edited.

The table already allows `ai`, `draft`, `provenance` and the release columns, so adding
AI drafts later needs no schema change. The call would sit after a thread or reader
message is inserted, as a server function that writes the draft row. Nothing builds it
now.

Two limits hold whatever the AI does later. A draft never changes a thread's status
until a person releases it. An AI never closes a thread and never accepts or declines a
flag.

**Rejected.**
- A separate `ai_replies` table: two places to read a thread from, and a second release
  path to keep in step.
- AI replies that post straight to the client: no Kulka person would have read them, and
  that breaks controlled goalposts.

## Build tickets

Each is one job, published as a child of LA-1480 in Planning. Matt approved this spec on
2026-10-02. None starts until Matt moves
it to Ready and sets its Agent field. Ticket 2 carries a migration, so its merge waits for Matt to run
`supabase db push`.

| # | Ticket | Blocked by | Model and effort |
| -- | -- | -- | -- |
| 1 (LA-1484) | Still frames for comment mode, the composer, a thread, the closed states and the From Earlier Versions list, at 1440 and 390, on MN Test #4. Draw on top of LA-1479's approved drill-down frames. Matt scores them, and the bar is 90. | LA-1479 frames approved | [Opus 5.5 - High] |
| 2 (LA-1485) | Migration for `budget_readers`, `budget_threads` and `budget_messages` with their triggers, plus a `lib/rom/budget-comments.ts` module for create, reply, close, release, hide and remove, with database tests for every check and trigger. | None | [Sonnet 5 - Medium] |
| 3 (LA-1486) | Reader links. "Add a Reader", "Copy Reader Link" and "Revoke Link" on the Publish panel, the `/b/r/<readerKey>` route, the reader and device cookies, and the "Not You?" clear. | 2 | [Sonnet 5 - High] |
| 4 (LA-1487) | Post routes under `/b/<token>/threads` with the seven checks, element validation against `presentBudget`, the server-side anchor, and the daily limits. | 2, 3 | [Sonnet 5 - High] |
| 5 (LA-1488) | The id scheme. Make `division:<d>:<code>` a `data-el-ref` to `line:<code>`, add a pure `addressableElements(page)` that returns each id's section, label and text for anchors, and add the LA-1479 kinds as the drill-down build adds their data. | LA-1479 build ticket | [Sonnet 5 - Medium] |
| 6 (LA-1489) | The comment layer on `/b/<token>`: the Comment control, comment mode, markers, the composer and threads, built from the ticket 1 frames, hidden in print, checked at 1440 and 390 with no sideways scroll. | 1, 4, 5 | [Opus 5.5 - Medium] |
| 7 (LA-1490) | Client Comments inside the app: the Home list, the saved budget's panel, the Rail count, Reply, Internal Note, Close, Remove, Accept for Next Version and Decline. | 2 | [Sonnet 5 - Medium] |
| 8 (LA-1491) | Carry and orphan at publish: `addressed_in` set inside `publishBudget`'s transaction, carried threads and "Changed Since" on the newest version, and the From Earlier Versions list. | 4, 7 | [Sonnet 5 - Medium] |
| 9 (LA-1492) | Webhook push for new threads behind `KULKA_COMMENT_WEBHOOK_URL`, off by default, to a Kulka-owned channel. | 7, Rob naming the person, and Matt turning it on | [Sonnet 5 - Low] |

AI drafts get their own spec later. This one only leaves the columns for them.

## Decisions Matt made

Matt answered the spec's open questions on 2026-10-02.

1. **Where a new comment is announced.** For now it shows only in the app's Client
   Comments list. The webhook push stays off. When it goes on, it posts to a channel
   Kulka owns and reaches the version's Prepared By plus one person Rob names.
2. **Who sees which threads.** Every reader on a project sees every thread. Private
   questions are out of v1. Adding them later takes one nullable column on
   `budget_threads`.
3. **Who decides a flag.** Anyone using the internal app, because with sign-in off the
   app cannot tell who is using it. The "Reply As" name records who acted. Accept and
   Decline move behind a permission when sign-in returns.
4. **Older versions.** A superseded version takes no new threads. Its page shows its
   threads read-only with a band pointing to the current version.
5. **Removal.** Hiding is the default. When the writer asks for removal, Kulka removes
   the words for good and the row reads "Removed at the Writer's Request".
6. **Adding readers.** The estimator adds readers on the Publish panel whenever they
   like, not as a step in every publish.

## Still open

1. Rob names the Kulka person who receives the comment push. Ticket 9 waits on this.
