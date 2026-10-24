"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  House, Users, Calculator, ChartLineUp, Binoculars, Briefcase, ChartBar, List, MapTrifold,
  MagnifyingGlass, VideoCamera, ShieldCheck, Database, type Icon,
} from "@phosphor-icons/react";
import { signOut } from "@/app/login/actions";
import { railGroups, type ToolIcon } from "@/lib/tools/catalog";

// Icons live in the rail and as state marks, nowhere else, and an icon always
// sits beside its word (DESIGN.md, Navigation).
const ICONS: Record<ToolIcon, Icon> = {
  users: Users,
  binoculars: Binoculars,
  briefcase: Briefcase,
  video: VideoCamera,
  calculator: Calculator,
  "chart-bar": ChartBar,
  "chart-line-up": ChartLineUp,
  map: MapTrifold,
  shield: ShieldCheck,
  database: Database,
};

// LA-3044: the rail renders from the tool catalog, one section per department.
const NAV_GROUPS = railGroups().map(({ department, tools }) => ({
  label: department.label,
  items: tools.map((tool) => ({ key: tool.key, href: tool.href, label: tool.label, count: undefined as number | undefined, Icon: ICONS[tool.icon] })),
}));


/**
 * Which rail item a path belongs to. An item owns every path under it (/rom
 * covers /rom/runs, /rom/backtest and /rom/parameters), and the longest match
 * wins. Engine Parameters moved into Conceptual Budget (LA-1321), so
 * /rom/parameters now lights Conceptual Budget.
 */
export function activeRailHref(path: string): string | null {
  if (path === "/") return "/";
  const items = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
  const matches = items.filter((href) => path === href || path.startsWith(`${href}/`));
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

/**
 * LA-1330: Jump to a Sheet filters the rail by a sheet's name or its section.
 * Home also answers to its spoken address, H-100. An empty query keeps every
 * item.
 */
export function railMatches(query: string, item: { label: string; group?: string; code?: string }): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.label, item.group ?? "", item.code ?? ""].some((text) => text.toLowerCase().includes(q));
}

/**
 * LA-1210: the rail on a phone. Below the design's mobile breakpoint the rail
 * itself is off-canvas by default; a compact top bar carries the product name
 * and a Menu button that opens it as a drawer, so page content starts under
 * the bar instead of under a 232px block. The drawer is a dismissible overlay:
 * Escape closes it and returns focus to the Menu button.
 *
 * LA-3041: above the phone breakpoint the rail always sits open beside the
 * page. It no longer rests at icon width or opens on hover (LA-1330).
 */
export function Rail({
  email,
  openAccess = false,
  needsKulka = 0,
  tools,
}: {
  email: string;
  openAccess?: boolean;
  /** LA-3047: the tool keys the viewer can open. A Hidden tool leaves the rail, and so does a department left with none. Omitted, every tool shows. */
  tools?: readonly string[];
  /** LA-1490: client comment threads waiting on Kulka. Conceptual Budget shows the count, and shows nothing at zero. */
  needsKulka?: number;
}) {
  const path = usePathname();
  const router = useRouter();
  const initials = email.slice(0, 2).toUpperCase();
  const activeHref = activeRailHref(path);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Picking a rail item on a phone should not leave the drawer open over the
  // page it just navigated to. Adjusted during render, the way React's own
  // docs recommend for state that must follow a prop, rather than in an
  // effect that would render open once and then closed a beat later.
  const [openedForPath, setOpenedForPath] = useState(path);
  if (path !== openedForPath) {
    setOpenedForPath(path);
    if (open) setOpen(false);
    if (query) setQuery("");
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => (!tools || tools.includes(item.key)) && railMatches(query, { ...item, group: group.label }),
    ),
  })).filter((group) => group.items.length > 0);
  const showHome = railMatches(query, { label: "Home", code: "H-100" });
  const firstMatch = showHome ? "/" : groups[0]?.items[0]?.href;

  return (
    <>
      <div className="phone-topbar">
        <span className="phone-topbar-name">
          Kulka<span className="logo-ai">AI</span>
        </span>
        <button
          ref={menuButtonRef}
          type="button"
          className="phone-menu-btn"
          aria-expanded={open}
          aria-controls="rail-nav"
          onClick={() => setOpen((was) => !was)}
        >
          <List size={18} />
          Menu
        </button>
      </div>
      {open ? (
        <button type="button" className="rail-backdrop" aria-hidden="true" tabIndex={-1} onClick={() => setOpen(false)} />
      ) : null}
      <nav
        id="rail-nav"
        ref={railRef}
        aria-label="Sheets"
        className={`rail${open ? " rail--open" : ""}`}
        onBlur={(event) => {
          // Pointer still on the rail: a click is landing on a filtered item
          // (Safari does not focus links on click), so leave the list alone.
          const rail = railRef.current;
          if (rail && !rail.contains(event.relatedTarget as Node | null) && !rail.matches(":hover")) setQuery("");
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || open) return;
          if (query) {
            setQuery("");
            return;
          }
          (document.activeElement as HTMLElement | null)?.blur();
        }}
      >
        <div className="rail-logo">
          <span className="rail-logo-lockup">
            <span className="rail-logo-word">Kulka</span>
            <span className="logo-ai">AI</span>
          </span>
        </div>
        <div className="rail-search">
          <span className="rail-search-icon" aria-hidden="true">
            <MagnifyingGlass size={16} />
          </span>
          <input
            ref={searchRef}
            className="input"
            type="search"
            placeholder="Jump to a Sheet"
            aria-label="Jump to a Sheet"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && firstMatch) {
                event.preventDefault();
                router.push(firstMatch);
                setQuery("");
                searchRef.current?.blur();
              }
            }}
          />
        </div>

        <div className="rail-nav">
          {showHome ? (
            <Link
              className="rail-item"
              href="/"
              aria-current={path === "/" ? "page" : undefined}
            >
              <House size={16} />
              <span>Home</span>
              <span className="count">H-100</span>
            </Link>
          ) : null}
          {groups.map((group) => (
            <div className="rail-group" key={group.label}>
              <div className="rail-section t-label">{group.label}</div>
              {group.items.map(({ href, label, count: fixed, Icon }) => {
                // The longest href that matches the path wins.
                const active = href === activeHref;
                const count = href === "/rom" ? needsKulka : fixed;
                return (
                  <Link
                    key={href}
                    className="rail-item"
                    href={href}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                    {count ? (
                      <span className="count" title={href === "/rom" ? "Client comments that need Kulka" : undefined}>
                        {count}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
          {!showHome && groups.length === 0 ? <p className="rail-empty">No sheet by that name.</p> : null}
        </div>

        {/* LA-1210: while KULKA_AUTH_OPEN=1 there is no signed-in account behind
            "OP" and this email, so the rail has no footer rather than an
            account and a Sign Out that don't mean anything yet. */}
        {!openAccess ? (
          <div className="rail-foot">
            <div className="rail-user">
              <span className="owner owner--1">{initials}</span>
              <span className="t-ui rail-user-email" title={email}>{email}</span>
              <form action={signOut}>
                <button className="btn btn--quiet" type="submit">Sign Out</button>
              </form>
            </div>
          </div>
        ) : null}
      </nav>
    </>
  );
}
