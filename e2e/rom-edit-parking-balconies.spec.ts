import { expect, type APIRequestContext, test } from "@playwright/test";

import { BROWSER_TEST_ROM_PROJECT_ID } from "../lib/browser-test-db";

// LA-2274. Edit Project on a saved budget changes Parking Type and the balcony
// answers, and the run it records prices from them.

type Summary = { id: string; projectId: string; status: string };

async function latestRun(request: APIRequestContext) {
  const { runs } = (await (await request.get("/api/rom/runs?limit=50")).json()) as { runs: Summary[] };
  const mine = runs.filter((run) => run.projectId === BROWSER_TEST_ROM_PROJECT_ID && run.status === "succeeded");
  return mine[0];
}

test("Edit Project changes Parking Type and a balcony answer, and records a run from them", async ({ page, request }) => {
  const first = await request.post("/api/rom", { data: { projectId: BROWSER_TEST_ROM_PROJECT_ID } });
  expect(first.status(), await first.text()).toBe(200);
  const before = await latestRun(request);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/rom?project=${BROWSER_TEST_ROM_PROJECT_ID}&edit=1`);

  await page.getByLabel("Parking Type").selectOption({ label: "Structured" });
  await page.getByLabel("Balcony Type").selectOption({ label: "Juliet" });
  // Juliet opens its own two numbers and never the full balcony's.
  await expect(page.getByLabel("Balcony Count")).toHaveCount(0);
  await page.getByLabel("Juliet Count").fill("12");
  await page.getByLabel("Rail per Juliet").fill("6");

  // Each change saves on a pause and records a new run off the project.
  await expect
    .poll(async () => {
      const project = (await (await request.get(`/api/rom/projects/${BROWSER_TEST_ROM_PROJECT_ID}`)).json()).project;
      return [project.parkingType, project.balconyType, project.julietCount, project.julietRailLinearFeet];
    })
    .toEqual(["structured", "juliet", 12, 6]);
  await expect.poll(async () => (await latestRun(request)).id).not.toBe(before.id);
  await expect
    .poll(async () => {
      const { run } = await (await request.get(`/api/rom/runs/${(await latestRun(request)).id}`)).json();
      const facts = run.answers?.facts ?? {};
      return [facts.parkingType, facts.balconyType, facts.julietCount, facts.julietRailLinearFeet];
    })
    .toEqual(["structured", "juliet", 12, 6]);

  // Reopened, the panel reads the saved answers back.
  await page.reload();
  await expect(page.getByLabel("Parking Type")).toHaveValue("structured");
  await expect(page.getByLabel("Juliet Count")).toHaveValue("12");
  await page.screenshot({ path: "/tmp/kulka-playwright-results/la-2274-edit.png" });
});
