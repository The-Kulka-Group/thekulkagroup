import Link from "next/link";

import { Sep, Sheet } from "@/components/Sheet";
import { getDb } from "@/lib/db";
import { listJobs } from "@/lib/jobs/store";
import {
  actionItems,
  averagePace,
  lateJoiners,
  listMeetings,
  type MeetingDetail,
  type MeetingListItem,
  type MeetingListItem as Item,
  projectGlance,
  type ProjectGlance,
  readMeeting,
  talkShares,
  weekGlance,
} from "@/lib/meetings/read";
import type { MatchSource } from "@/lib/meetings/match";
import type { Brief } from "@/lib/meetings/brief";
import type { Sentiment } from "@/lib/meetings/store";

import { AutoSubmitSelect } from "../vision/AutoSubmitSelect";
import { JobPicker, type PickerJob } from "./JobPicker";
import { MeetingSync } from "./MeetingSync";
import "./meetings.css";

// LA-2280, LA-2287. Kulka's Fireflies meetings: the week at a glance, the
// meetings by day with their sentiment, and the open meeting with its
// summary and analytics.

export const dynamic = "force-dynamic";

const ZONE = "America/New_York";
const DAY = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: ZONE });
const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: ZONE });
const DAY_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE });
const AVATARS = ["var(--av-1)", "var(--av-2)", "var(--av-4)", "var(--av-5)", "var(--av-6)"];

function minutes(value: number | null) {
  return value === null ? null : `${Math.round(value)} min`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function SentimentBar({ sentiment, large = false }: { sentiment: Sentiment; large?: boolean }) {
  const { positive, neutral, negative } = sentiment;
  if (positive === null || negative === null) return <span className="mt-nosenti">No Sentiment Yet</span>;
  return (
    <span
      className={large ? "sb sb--lg" : "sb"}
      role="img"
      aria-label={`${positive}% positive, ${neutral ?? 0}% neutral, ${negative}% negative`}
    >
      <i className="sb-p" style={{ width: `${positive}%` }} />
      <i className="sb-n" style={{ width: `${neutral ?? 0}%` }} />
      <i className="sb-g" style={{ width: `${negative}%` }} />
    </span>
  );
}

function groupByDay(meetings: MeetingListItem[]) {
  const groups: { key: string; label: string; meetings: MeetingListItem[] }[] = [];
  for (const meeting of meetings) {
    const key = DAY_KEY.format(new Date(meeting.startedAt));
    const last = groups.at(-1);
    if (last?.key === key) last.meetings.push(meeting);
    else groups.push({ key, label: DAY.format(new Date(meeting.startedAt)), meetings: [meeting] });
  }
  return groups;
}

function chapterList(chapters: unknown[]): { title: string; at: string | null }[] {
  return chapters.flatMap((chapter) => {
    if (typeof chapter === "string") return [{ title: chapter, at: null }];
    if (!chapter || typeof chapter !== "object") return [];
    const one = chapter as Record<string, unknown>;
    const title = [one.title, one.name, one.chapter].find((v) => typeof v === "string") as string | undefined;
    if (!title) return [];
    const seconds = [one.start_time, one.start, one.startTime].find((v) => typeof v === "number") as number | undefined;
    const at =
      seconds === undefined ? null : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
    return [{ title, at }];
  });
}


const MATCHED_BY: Record<MatchSource, string> = {
  job_number: "Matched by job number in the title",
  series: "Matched by its recurring meeting series",
  job_name: "Matched by the project name in the title",
  manual: "Set by hand",
};

function jobLabel(job: { name: string; jobNumber: string | null }) {
  return job.jobNumber ? `${job.jobNumber} · ${job.name}` : job.name;
}

function JobChip({ meeting, large = false }: { meeting: Item; large?: boolean }) {
  const size = large ? " mt-job--lg" : "";
  if (meeting.job) return <span className={`mt-job${size}`}>{jobLabel(meeting.job)}</span>;
  if (meeting.matchSource === "manual") return <span className={`mt-job mt-job--internal${size}`}>Internal</span>;
  return <span className={`mt-job mt-job--none${size}`}>Unmatched</span>;
}

/** Sentiment across a job's recent meetings, oldest to newest: positive minus negative. */
function Spark({ meetings, falling }: { meetings: Item[]; falling: boolean }) {
  const scores = [...meetings]
    .reverse()
    .filter((one) => one.sentiment.positive !== null && one.sentiment.negative !== null)
    .map((one) => (one.sentiment.positive as number) - (one.sentiment.negative as number));
  if (scores.length < 2) return null;
  const w = 120;
  const h = 32;
  const lo = Math.min(...scores) - 4;
  const hi = Math.max(...scores) + 4;
  const points = scores.map((v, i) => [4 + (i * (w - 8)) / (scores.length - 1), h - 4 - ((v - lo) / (hi - lo)) * (h - 8)]);
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = points[points.length - 1];
  const color = falling ? "var(--stuck-bright)" : "var(--done-bright)";
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <polygon points={`4,${h - 2} ${line} ${lx.toFixed(1)},${h - 2}`} fill={color} opacity="0.12" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="3.5" fill={color} />
    </svg>
  );
}

function ProjectCard({ project, href }: { project: ProjectGlance; href: string }) {
  const falling = project.trend === "Falling";
  const { positive, negative } = project.latest.sentiment;
  return (
    <Link className={falling ? "pg-card pg-card--alert pg-card--link" : "pg-card pg-card--link"} href={href}>
      <span className="pg-name">
        {project.job.jobNumber ? <span className="mt-job">{project.job.jobNumber}</span> : null}
        {project.job.name}
      </span>
      <span className="pg-trend">
        <Spark meetings={project.meetings} falling={falling} />
        <span className="pg-trend-l">
          <b className={falling ? "num down" : project.trend === "Rising" ? "num up" : "num"}>{project.trend ?? "Too Few Meetings"}</b>
          <span>Sentiment trend</span>
        </span>
      </span>
      <span className="pg-latest">
        <span className="pg-k">Latest Meeting</span>
        <SentimentBar sentiment={project.latest.sentiment} large />
        {positive !== null && negative !== null ? (
          <span className="pg-pct">
            <b className="num pos">{positive}%</b> Positive · <b className="num neg">{negative}%</b> Negative
          </span>
        ) : null}
      </span>
      <span className="pg-stats">
        <span><b className="num">{project.meetings.length}</b>Recent Meetings</span>
        <span><b className="num">{project.latest.briefReady ? project.latestActions : "—"}</b>Action Items, Latest</span>
      </span>
    </Link>
  );
}

function KulkaBrief({ brief }: { brief: Brief }) {
  const empty = brief.decisions.length + brief.risks.length + brief.actionItems.length === 0;
  return (
    <section className="mt-brief" aria-labelledby="brief-h">
      <div className="mt-brief-head">
        <h3 id="brief-h" className="mt-h3">Kulka Brief</h3>
        <span className="mt-src">Written by Claude from the transcript</span>
      </div>
      {empty ? <p className="mt-note">The meeting recorded no decisions, risks or action items.</p> : null}
      {brief.decisions.length > 0 ? (
        <div className="mt-block">
          <h4 className="t-label">Decisions <span className="num">{brief.decisions.length}</span></h4>
          <ul className="mt-items">
            {brief.decisions.map((one, i) => <li key={i}><i className="mt-dot mt-dot--done" />{one.text}</li>)}
          </ul>
        </div>
      ) : null}
      {brief.risks.length > 0 ? (
        <div className="mt-block">
          <h4 className="t-label">Open Risks <span className="num">{brief.risks.length}</span></h4>
          <ul className="mt-items">
            {brief.risks.map((one, i) => <li key={i}><i className="mt-dot mt-dot--stuck" />{one.text}</li>)}
          </ul>
        </div>
      ) : null}
      {brief.actionItems.length > 0 ? (
        <div className="mt-block">
          <h4 className="t-label">Action Items <span className="num">{brief.actionItems.length}</span></h4>
          <table className="mt-table mt-table--due">
            <thead><tr><th>Owner</th><th>Action</th><th>Due</th></tr></thead>
            <tbody>
              {brief.actionItems.map((one, i) => (
                <tr key={i}>
                  <td className={one.owner ? undefined : "mt-none"}>{one.owner ?? "Not Stated"}</td>
                  <td>{one.action}</td>
                  <td className={one.due ? undefined : "mt-none"}>{one.due ?? "Not Stated"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-note">An owner or due date shows only when someone said it in the meeting.</p>
        </div>
      ) : null}
    </section>
  );
}

function MeetingView({ meeting, jobs }: { meeting: MeetingDetail; jobs: PickerJob[] }) {
  const late = lateJoiners(meeting.startedAt, meeting.attendance);
  const shares = talkShares(meeting.analytics);
  const pace = averagePace(meeting.analytics);
  const chapters = chapterList(meeting.chapters);
  const cats = meeting.analytics.categories ?? { questions: null, tasks: null, dates: null, metrics: null };
  const askers = (meeting.analytics.speakers ?? []).filter((one) => (one.questions ?? 0) > 0);
  const names = meeting.attendees.map((one) => one.name ?? one.email).filter((one): one is string => Boolean(one));
  const { positive, neutral, negative } = meeting.sentiment;
  const items = actionItems(meeting.summary.actionItems);
  return (
    <article className="mt-detail" aria-label={meeting.title}>
      <header className="mt-head">
        <div className="mt-head-top">
          <h2 className="mt-h">{meeting.title}</h2>
          {meeting.transcriptUrl ? (
            <a className="mt-btn" href={meeting.transcriptUrl} target="_blank" rel="noreferrer">
              Open Transcript in Fireflies
            </a>
          ) : null}
        </div>
        <p className="mt-when">
          {meeting.meetingType ? <span className="mt-type mt-type--lg">{meeting.meetingType}</span> : null}
          {DAY.format(new Date(meeting.startedAt))} · {TIME.format(new Date(meeting.startedAt))}
          {meeting.durationMinutes !== null ? <> · <span className="num">{minutes(meeting.durationMinutes)}</span></> : null}
        </p>
        <div className="mt-facts">
          <span className="t-label">Project</span>
          <JobChip meeting={meeting} large />
          {jobs.length > 0 ? <JobPicker meetingId={meeting.id} jobId={meeting.job?.id ?? null} internal={meeting.matchSource === "manual" && !meeting.job} jobs={jobs} /> : null}
          {meeting.matchSource ? <span className="mt-src">{MATCHED_BY[meeting.matchSource]}</span> : null}
        </div>
        {names.length > 0 ? (
          <div className="mt-people">
            {names.slice(0, 5).map((name, i) => (
              <span className="av" key={`${name}-${i}`} style={{ background: AVATARS[i % AVATARS.length] }} aria-hidden="true">
                {initials(name)}
              </span>
            ))}
            <span className="mt-more">
              {names.slice(0, 3).join(", ")}
              {names.length > 3 ? <> and <span className="num">{names.length - 3}</span> more</> : null}
            </span>
          </div>
        ) : null}
      </header>

      <section className="mg" aria-label="Meeting at a Glance">
        <div className="mg-senti">
          <span className="t-label">Sentiment</span>
          <SentimentBar sentiment={meeting.sentiment} large />
          {positive !== null && negative !== null ? (
            <span className="mg-pcts">
              <span><i className="lg lg-p" /><b className="num">{positive}%</b> Positive</span>
              <span><i className="lg lg-n" /><b className="num">{neutral ?? 0}%</b> Neutral</span>
              <span><i className="lg lg-g" /><b className="num">{negative}%</b> Negative</span>
            </span>
          ) : null}
        </div>
        <div className="mg-nums">
          <span><b className="num">{cats.questions ?? "—"}</b>Questions</span>
          <span><b className="num">{cats.tasks ?? "—"}</b>Tasks Raised</span>
          <span><b className="num">{cats.dates ?? "—"}</b>Dates Named</span>
          <span><b className={late.length > 0 ? "num warn" : "num"}>{late.length}</b>Joined Late</span>
        </div>
      </section>

      {meeting.brief ? <KulkaBrief brief={meeting.brief} /> : null}
      {!meeting.brief && meeting.briefError ? (
        <p className="mt-note mt-brief-error" role="status">The Kulka Brief could not be written: {meeting.briefError} The next sync tries again.</p>
      ) : null}

      <details className="mt-ff" open={!meeting.brief}>
        <summary>
          <span className="mt-h3">Fireflies Summary</span>
          <span className="mt-src">{meeting.brief ? "As Fireflies wrote it" : "From Fireflies, until the Kulka Brief is ready"}</span>
        </summary>
        {meeting.summary.overview ? (
          <p className="mt-overview">{meeting.summary.overview}</p>
        ) : (
          <p className="mt-note">Fireflies is still writing the summary. It appears here when it is ready.</p>
        )}
        {items.length > 0 ? (
          <div className="mt-block">
            <h4 className="t-label">Action Items <span className="num">{items.length}</span></h4>
            <table className="mt-table">
              <thead><tr><th>Owner</th><th>Action</th></tr></thead>
              <tbody>
                {items.map((one, i) => (
                  <tr key={i}>
                    <td className={one.owner ? undefined : "mt-none"}>{one.owner ?? "Not Stated"}</td>
                    <td>{one.item}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {meeting.topics.length > 0 ? (
          <div className="mt-tags">{meeting.topics.map((topic) => <span key={topic}>{topic}</span>)}</div>
        ) : null}
      </details>

      <section className="ma" aria-labelledby="analytics-h">
        <div className="mt-brief-head">
          <h3 id="analytics-h" className="mt-h3">Analytics</h3>
          <span className="mt-src">From Fireflies</span>
        </div>
        <div className="ma-grid">
          <div className="ma-talk">
            <span className="t-label">Talk Time</span>
            {shares.length > 0 ? (
              shares.map((one, i) => (
                <div className="tt" key={one.name}>
                  <span className="tt-n">{one.name}</span>
                  <span className="tt-bar"><i style={{ width: `${one.share}%`, background: AVATARS[i % AVATARS.length] }} /></span>
                  <span className="num">{Math.round(one.share)}%</span>
                </div>
              ))
            ) : (
              <p className="mt-note">Fireflies gave no talk time for this meeting.</p>
            )}
          </div>
          <div className="ma-side">
            <div className="ma-stat">
              <span className="t-label">Questions Asked</span>
              <span className="ma-v">
                <b className="num">{cats.questions ?? "—"}</b>
                {askers.length > 0 ? <span>{askers.map((one) => `${one.name ?? "Unknown"} ${one.questions}`).join(", ")}</span> : null}
              </span>
            </div>
            <div className="ma-stat">
              <span className="t-label">Pace</span>
              <span className="ma-v"><b className="num">{pace ?? "—"}</b><span>words per minute, average</span></span>
            </div>
            <div className="ma-stat">
              <span className="t-label">Attendance</span>
              <span className="ma-v">
                <b className="num">{meeting.attendance.length}</b>
                <span>
                  joined of <span className="num">{meeting.attendeeCount}</span> invited.
                  {late.map((one) => ` ${one.name} joined ${one.minutes} min late.`).join("")}
                </span>
              </span>
            </div>
          </div>
        </div>
        {chapters.length > 0 ? (
          <div className="ma-ch">
            <span className="t-label">Chapters</span>
            <span className="ma-chips">
              {chapters.map((one, i) => (
                <span key={i}>{one.at ? <span className="num">{one.at}</span> : null}{one.title}</span>
              ))}
            </span>
          </div>
        ) : null}
      </section>
    </article>
  );
}

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  const chosen = typeof params.m === "string" ? params.m : null;
  const job = typeof params.job === "string" ? params.job : "";
  const db = getDb();
  const [meetings, all, jobRows] = await Promise.all([
    listMeetings(db, search, 200, job),
    search || job ? listMeetings(db, "", 500) : Promise.resolve(null),
    listJobs(db),
  ]);
  const everything = all ?? meetings;
  const jobs: PickerJob[] = jobRows
    .filter((one) => one.status !== "archived")
    .map((one) => ({ id: one.id, label: jobLabel(one) }));
  const glanceProjects = projectGlance(everything);
  const openId = chosen ?? meetings[0]?.id ?? null;
  const open = openId ? await readMeeting(db, openId) : null;
  const glance = weekGlance(everything, new Date());
  const href = (id: string) => `/meetings?${new URLSearchParams({ ...(search ? { q: search } : {}), ...(job ? { job } : {}), m: id })}`;
  const jobHref = (id: string) => `/meetings?${new URLSearchParams({ job: id })}`;

  return (
    <Sheet
      number="M-100"
      title="Meetings"
      bodyClass="mt-wrap"
      meta={
        <>
          <span>From Fireflies, meetings@thekulkagroup.com</span>
          <Sep />
          <span><span className="num">{glance.count}</span> meetings this week</span>
        </>
      }
    >
      <MeetingSync />
      {everything.length === 0 ? (
        <div className="empty">
          <p>No meetings yet. Each Fireflies meeting appears here a few minutes after it ends.</p>
        </div>
      ) : (
        <>
          {glanceProjects.projects.length > 0 ? (
          <section className="pg" aria-label="Projects at a Glance">
            <div className="pg-head">
              <h2 className="t-label">Projects at a Glance</h2>
              <span className="pg-cap">The last 6 meetings for each project</span>
            </div>
            <div className="pg-cards">
              {glanceProjects.projects.map((project) => (
                <ProjectCard key={project.job.id} project={project} href={jobHref(project.job.id)} />
              ))}
              {glanceProjects.unmatched > 0 ? (
                <Link className="pg-card pg-card--link" href={jobHref("unmatched")}>
                  <span className="pg-name"><span className="mt-job mt-job--none">Unmatched</span>Not Yet on a Project</span>
                  <span className="pg-unm">
                    <b className="num">{glanceProjects.unmatched}</b> {glanceProjects.unmatched === 1 ? "meeting needs" : "meetings need"} a project. Pick one on the meeting and its series follows.
                  </span>
                </Link>
              ) : null}
            </div>
          </section>
          ) : (
          <section className="pg" aria-label="This Week at a Glance">
            <div className="pg-head">
              <h2 className="t-label">This Week at a Glance</h2>
              <span className="pg-cap">Projects at a Glance appears once a meeting matches an Autodesk project.</span>
            </div>
            <div className="pg-cards">
              <div className="pg-card">
                <span className="pg-k">Sentiment, All Meetings</span>
                {glance.sentiment ? (
                  <>
                    <SentimentBar sentiment={glance.sentiment} large />
                    <span className="pg-pct">
                      <b className="num pos">{glance.sentiment.positive}%</b> Positive · <b className="num neg">{glance.sentiment.negative}%</b> Negative
                    </span>
                  </>
                ) : (
                  <span className="mt-nosenti">No Sentiment Yet</span>
                )}
              </div>
              <div className="pg-card">
                <span className="pg-k">Most Negative Meeting</span>
                {glance.mostNegative ? (
                  <Link className="pg-link" href={href(glance.mostNegative.id)}>
                    <b>{glance.mostNegative.title}</b>
                    <span><b className="num neg">{glance.mostNegative.sentiment.negative}%</b> negative · {DAY.format(new Date(glance.mostNegative.startedAt))}</span>
                  </Link>
                ) : (
                  <span className="mt-nosenti">None This Week</span>
                )}
              </div>
              <div className="pg-card">
                <span className="pg-k">This Week</span>
                <span className="pg-stats pg-stats--flat">
                  <span><b className="num">{glance.count}</b>Meetings</span>
                  <span><b className="num">{glance.hours}</b>Hours</span>
                </span>
              </div>
            </div>
          </section>
          )}

          <div className="mt-body">
            <div className="mt-list">
              <form className="mt-filters mt-filters--two" action="/meetings">
                <label>
                  <span className="t-label">Project</span>
                  <AutoSubmitSelect className="input" name="job" defaultValue={job} aria-label="Project, applies when selected">
                    <option value="">All Projects</option>
                    {jobs.map((one) => <option key={one.id} value={one.id}>{one.label}</option>)}
                    <option value="unmatched">Unmatched</option>
                  </AutoSubmitSelect>
                </label>
                <label className="mt-search">
                  <span className="t-label">Search</span>
                  <input className="input" type="search" name="q" defaultValue={search} maxLength={200} placeholder="Title, Person or Topic" />
                </label>
              </form>
              <div className="mt-legend">
                <span className="t-label">Sentiment</span>
                <span><i className="lg lg-p" />Positive</span>
                <span><i className="lg lg-n" />Neutral</span>
                <span><i className="lg lg-g" />Negative</span>
              </div>
              {meetings.length === 0 ? <p className="mt-note mt-pad">No meetings match these filters.</p> : null}
              {groupByDay(meetings).map((group) => (
                <div className="mt-group" key={group.key}>
                  <h2 className="mt-day">{group.label}</h2>
                  {group.meetings.map((meeting) => (
                    <Link
                      key={meeting.id}
                      className={meeting.id === open?.id ? "mt-row is-open" : "mt-row"}
                      aria-current={meeting.id === open?.id ? "true" : undefined}
                      href={href(meeting.id)}
                      scroll={false}
                    >
                      <span className="mt-time num">{TIME.format(new Date(meeting.startedAt))}</span>
                      <span className="mt-main">
                        <span className="mt-title">{meeting.title}</span>
                        <span className="mt-sub">
                          <JobChip meeting={meeting} />
                          {meeting.meetingType ? <span className="mt-type">{meeting.meetingType}</span> : null}
                          {meeting.durationMinutes !== null ? <span className="num">{minutes(meeting.durationMinutes)}</span> : null}
                          <span><span className="num">{meeting.attendeeCount}</span> invited</span>
                        </span>
                      </span>
                      <span className="mt-right">
                        <span className={meeting.briefReady || meeting.summaryReady ? "mt-state mt-state--done" : "mt-state mt-state--working"}>
                          <i />{meeting.briefReady ? "Brief Ready" : meeting.summaryReady ? "Summary Ready" : "Summary Pending"}
                        </span>
                        <span className="mt-senti">
                          <SentimentBar sentiment={meeting.sentiment} />
                          {meeting.sentiment.positive !== null && meeting.sentiment.negative !== null ? (
                            <span className="mt-senti-n">
                              <span className="num pos">{meeting.sentiment.positive}%</span>
                              <span className="num neg">{meeting.sentiment.negative}%</span>
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
            {open ? <MeetingView meeting={open} jobs={jobs} /> : <div className="mt-detail"><p className="mt-note">Pick a meeting to open it.</p></div>}
          </div>
        </>
      )}
    </Sheet>
  );
}
