"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  House, Users, Calculator, ChartLineUp, Binoculars, Briefcase, ChartBar, List, MapTrifold,
  MagnifyingGlass, SidebarSimple, VideoCamera,
} from "@phosphor-icons/react";
import { signOut } from "@/app/login/actions";
import { RAIL_COOKIE } from "@/components/rail-cookie";

// Icons live in the rail and as state marks, nowhere else, and an icon always
// sits beside its word (DESIGN.md, Navigation).
//
const NAV_GROUPS = [
  {
    label: "Sales and Marketing",
    items: [{ href: "/clients", label: "Clients", count: undefined, Icon: Users }],
  },
  {
    label: "Business Development",
    items: [
      { href: "/vision", label: "Vision", count: undefined, Icon: Binoculars },
    ],
  },
  {
    // LA-2280: Kulka's Fireflies meetings, matched to Autodesk projects (LA-2281).
    // LA-2858: the Autodesk projects themselves, named Projects by Matt.
    label: "Projects",
    items: [
      { href: "/projects", label: "Projects", count: undefined, Icon: Briefcase },
      { href: "/meetings", label: "Meetings", count: undefined, Icon: VideoCamera },
    ],
  },
  {
    label: "Pre-Construction",
    items: [
      { href: "/rom", label: "Conceptual Budget", count: undefined, Icon: Calculator },
      { href: "/estimating", label: "Estimating", count: undefined, Icon: ChartBar },
    ],
  },
  {
    label: "Development",
    items: [{ href: "/underwriting", label: "Underwriting", count: undefined, Icon: ChartLineUp }],
  },
  {
    // LA-1840: what has been built, planned and is waiting, for Matt and Kulka.
    label: "Kulka AI",
    items: [{ href: "/roadmap", label: "Roadmap", count: undefined, Icon: MapTrifold }],
  },
];


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

/** A key press the rail shortcut must leave alone, because the user is typing. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/**
 * LA-1210: the rail on a phone. Below the design's mobile breakpoint the rail
 * itself is off-canvas by default; a compact top bar carries the product name
 * and a Menu button that opens it as a drawer, so page content starts under
 * the bar instead of under a 232px block. The drawer is a dismissible overlay:
 * Escape closes it and returns focus to the Menu button.
 *
 * LA-1330: above the phone breakpoint the rail rests at icon width and opens
 * over the page once the pointer has rested on it, or when keyboard focus
 * lands inside it. The timing lives in daylight.css as transition delays, so
 * a busy page (the 3D Building View) cannot make it late the way a JS timer
 * would be. Keep Open (or the [ key) pins it beside the page instead.
 */
export function Rail({
  email,
  openAccess = false,
  initialPinned = false,
  needsKulka = 0,
}: {
  email: string;
  openAccess?: boolean;
  initialPinned?: boolean;
  /** LA-1490: client comment threads waiting on Kulka. Conceptual Budget shows the count, and shows nothing at zero. */
  needsKulka?: number;
}) {
  const path = usePathname();
  const router = useRouter();
  const initials = email.slice(0, 2).toUpperCase();
  const activeHref = activeRailHref(path);
  const [open, setOpen] = useState(false);
  // Escape shuts the hover-opened rail until the pointer leaves it, so a
  // pointer resting on the rail does not hold it open (WCAG 1.4.13).
  const [dismissed, setDismissed] = useState(false);
  const [pinned, setPinned] = useState(initialPinned);
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

  const togglePinned = useCallback(() => {
    setPinned((was) => {
      const next = !was;
      document.cookie = `${RAIL_COOKIE}=${next ? "pinned" : "hover"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  // The frame reserves the rail's full width only while it is pinned; the
  // layout renders the first value from the cookie, and this keeps it in step.
  useEffect(() => {
    const frame = railRef.current?.closest<HTMLElement>(".app");
    if (frame) frame.dataset.rail = pinned ? "pinned" : "hover";
  }, [pinned]);


  // [ keeps the rail open or lets it rest, the way Linear and Notion bind
  // their sidebars to one key. Ignored while typing.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "[" || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target) || document.querySelector('dialog[open], [aria-modal="true"]')) return;
      event.preventDefault();
      togglePinned();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [togglePinned]);

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
    items: group.items.filter((item) => railMatches(query, { ...item, group: group.label })),
  })).filter((group) => group.items.length > 0);
  const showHome = railMatches(query, { label: "Home", code: "H-100" });
  const firstMatch = showHome ? "/" : groups[0]?.items[0]?.href;

  // Focus in the field opens the rail through :focus-visible (daylight.css).
  const openSearch = () => searchRef.current?.focus();

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
        data-dismissed={dismissed ? "true" : undefined}
        // A filter only means something while the rail is open to show it;
        // left behind, it would empty the resting rail of every icon.
        onPointerLeave={() => {
          setDismissed(false);
          if (!railRef.current?.contains(document.activeElement)) setQuery("");
        }}
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
          // Only a resting pointer needs holding off; with the pointer
          // elsewhere, dropping focus is enough to shut it.
          if (railRef.current?.matches(":hover")) setDismissed(true);
          (document.activeElement as HTMLElement | null)?.blur();
        }}
      >
        <div className="rail-logo">
          <span className="rail-logo-mark" aria-hidden="true">K</span>
          <span className="rail-logo-lockup">
            <span className="rail-logo-word">Kulka</span>
            <span className="logo-ai">AI</span>
          </span>
        </div>
        <div className="rail-search">
          <button type="button" className="rail-search-icon" aria-label="Jump to a Sheet" tabIndex={-1} onClick={openSearch}>
            <MagnifyingGlass size={16} />
          </button>
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

        <div className="rail-foot">
          <button
            type="button"
            className="rail-item rail-pin"
            aria-pressed={pinned}
            onClick={togglePinned}
            title={pinned ? "Let the sidebar rest ( [ )" : "Keep the sidebar open ( [ )"}
          >
            <SidebarSimple size={16} />
            <span>{pinned ? "Let It Rest" : "Keep Open"}</span>
            <kbd className="count">[</kbd>
          </button>
          {/* LA-1210: while KULKA_AUTH_OPEN=1 there is no signed-in account behind
              "OP" and this email, so the footer shows nothing rather than an
              account and a Sign Out that don't mean anything yet. */}
          {!openAccess ? (
            <div className="rail-user">
              <span className="owner owner--1">{initials}</span>
              <span className="t-ui rail-user-email" title={email}>{email}</span>
              <form action={signOut}>
                <button className="btn btn--quiet" type="submit">Sign Out</button>
              </form>
            </div>
          ) : null}
        </div>
      </nav>
    </>
  );
}
