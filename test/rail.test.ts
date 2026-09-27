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
});
