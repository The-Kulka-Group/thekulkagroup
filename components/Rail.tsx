"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { House, Target, Users, FileText, Calculator, ChartLineUp, Binoculars, ChartBar, SlidersHorizontal, List } from "@phosphor-icons/react";
import { signOut } from "@/app/login/actions";

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
      { href: "/pursuits", label: "Pursuits", count: undefined, Icon: Target },
      { href: "/briefs", label: "Briefs", count: undefined, Icon: FileText },
    ],
  },
  {
    label: "Pre-Construction",
    items: [
      { href: "/rom", label: "Conceptual Budget", count: undefined, Icon: Calculator },
      { href: "/rom/parameters", label: "Engine Parameters", count: undefined, Icon: SlidersHorizontal },
      { href: "/estimating", label: "Estimating", count: undefined, Icon: ChartBar },
    ],
  },
  {
    label: "Development",
    items: [{ href: "/underwriting", label: "Underwriting", count: undefined, Icon: ChartLineUp, Binoculars }],
  },
];

/**
 * Which rail item a path belongs to. An item owns every path under it (/rom
 * covers /rom/runs and /rom/backtest), and the longest match wins, so
 * /rom/parameters lights its own item (LA-866).
 */
export function activeRailHref(path: string): string | null {
  if (path === "/") return "/";
  const items = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
  const matches = items.filter((href) => path === href || path.startsWith(`${href}/`));
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

/**
 * LA-1210: the rail on a phone. Below the design's mobile breakpoint the rail
 * itself is off-canvas by default; a compact top bar carries the product name
 * and a Menu button that opens it as a drawer, so page content starts under
 * the bar instead of under a 232px block. Desktop is unchanged: the drawer
 * markup renders every width, and `daylight.css` hides it above the
 * breakpoint. The drawer is a dismissible overlay: Escape closes it and
 * returns focus to the Menu button, the way any such overlay should.
 */
export function Rail({ email, openAccess = false }: { email: string; openAccess?: boolean }) {
  const path = usePathname();
  const initials = email.slice(0, 2).toUpperCase();
  const activeHref = activeRailHref(path);
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Picking a rail item on a phone should not leave the drawer open over the
  // page it just navigated to. Adjusted during render, the way React's own
  // docs recommend for state that must follow a prop, rather than in an
  // effect that would render open once and then closed a beat later.
  const [openedForPath, setOpenedForPath] = useState(path);
  if (path !== openedForPath) {
    setOpenedForPath(path);
    if (open) setOpen(false);
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
      <nav id="rail-nav" className={`rail${open ? " rail--open" : ""}`}>
        <div className="rail-logo">
          Kulka<span className="logo-ai">AI</span>
        </div>
        <div className="rail-search">
          <input className="input" type="search" placeholder="Search Sheets" />
        </div>

        <div className="rail-nav">
          <Link
            className="rail-item"
            href="/"
            aria-current={path === "/" ? "page" : undefined}
          >
            <House size={16} />
            <span>Home</span>
            <span className="count">H-100</span>
          </Link>
          {NAV_GROUPS.map((group) => (
            <div className="rail-group" key={group.label}>
              <div className="rail-section t-label">{group.label}</div>
              {group.items.map(({ href, label, count, Icon }) => {
                // The longest href that matches the path wins, so /rom/parameters
                // lights Engine Parameters rather than Conceptual Budget too.
                const active = href === activeHref;
                return (
                  <Link
                    key={href}
                    className="rail-item"
                    href={href}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                    {count ? <span className="count">{count}</span> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* LA-1210: while KULKA_AUTH_OPEN=1 there is no signed-in account behind
            "OP" and this email, so the footer shows nothing rather than an
            account and a Sign Out that don't mean anything yet. */}
        {!openAccess ? (
          <div className="rail-user">
            <span className="owner owner--1">{initials}</span>
            <span className="t-ui">{email}</span>
            <form action={signOut}>
              <button className="btn btn--quiet" type="submit">Sign Out</button>
            </form>
          </div>
        ) : null}
      </nav>
    </>
  );
}
