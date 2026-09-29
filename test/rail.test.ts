import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";

import { Rail, railMatches } from "@/components/Rail";

let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/app/login/actions", () => ({
  signOut: vi.fn(),
}));

describe("sidebar navigation", () => {
  beforeEach(() => {
    pathname = "/";
  });

  it("renders Home first and outside the business function groups", () => {
    const html = renderToStaticMarkup(createElement(Rail, { email: "test@example.com" }));

    expect(html).not.toContain("Operations");
    expect(html).not.toContain("Homepage");
    expect(html.indexOf(">Home<")).toBeLessThan(html.indexOf("Sales and Marketing"));
    const homeLink = html.match(/<a class="rail-item"[^>]*href="\/"[^>]*>/)?.[0];
    expect(homeLink).toContain('aria-current="page"');
    expect(html).toContain(">H-100<");
    expect(html).toContain('href="/clients"');
    expect(html).toContain('href="/briefs"');
    expect(html).not.toMatch(/>31<|>9<|>6</);
  });

  it("does not mark Home as active on another page", () => {
    pathname = "/pursuits";

    const html = renderToStaticMarkup(createElement(Rail, { email: "test@example.com" }));
    const homeLink = html.match(/<a class="rail-item" href="\/"[^>]*>/)?.[0];

    expect(homeLink).toBe('<a class="rail-item" href="/">');
  });

  it("lights Conceptual Budget on /rom/parameters, which has no rail item of its own (LA-1321)", () => {
    pathname = "/rom/parameters";

    const html = renderToStaticMarkup(createElement(Rail, { email: "test@example.com" }));
    expect(html).toContain('<a class="rail-item" aria-current="page" href="/rom">');
    expect(html).not.toContain('href="/rom/parameters"');
  });

  it("keeps Conceptual Budget lit on the other ROM pages", () => {
    pathname = "/rom/backtest";

    const html = renderToStaticMarkup(createElement(Rail, { email: "test@example.com" }));
    expect(html).toContain('<a class="rail-item" aria-current="page" href="/rom">');
  });

  it("shows the account and Sign Out when sign-in is on", () => {
    const html = renderToStaticMarkup(createElement(Rail, { email: "test@example.com" }));
    expect(html).toContain("test@example.com");
    expect(html).toContain("Sign Out");
  });

  it("hides the avatar, email, and Sign Out while sign-in is open (LA-1210)", () => {
    const html = renderToStaticMarkup(createElement(Rail, { email: "open-access@kulka.invalid", openAccess: true }));
    expect(html).not.toContain("open-access@kulka.invalid");
    expect(html).not.toContain("Sign Out");
    expect(html).not.toContain('class="rail-user"');
  });

  it("renders a phone top bar with an accessible Menu button that opens the rail drawer (LA-1210)", () => {
    const html = renderToStaticMarkup(createElement(Rail, { email: "test@example.com" }));
    expect(html).toContain("phone-topbar");
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="rail-nav"[^>]*>/);
    expect(html).toContain('id="rail-nav"');
    // Closed by default: the drawer's own open class and its backdrop are absent.
    expect(html).not.toContain("rail--open");
    expect(html).not.toContain("rail-backdrop");
  });

  it("names the rail and its search field, and offers Keep Open with its key (LA-1330)", () => {
    const html = renderToStaticMarkup(createElement(Rail, { email: "test@example.com" }));
    expect(html).toContain('aria-label="Sheets"');
    expect(html).toContain('aria-label="Jump to a Sheet"');
    expect(html).toMatch(/<button[^>]*class="rail-item rail-pin"[^>]*aria-pressed="false"/);
    expect(html).toContain("Keep Open");
    expect(html).toContain("rail-logo-mark");
  });

  it("renders pinned when the cookie said so (LA-1330)", () => {
    const html = renderToStaticMarkup(createElement(Rail, { email: "test@example.com", initialPinned: true }));
    expect(html).toMatch(/aria-pressed="true"/);
    expect(html).toContain("Let It Rest");
  });

  it("opens after a short rest and forgives a brief overshoot, inside the eval's bands (LA-1330)", () => {
    const css = readFileSync("daylight.css", "utf8");
    const open = Number(css.match(/--rail-open-delay:\s*(\d+)ms/)?.[1]);
    const close = Number(css.match(/--rail-close-delay:\s*(\d+)ms/)?.[1]);
    expect(open).toBeGreaterThanOrEqual(100);
    expect(open).toBeLessThanOrEqual(200);
    expect(close).toBeGreaterThanOrEqual(250);
    expect(close).toBeLessThanOrEqual(600);
  });

  it("filters sheets by name, section, or spoken address (LA-1330)", () => {
    expect(railMatches("", { label: "Clients" })).toBe(true);
    expect(railMatches("budg", { label: "Conceptual Budget" })).toBe(true);
    expect(railMatches("pre-con", { label: "Estimating", group: "Pre-Construction" })).toBe(true);
    expect(railMatches("h-100", { label: "Home", code: "H-100" })).toBe(true);
    expect(railMatches("zzz", { label: "Clients", group: "Sales and Marketing" })).toBe(false);
  });
});
