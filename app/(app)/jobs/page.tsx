import Link from "next/link";

import { Sep, Sheet } from "@/components/Sheet";
import { getDb } from "@/lib/db";
import {
  autodeskProjectUrl,
  JOB_STATUSES,
  jobStatusFilter,
  listJobSummaries,
  readJob,
  type JobDetail,
  type JobListItem,
} from "@/lib/jobs/read";
import { listMeetings, type MeetingListItem } from "@/lib/meetings/read";

import { AutoSubmitSelect } from "../vision/AutoSubmitSelect";
import { JobSync } from "./JobSync";
import "./jobs.css";

// LA-2858. Kulka's Autodesk jobs (LA-2283): a searchable list, and the picked
// job open beside it with its meetings (LA-2281). Matt picked this layout,
// mockup C, on 2026-10-19.

export const dynamic = "force-dynamic";

const ZONE = "America/New_York";
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: ZONE });
const SYNCED = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: ZONE });
// ACC dates are calendar days, so they are read as UTC to keep the day.
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const RECENT_MEETINGS = 8;

const STATUS: Record<string, { label: string; tone: string }> = {
  active: { label: "Active", tone: "done" },
  pending: { label: "Pending", tone: "working" },
  archived: { label: "Archived", tone: "idle" },
  suspended: { label: "Suspended", tone: "stuck" },
};

function Status({ status }: { status: string | null }) {
  const one = status ? STATUS[status] : undefined;
  return (
    <span className={`jb-state jb-state--${one?.tone ?? "idle"}`}>
      <i />
      {one?.label ?? "Status Not Set"}
    </span>
  );
}

function place(job: JobListItem) {
  return [job.city, job.stateOrProvince].filter(Boolean).join(", ");
}

function JobView({ job, meetings }: { job: JobDetail; meetings: MeetingListItem[] }) {
  const where = place(job);
  return (
    <article className="jb-detail" aria-label={job.name}>
      <header className="jb-head">
        <Status status={job.status} />
        <h2 className="jb-h">{job.name}</h2>
        <p className="jb-facts">
          <span className="num">{job.jobNumber ?? "No Job Number"}</span>
          {where ? <><Sep />{where}</> : null}
          {job.projectType ? <><Sep />{job.projectType}</> : null}
        </p>
        <div className="jb-actions">
          <a className="jb-btn jb-btn--out" href={autodeskProjectUrl(job.autodeskId)} target="_blank" rel="noreferrer">
            Open in Autodesk
          </a>
          <Link className="jb-btn" href={`/meetings?${new URLSearchParams({ job: job.id })}`}>
            View Meetings
          </Link>
        </div>
      </header>

      <section className="jb-stats" aria-label="Job at a Glance">
        <div className="jb-stat">
          <span className="t-label">Meetings</span>
          <b className="num">{job.meetingCount}</b>
        </div>
        <div className="jb-stat">
          <span className="t-label">Last Meeting</span>
          <b className={job.lastMeetingAt ? "num" : "jb-none"}>{job.lastMeetingAt ? DATE.format(new Date(job.lastMeetingAt)) : "None Yet"}</b>
        </div>
        <div className="jb-stat">
          <span className="t-label">Dates in Autodesk</span>
          <b className={job.startDate || job.endDate ? "num jb-dates" : "jb-none"}>
            {job.startDate || job.endDate
              ? `${job.startDate ? DAY.format(new Date(job.startDate)) : "Not Set"} to ${job.endDate ? DAY.format(new Date(job.endDate)) : "Not Set"}`
              : "Not Set"}
          </b>
        </div>
      </section>

      <section className="jb-meetings" aria-labelledby="jb-meetings-h">
        <h3 id="jb-meetings-h" className="jb-h3">Recent Meetings</h3>
        {meetings.length === 0 ? (
          <p className="jb-note">No meetings sit on this job yet. A meeting joins it when its title carries the job number or name, or when someone picks the job on the meeting.</p>
        ) : (
          <ul className="jb-mlist">
            {meetings.map((meeting) => (
              <li key={meeting.id}>
                <Link href={`/meetings?${new URLSearchParams({ job: job.id, m: meeting.id })}`}>
                  <span className="num jb-mdate">{DATE.format(new Date(meeting.startedAt))}</span>
                  <span className="jb-mtitle">{meeting.title}</span>
                  {meeting.meetingType ? <span className="jb-mtype">{meeting.meetingType}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="jb-note">Synced from Autodesk {SYNCED.format(new Date(job.syncedAt))}.</p>
    </article>
  );
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  const status = jobStatusFilter(params.status);
  const chosen = typeof params.id === "string" ? params.id : null;
  const db = getDb();
  const [jobs, everyJob] = await Promise.all([
    listJobSummaries(db, search, status),
    search || status ? listJobSummaries(db) : Promise.resolve(null),
  ]);
  const total = (everyJob ?? jobs).length;
  const openId = chosen ?? jobs[0]?.id ?? null;
  const [open, meetings] = openId
    ? await Promise.all([readJob(db, openId), listMeetings(db, "", RECENT_MEETINGS, openId)])
    : [null, []];
  const href = (id: string) =>
    `/jobs?${new URLSearchParams({ ...(search ? { q: search } : {}), ...(status ? { status } : {}), id })}`;

  return (
    <Sheet
      number="J-100"
      title="Jobs"
      bodyClass="jb-wrap"
      actions={<JobSync />}
      meta={
        <>
          <span>From Autodesk Construction Cloud</span>
          <Sep />
          <span><span className="num">{total}</span> jobs</span>
        </>
      }
    >
      {total === 0 ? (
        <div className="empty">
          <p>No jobs yet. Refresh From Autodesk reads Kulka&apos;s project list.</p>
        </div>
      ) : (
        <div className="jb-body">
          <div className="jb-list">
            <form className="jb-filters" action="/jobs">
              <label className="jb-search">
                <span className="t-label">Search</span>
                <input className="input" type="search" name="q" defaultValue={search} maxLength={200} placeholder="Job Name or Number" />
              </label>
              <label>
                <span className="t-label">Status</span>
                <AutoSubmitSelect className="input" name="status" defaultValue={status} aria-label="Status, applies when selected">
                  <option value="">All Statuses</option>
                  {JOB_STATUSES.map((one) => <option key={one} value={one}>{STATUS[one].label}</option>)}
                </AutoSubmitSelect>
              </label>
            </form>
            {jobs.length === 0 ? <p className="jb-note jb-pad">No jobs match these filters.</p> : null}
            {jobs.map((job) => (
              <Link
                key={job.id}
                className={job.id === open?.id ? "jb-row is-open" : "jb-row"}
                aria-current={job.id === open?.id ? "true" : undefined}
                href={href(job.id)}
                scroll={false}
              >
                <span className="jb-num num">{job.jobNumber ?? "No Number"}</span>
                <span className="jb-main">
                  <span className="jb-name">{job.name}</span>
                  <span className="jb-sub">
                    <Status status={job.status} />
                    {place(job) ? <span>{place(job)}</span> : null}
                  </span>
                </span>
                <span className="jb-count">
                  <b className="num">{job.meetingCount}</b>
                  {job.meetingCount === 1 ? "Meeting" : "Meetings"}
                </span>
              </Link>
            ))}
          </div>
          {open ? (
            <JobView job={open} meetings={meetings} />
          ) : (
            <div className="jb-detail"><p className="jb-note">Pick a job to open it.</p></div>
          )}
        </div>
      )}
    </Sheet>
  );
}
