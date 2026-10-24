import Link from "next/link";

import type { Level } from "@/lib/access/level";

// LA-3046. Small pieces the People and Access pages share.

export const LEVEL_LABEL: Record<Level, string> = { hidden: "Hidden", view: "View", edit: "Edit" };

export function Mark({ level, pin = false }: { level: Level | "mixed"; pin?: boolean }) {
  return <span className={`ac-mk ac-mk--${level}${pin ? " ac-pin" : ""}`} aria-hidden="true" />;
}

export function MarkKey({ mixed = false, pinLabel = "Exception" }: { mixed?: boolean; pinLabel?: string }) {
  return (
    <div className="ac-key">
      <span><Mark level="edit" />Edit</span>
      <span><Mark level="view" />View</span>
      <span><Mark level="hidden" />Hidden</span>
      {mixed ? <span><Mark level="mixed" />Mixed</span> : null}
      <span><Mark level="view" pin />{pinLabel}</span>
    </div>
  );
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? words[words.length - 1][0] : (words[0]?.[1] ?? "");
  return (first + last).toUpperCase();
}

/** One avatar color per person, stable for life, picked by hashing their id (DESIGN.md). */
export function avatarTone(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 6) + 1;
}

export function Avatar({ id, name, size = "" }: { id: string; name: string; size?: "" | "sm" | "lg" }) {
  return (
    <span className={`owner owner--${avatarTone(id)} ac-av${size ? ` ac-av--${size}` : ""}`} title={name} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

const TABS = [
  { href: "/settings/access", label: "People" },
  { href: "/settings/access/map", label: "Access Map" },
  { href: "/settings/access/changes", label: "Change Log" },
] as const;

export function AccessTabs({ current }: { current: (typeof TABS)[number]["label"] }) {
  return (
    <nav className="ac-tabs" aria-label="People and Access">
      {TABS.map((tab) => (
        <Link key={tab.href} className="ac-tab" href={tab.href} aria-current={tab.label === current ? "page" : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

export function ChevronRight({ className = "ac-chev" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The sign-in note every page leads with while KULKA_AUTH_OPEN=1. */
export function SignInOff({ people }: { people: number }) {
  return (
    <section className="ac-card ac-lead" aria-label="Sign-in">
      <span>
        <b>Sign-in is off.</b>{" "}
        {people === 0
          ? "Add people here, and they get their access the day it turns on."
          : `${people === 1 ? "This person gets" : `These ${people} people get`} their access the day it turns on.`}
      </span>
    </section>
  );
}
