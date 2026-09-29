import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PARAMETER_NAMES, type DerivedAssumption } from "@kulka/engine";

import { deriveBuildingForm } from "@/lib/rom/building-form-criterion";
import { publicWording } from "@/lib/rom/derived-assumptions";
import { deriveConstructionType } from "@/lib/rom/construction-type-criterion";
import { deriveElectricalService } from "@/lib/rom/electrical-criterion";
import { deriveElevatorType } from "@/lib/rom/elevator-criterion";
import { deriveFoundation } from "@/lib/rom/foundation-criterion";
import { deriveGlazing, deriveTonnage, glazingBand } from "@/lib/rom/hvac-criterion";
import { deriveJackType } from "@/lib/rom/jack-criterion";
import type { JevClient } from "@/lib/rom/jev";
import { deriveMachineRooms } from "@/lib/rom/machine-room-criterion";

import { CriterionCard, CriterionPanel, type Criterion } from "./DerivedCriteria";

// LA-1333. A budget is a document Kulka hands a developer, so nothing on it
// may read like the inside of the software: no repository path, no internal
// model name, no email address and no engine parameter key. The criteria come
// from the real criterion functions on synthetic facts, so a new criterion or
// a new branch of an old one is checked the moment a fact set reaches it. The
// Total, trade detail and notes panels join in LA-1336.

/** What must never reach a budget screen, each with the reason it failed. */
const LEAKS: [RegExp, string][] = [
  [/docs\//, "a repository path"],
  [/\.md\b/, "a Markdown file name"],
  [/\bjev\b/i, "the internal model's name"],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/, "an email address"],
  ...PARAMETER_NAMES.map((name): [RegExp, string] => [
    new RegExp(name.replace(/\./g, "\\.")),
    `the engine parameter ${name}`,
  ]),
];

function leaksIn(html: string): string[] {
  return LEAKS.filter(([pattern]) => pattern.test(html)).map(([pattern, why]) => `${why}: ${html.match(pattern)![0]}`);
}

// Synthetic facts. None of these is a Kulka project.
const gates = ["yes", "no", "dont_know", null] as const;
const framings = ["wood", "metal", null] as const;

function fakeClient(pick: "hydraulic" | "traction", confidence: number): JevClient {
  return { systemOne: async () => ({ model: "test", answers: { pick: { choice: pick, confidence } } }) } as JevClient;
}

async function everyCriterion(): Promise<DerivedAssumption[]> {
  const out: (DerivedAssumption | null)[] = [];
  for (const stories of [1, 4, 6, 9, 14]) {
    for (const framingSystem of framings) {
      out.push(deriveBuildingForm({ grossSquareFeet: 120_000, storiesAboveGrade: stories, buildingCount: 1 }));
      for (const parkingType of ["none", "surface", "structured", "underground", null]) {
        for (const retailStorefronts of gates) {
          out.push(
            deriveConstructionType({
              storiesAboveGrade: stories,
              framingSystem,
              parkingType,
              retailStorefronts,
              grossSquareFeet: 120_000,
              buildingCount: 1,
              zip: "10001",
            }),
          );
        }
      }
      for (const hasTallerGroundFloor of [false, true]) {
        const elevator = { storiesAboveGrade: stories, framingSystem, hasTallerGroundFloor };
        for (const client of [null, fakeClient("hydraulic", 0.9), fakeClient("traction", 0.5)]) {
          out.push((await deriveElevatorType(client, elevator))?.assumption ?? null);
        }
        for (const belowGrade of gates) {
          for (const zip of ["10001", "12401", null]) {
            out.push(deriveJackType({ ...elevator, belowGrade, siteConditions: belowGrade, zip }));
          }
        }
      }
      for (const levelsBelowGrade of gates) {
        for (const constructionKind of ["new", "renovation"] as const) {
          out.push(
            deriveFoundation({
              constructionKind,
              storiesAboveGrade: stories,
              framingSystem,
              parkingType: "structured",
              levelsBelowGrade,
              siteConditions: levelsBelowGrade,
              tieIn: levelsBelowGrade,
              zip: "10001",
            }),
          );
        }
      }
    }
  }
  for (const balconies of gates) {
    for (const storefronts of gates) {
      const glazing = deriveGlazing({ balconies, storefronts });
      out.push(glazing);
      const band = glazing.value.kind === "spec" ? glazingBand(glazing.value.text) : glazingBand("");
      for (const zip of ["10001", "99501", null]) {
        out.push(
          deriveTonnage({
            constructionKind: "new",
            grossSquareFeet: 120_000,
            unitCount: 110,
            zip,
            parkingType: "surface",
            band,
            bandSet: balconies !== null,
          }),
        );
      }
    }
  }
  for (const elevatorCount of [0, 1, 4]) {
    for (const amenityScope of gates) {
      out.push(
        deriveElectricalService({
          constructionKind: "new",
          grossSquareFeet: 120_000,
          unitCount: 110,
          buildingCount: 2,
          amenityScope,
          elevatorCount,
          parkingType: "structured",
        }),
      );
    }
    for (const elevatorType of ["hydraulic", "traction"] as const) {
      for (const jackType of ["in_ground", "holeless", "roped", null] as const) {
        for (const zip of ["10001", "12401", null]) {
          out.push(
            deriveMachineRooms({ elevatorType, typeSettled: true, elevatorCount, buildingCount: 2, jackType, zip }),
          );
        }
      }
    }
  }
  return out.filter((item): item is DerivedAssumption => item !== null);
}

function stored(assumption: DerivedAssumption, correctedBy: string | null): Criterion {
  return {
    ...assumption,
    id: "00000000-0000-4000-8000-0000000000c1",
    correctionId: correctedBy ? "00000000-0000-4000-8000-0000000000c2" : null,
    correction: correctedBy
      ? { value: assumption.value, reason: "Synthetic correction", correctedBy, correctedAt: "2026-09-29T15:00:00.000Z" }
      : null,
  };
}

const noop = () => {};

describe("the copy guard", () => {
  it("catches each kind of leak it is meant to catch", () => {
    expect(leaksIn("(docs/precon/criteria/la-777-hvac-tonnage.md)")).toHaveLength(2);
    expect(leaksIn("Jev picked Hydraulic")).toHaveLength(1);
    expect(leaksIn("recorded by estimator@kulka.invalid")).toHaveLength(1);
    expect(leaksIn("parameter fee.rate")).toHaveLength(1);
    expect(leaksIn("Fee 3.25%, recorded 2026-09-23")).toEqual([]);
  });

  it("finds nothing internal on any Design and Engineering card or its detail", async () => {
    const criteria = await everyCriterion();
    // Every criterion code the engine has, so a new one cannot slip past.
    expect(new Set(criteria.map((item) => item.code))).toEqual(
      new Set(["A-1", "A-2", "E-1", "M-0", "M-1", "S-1", "V-1", "V-2", "V-3"]),
    );

    const found = new Map<string, string[]>();
    for (const assumption of criteria) {
      for (const item of [stored(assumption, null), stored(assumption, "estimator@kulka.invalid")]) {
        const html =
          renderToStaticMarkup(<CriterionCard item={item} />) +
          renderToStaticMarkup(
            <CriterionPanel item={item} busy={false} error={null} onSave={noop} onRevert={noop} onPing={noop} />,
          );
        for (const leak of leaksIn(html)) found.set(`${item.code} ${leak}`, [item.method]);
      }
    }
    expect([...found.keys()]).toEqual([]);
  });

  it("reads a criterion saved before LA-1333 without its path or the model's name", () => {
    // Wording as runs stored it before LA-1333. The stored rows are never rewritten.
    const saved = [
      "NEC 220.84 optional multifamily calculation, one service per building (docs/precon/criteria/la-776-electrical-service-size.md).",
      "Travel sits in the either band; Jev picked Traction from the facts given.",
      "Travel below 35 ft. No Jev client is configured, so V-1 proposes Hydraulic without calling Jev.",
      "Either -- no Jev client configured, proposing Hydraulic",
    ];
    const read = saved.map(publicWording);

    expect(read.flatMap(leaksIn)).toEqual([]);
    expect(read[0]).toBe("NEC 220.84 optional multifamily calculation, one service per building.");
    expect(read[1]).toBe("Travel sits in the either band; picked Traction from the facts given.");
  });
});
