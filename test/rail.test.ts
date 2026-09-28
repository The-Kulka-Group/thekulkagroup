import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Rail } from "@/components/Rail";

let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
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

  it("lights Engine Parameters, not Conceptual Budget, on /rom/parameters (LA-866)", () => {
    pathname = "/rom/parameters";

    const html = renderToStaticMarkup(createElement(Rail, { email: "test@example.com" }));
    expect(html).toContain('<a class="rail-item" aria-current="page" href="/rom/parameters">');
    expect(html).toContain('<a class="rail-item" href="/rom">');
  });

  it("keeps Conceptual Budget lit on the other ROM pages", () => {
    pathname = "/rom/backtest";

    const html = renderToStaticMarkup(createElement(Rail, { email: "test@example.com" }));
    expect(html).toContain('<a class="rail-item" aria-current="page" href="/rom">');
    expect(html).toContain('<a class="rail-item" href="/rom/parameters">');
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
});
