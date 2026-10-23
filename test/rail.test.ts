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
    expect(html).not.toContain('href="/briefs"');
    expect(html).not.toContain('href="/pursuits"');
    expect(html).not.toMatch(/>31<|>9<|>6</);
  });

  it("shows the count of client comments that need Kulka on Conceptual Budget only (LA-1490)", () => {
    const html = renderToStaticMarkup(createElement(Rail, { email: "test@example.com", needsKulka: 3 }));
    expect(html).toMatch(/href="\/rom"[^>]*>.*?<span>Conceptual Budget<\/span><span class="count"[^>]*>3<\/span>/);
    // Home's H-100 and this one. LA-3041 took out the Keep Open key's count.
    expect(html.match(/class="count"/g)?.length).toBe(2);
    expect(html).toContain('title="Client comments that need Kulka"');
  });

  it("shows no count at zero or by default (LA-1490)", () => {
    for (const props of [{}, { needsKulka: 0 }]) {
      const html = renderToStaticMarkup(createElement(Rail, { email: "test@example.com", ...props }));
      expect(html).not.toContain("Client comments that need Kulka");
      expect(html.match(/class="count"/g)?.length).toBe(1);
    }
  });

  it("does not mark Home as active on another page", () => {
    pathname = "/clients";

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

  it("names the rail and its search field, and offers no Keep Open, since the rail always stays open (LA-3041)", () => {
    const html = renderToStaticMarkup(createElement(Rail, { email: "test@example.com" }));
    expect(html).toContain('aria-label="Sheets"');
    expect(html).toContain('aria-label="Jump to a Sheet"');
    expect(html).not.toContain("Keep Open");
    expect(html).not.toContain("rail-pin");
  });

  it("keeps the desktop rail at full width with no hover open (LA-3041)", () => {
    const css = readFileSync("daylight.css", "utf8");
    expect(css).toMatch(/@media \(min-width: 861px\) \{\s*\.app \{ grid-template-columns: var\(--rail-w\) minmax\(0, 1fr\); \}/);
    expect(css).not.toContain(".rail:hover");
    expect(css).not.toContain("--rail-open-delay");
  });

  it("filters sheets by name, section, or spoken address (LA-1330)", () => {
    expect(railMatches("", { label: "Clients" })).toBe(true);
    expect(railMatches("budg", { label: "Conceptual Budget" })).toBe(true);
    expect(railMatches("pre-con", { label: "Estimating", group: "Pre-Construction" })).toBe(true);
    expect(railMatches("h-100", { label: "Home", code: "H-100" })).toBe(true);
    expect(railMatches("zzz", { label: "Clients", group: "Sales and Marketing" })).toBe(false);
  });
});
