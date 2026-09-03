"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Target, Users, FileText, Calculator, ChartLineUp } from "@phosphor-icons/react";
import { OWNER_COLOR } from "@/lib/data";
import { signOut } from "@/app/login/actions";

// Icons live in the rail and as state marks, nowhere else, and an icon always
// sits beside its word (DESIGN.md, Navigation).
//
const NAV_GROUPS = [
  {
    label: "Sales and Marketing",
    items: [{ href: "/clients/c-042", label: "Clients", count: "31", Icon: Users }],
  },
  {
    label: "Business Development",
    items: [
      { href: "/pursuits", label: "Pursuits", count: "9", Icon: Target },
      { href: "/briefs/b-217", label: "Briefs", count: "6", Icon: FileText },
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

export function Rail({ email }: { email: string }) {
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
        <span className={`owner owner--${OWNER_COLOR.RK}`}>{initials}</span>
        <span className="t-ui">{email}</span>
        <form action={signOut}>
          <button className="btn btn--quiet" type="submit">Sign Out</button>
        </form>
      </div>
    </nav>
  );
}
