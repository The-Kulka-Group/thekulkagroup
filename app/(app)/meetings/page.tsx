import Link from "next/link";

import { Sep, Sheet } from "@/components/Sheet";
import { getDb } from "@/lib/db";
import {
  actionItems,
  averagePace,
  lateJoiners,
  listMeetings,
  type MeetingDetail,
  type MeetingListItem,
  readMeeting,
  talkShares,
  weekGlance,
} from "@/lib/meetings/read";
import type { Sentiment } from "@/lib/meetings/store";

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


function MeetingView({ meeting }: { meeting: MeetingDetail }) {
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

      <section className="mt-brief" aria-labelledby="summary-h">
        <div className="mt-brief-head">
          <h3 id="summary-h" className="mt-h3">Summary</h3>
          <span className="mt-src">From Fireflies. The Kulka Brief replaces this once it ships.</span>
        </div>
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
      </section>

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
  const db = getDb();
  const meetings = await listMeetings(db, search);
  const openId = chosen ?? meetings[0]?.id ?? null;
  const open = openId ? await readMeeting(db, openId) : null;
  const glance = weekGlance(meetings, new Date());
  const href = (id: string) => `/meetings?${new URLSearchParams({ ...(search ? { q: search } : {}), m: id })}`;

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
      {meetings.length === 0 && !search ? (
        <div className="empty">
          <p>No meetings yet. Each Fireflies meeting appears here a few minutes after it ends.</p>
        </div>
      ) : (
        <>
          <section className="pg" aria-label="This Week at a Glance">
            <div className="pg-head">
              <h2 className="t-label">This Week at a Glance</h2>
              <span className="pg-cap">Projects at a Glance replaces this once meetings match to Autodesk projects.</span>
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

          <div className="mt-body">
            <div className="mt-list">
              <form className="mt-filters" action="/meetings">
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
              {meetings.length === 0 ? <p className="mt-note mt-pad">No meetings match “{search}”.</p> : null}
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
                          {meeting.meetingType ? <span className="mt-type">{meeting.meetingType}</span> : null}
                          {meeting.durationMinutes !== null ? <span className="num">{minutes(meeting.durationMinutes)}</span> : null}
                          <span><span className="num">{meeting.attendeeCount}</span> invited</span>
                        </span>
                      </span>
                      <span className="mt-right">
                        <span className={meeting.summaryReady ? "mt-state mt-state--done" : "mt-state mt-state--working"}>
                          <i />{meeting.summaryReady ? "Summary Ready" : "Summary Pending"}
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
            {open ? <MeetingView meeting={open} /> : <div className="mt-detail"><p className="mt-note">Pick a meeting to open it.</p></div>}
          </div>
        </>
      )}
    </Sheet>
  );
}
