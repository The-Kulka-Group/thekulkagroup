"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Target, Users, FileText, Calculator, ChartLineUp } from "@phosphor-icons/react";
import { OWNER_COLOR } from "@/lib/data";

// Icons live in the rail and as state marks, nowhere else, and an icon always
// sits beside its word (DESIGN.md, Navigation).
//
const NAV_GROUPS = [
  {
    label: "Sales and marketing",
    items: [{ href: "/clients/c-042", label: "Clients", count: "31", Icon: Users }],
  },
  {
    label: "Business development",
    items: [
      { href: "/pursuits", label: "Pursuits", count: "9", Icon: Target },
      { href: "/briefs/b-217", label: "Briefs", count: "6", Icon: FileText },
    ],
  },
  {
    label: "Operations",
    items: [{ href: "/", label: "Home", count: "H-100", Icon: House }],
  },
  {
    label: "Pre-construction",
    items: [{ href: "/rom", label: "Conceptual budget", count: undefined, Icon: Calculator }],
  },
  {
    label: "Development",
    items: [{ href: "/underwriting", label: "Underwriting", count: undefined, Icon: ChartLineUp }],
  },
];

export function Rail() {
  const path = usePathname();
  return (
    <nav className="rail">
      <div className="rail-logo">
        Kulka<span className="logo-ai">AI</span>
      </div>
      <div className="rail-search">
        <input className="input" type="search" placeholder="Search sheets" />
      </div>

      <div className="rail-nav">
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
        <span className={`owner owner--${OWNER_COLOR.RK}`}>RK</span>
        <span className="t-ui">Rob K. (example)</span>
      </div>
    </nav>
  );
}
