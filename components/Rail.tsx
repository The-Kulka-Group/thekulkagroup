"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Target, Users, FileText, Calculator, ChartLineUp } from "@phosphor-icons/react";
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
      { href: "/pursuits", label: "Pursuits", count: undefined, Icon: Target },
      { href: "/briefs", label: "Briefs", count: undefined, Icon: FileText },
    ],
  },
  {
    label: "Pre-Construction",
    items: [{ href: "/rom", label: "Conceptual Budget", count: undefined, Icon: Calculator }],
  },
  {
    label: "Development",
    items: [{ href: "/underwriting", label: "Underwriting", count: undefined, Icon: ChartLineUp }],
  },
];

export function Rail({ email, temporaryAccess = false }: { email: string; temporaryAccess?: boolean }) {
  const path = usePathname();
  const initials = email.slice(0, 2).toUpperCase();
  return (
    <nav className="rail">
      <div className="rail-logo">
        Kulka<span className="logo-ai">AI</span>
      </div>
      <div className="rail-search">
        <input className="input" type="search" placeholder="Search sheets" />
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
              const active =
                href === "/" ? path === "/" : path.startsWith(href.split("/").slice(0, 2).join("/"));
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

      <div className="rail-user">
        <span className="owner owner--1">{initials}</span>
        <span className="t-ui">{email}</span>
        {temporaryAccess ? null : (
          <form action={signOut}>
            <button className="btn btn--quiet" type="submit">Sign Out</button>
          </form>
        )}
      </div>
    </nav>
  );
}
