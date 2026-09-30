import { PARAMETER_NAMES } from "@kulka/engine";
import { describe, expect, it } from "vitest";

import { presentBudget } from "@/lib/rom/presentation";
import { referencePage, referencePublication } from "@/test/fixtures/published-budget";

import { renderBudgetPage } from "./render";

// LA-1418. The app's page against the LA-1416 reference page, from the same
// run: the same sections in the same order, the same data-el ids and the same
// figures. Whitespace is not compared; the markup is the reference's, so a
// difference that matters shows up as an id or a figure.

const page = () => renderBudgetPage(presentBudget(referencePublication()));

const idsOf = (html: string) => [...html.matchAll(/data-el="([^"]*)"/g)].map((m) => m[1]);
const moneyOf = (html: string) => [...html.matchAll(/\$[0-9][0-9,]*/g)].map((m) => m[0]);
const tally = (xs: string[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());

/** What a client reads: the text of the body and the words in titles and labels, never markup or script paths. */
function clientText(html: string): string {
  const body = html.slice(html.indexOf("<body>"));
  const attributes = [...body.matchAll(/(?:title|aria-label)="([^"]*)"/g)].map((m) => m[1]);
  const text = body
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return [text, ...attributes].join("\n");
}

describe("the rendered page against the reference", () => {
  it("prints the reference's sections in the reference's order", () => {
    const sections = [...page().matchAll(/<section[^>]*id="([^"]*)"/g)].map((m) => m[1]);

    expect(sections).toEqual(referencePage.sections);
  });

  it("carries the reference's element ids, with its duplicates made single", () => {
    const html = page();
    const ids = idsOf(html);
    const notComparable = (id: string) => !id.includes(":comparable:");

    // The departures, each so an id names one element (see render.ts):
    // the run's recorded date is the issue date on a published page; the
    // record's Gross Area and Units no longer reuse the fact rows' ids; a
    // parameter's id is a slug, so no engine parameter key reaches the page.
    const renamed = (id: string) =>
      id === "record:recorded" ? "record:issued" : id.startsWith("parameter:") ? `parameter:${id.slice(10).replace(/[._]/g, "-")}` : id;
    const expected = new Set([...referencePage.dataEl.filter(notComparable).map(renamed), "record:gross-area", "record:units"]);

    expect(new Set(ids.filter(notComparable))).toEqual(expected);
    expect(ids.filter((id) => id.includes(":comparable:"))).toHaveLength(referencePage.dataEl.filter((id) => id.includes(":comparable:")).length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("prints the reference's figures, each as often as the reference did", () => {
    const html = page();
    const app = tally(moneyOf(html));
    const reference = tally(referencePage.money);
    // Departure: the $/SF and $/unit figures carry their arithmetic, which
    // names the Kulka contract once more each.
    reference.set("$20,296,613", reference.get("$20,296,613")! + 2);

    expect(app).toEqual(reference);
  });
});

describe("client-facing text", () => {
  // LA-1333's guard: nothing on a budget reads like the inside of the software.
  const LEAKS: [RegExp, string][] = [
    [/docs\//, "a repository path"],
    [/\.md\b/, "a Markdown file name"],
    [/\bjev\b/i, "the internal model's name"],
    [/[\w.+-]+@[\w-]+\.[\w.-]+/, "an email address"],
    ...PARAMETER_NAMES.map((name): [RegExp, string] => [new RegExp(name.replace(/\./g, "\\.")), `the engine parameter ${name}`]),
  ];

  it("passes the LA-1333 copy guard, over the whole document", () => {
    const html = page();

    expect(LEAKS.filter(([pattern]) => pattern.test(html)).map(([pattern, why]) => `${why}: ${html.match(pattern)![0]}`)).toEqual([]);
  });

  it("never names AI, an LLM, Jev, a model, Claude or a ROM where a client reads", () => {
    const text = clientText(page());

    expect(text.match(/\bAI\b|\bLLM\b|\bJev\b|\bmodels?\b|\bClaude\b|\bROM\b|user override|history:|engine parameters?/gi)).toBeNull();
  });

  it("writes every label in title case", () => {
    const html = page();
    // lib/format/title-case.ts's short words, plus "as", which the reference's headings keep lowercase.
    const SHORT = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "is", "of", "on", "or", "per", "the", "to", "with"]);
    const labels = [
      ...html.matchAll(
        /<(h1|h2|h3|dt|th|button)[^>]*>([\s\S]*?)<\/\1>|class="(?:label|label label--gap|stage__name|scope__label|line__label|wf__label|criterion__label|pill|receipt__title|cmp__kind)"[^>]*>([\s\S]*?)<\/(?:p|span|h3)>|<a href="#[^"]*" data-index="[^"]*">([^<]*)<\/a>/g,
      ),
    ]
      .map((m) => (m[2] ?? m[3] ?? m[4] ?? "").replace(/<span class="scope__count">[\s\S]*?<\/span>/g, "").replace(/<[^>]+>/g, " "))
      .map((label) => label.replace(/&amp;/g, "&").replace(/\s+/g, " ").trim())
      .filter((label) => label.length > 0 && !/^\$|^\d+$/.test(label));
    const notTitle = labels.filter((label) =>
      label.split(" ").some((word, i) => {
        const letters = word.replace(/^[^A-Za-z0-9]+/, "");
        if (letters === "" || /^[A-Z0-9]/.test(letters)) return false;
        return i === 0 || !SHORT.has(letters.replace(/[^a-z]/g, ""));
      }),
    );

    expect(labels.length).toBeGreaterThan(100);
    expect(notTitle).toEqual([]);
  });
});
