import type { ConfidenceFlag, DetailLevel, Rom, RomLine } from "@kulka/engine";

import type { Db } from "@/lib/db";
import { savedRom } from "@/lib/rom/run-records";

// The block board payload (LA-884). A finished run already carries every block
// with its level, its element and its breakout parent, so this file reads the
// run record back and sorts it. It computes no cost and it adds no figure the
// run does not already hold.
//
// The same blocks answer all three axes. Nothing is stored three times: the
// board gets one list of blocks and groups it by element, division or buyout
// package on screen.

/** One ROM line as the board reads it. */
export type Block = {
  costCode: string;
  label: string;
  low: number;
  high: number;
  confidence: ConfidenceFlag;
  heldForReview: boolean;
  /**
   * The MasterFormat division the cost code sits in, or null when the code does
   * not start with one. Read off the cost code itself rather than joined from
   * `canonical_work_items`, because `benchmarks.cost_code` is deliberately not
   * foreign-keyed to that list yet.
   */
  division: string | null;
  buyoutPackage: string | null;
  element: string | null;
  /** The tier of detail this block's quantity arrived at, or null when nobody has stated one. */
  level: DetailLevel | null;
  /** The level 1 lump this block is carved out of, or null when it adds. */
  breakoutOf: string | null;
  /** False for a breakout: its parent lump already contains the scope. */
  addsToTotal: boolean;
};

export type BlockRange = { low: number; high: number };

/** One row of the board: every block whose fact arrived at this tier of detail. */
export type BoardLevel = {
  /** 1 to 4, or null for the row of blocks nobody has classified yet. */
  level: DetailLevel | null;
  blocks: Block[];
  /** What this row puts into the total. */
  adds: BlockRange;
  /** What this row shows but carves out of a level 1 lump above it. */
  carvedOut: BlockRange;
};

/** One element, and what the single fact behind it pays for. */
export type BoardElement = {
  element: string;
  blockCount: number;
  /** Distinct divisions the element reaches, sorted. */
  divisions: string[];
  adds: BlockRange;
  carvedOut: BlockRange;
  /** Levels the element's blocks sit at, sorted, nulls dropped. */
  levels: DetailLevel[];
};

export type RunBoard = {
  runId: string;
  projectName: string;
  grossSquareFeet: number | null;
  levels: BoardLevel[];
  elements: BoardElement[];
  total: BlockRange;
  kulkaContractTotal: BlockRange;
  carvedOut: BlockRange;
};

/** There is no such run, or it never finished, so there is no board to show. */
export class RunBoardNotFound extends Error {
  constructor(readonly runId: string) {
    super(`No finished run ${runId}.`);
    this.name = "RunBoardNotFound";
  }
}

const LEVELS: readonly DetailLevel[] = [1, 2, 3, 4];

type RunRow = {
  id: string;
  rom: Rom | null;
  project_name: string;
  gross_square_feet: number | null;
  answers: { grossSquareFeet?: number } | null;
};

export async function readRunBoard(db: Db, runId: string): Promise<RunBoard> {
  const { rows } = await db.query<RunRow>(
    `select r.id, r.rom, r.answers, p.name as project_name, p.gross_square_feet
       from runs r
       join projects p on p.id = r.project_id
      where r.id = $1`,
    [runId],
  );
  const run = rows[0];
  if (!run || !run.rom) throw new RunBoardNotFound(runId);

  const rom = savedRom(run.rom);
  const blocks = rom.lines.map(toBlock);

  return {
    runId: run.id,
    projectName: run.project_name,
    // The area the run was computed on, which is what a per-square-foot reading
    // of the board has to divide by. It is the answers' figure when the run had
    // answers, and the project record's otherwise.
    grossSquareFeet: run.answers?.grossSquareFeet ?? run.gross_square_feet,
    levels: [...LEVELS, null].map((level) => describeLevel(level, blocks)),
    elements: describeElements(blocks),
    total: run.rom.total,
    kulkaContractTotal: run.rom.kulkaContractTotal,
    carvedOut: rom.carvedOut,
  };
}

function toBlock(line: RomLine): Block {
  return {
    costCode: line.costCode,
    label: line.label,
    low: line.low,
    high: line.high,
    confidence: line.confidence,
    heldForReview: line.heldForReview,
    division: divisionOf(line.costCode),
    buyoutPackage: line.buyoutPackage,
    element: line.element,
    level: line.detailLevel,
    breakoutOf: line.breakoutOf,
    addsToTotal: line.breakoutOf === null,
  };
}

/** A cost code opens with its two-digit division, or it does not name one. */
export function divisionOf(costCode: string): string | null {
  return /^(\d{2})/.exec(costCode)?.[1] ?? null;
}

function describeLevel(level: DetailLevel | null, blocks: Block[]): BoardLevel {
  const mine = blocks.filter((b) => (level === null ? b.level === null : b.level === level));
  return {
    level,
    blocks: mine,
    adds: sum(mine.filter((b) => b.addsToTotal)),
    carvedOut: sum(mine.filter((b) => !b.addsToTotal)),
  };
}

function describeElements(blocks: Block[]): BoardElement[] {
  const named = [...new Set(blocks.map((b) => b.element).filter((e): e is string => e !== null))];

  return named.sort().map((element) => {
    const mine = blocks.filter((b) => b.element === element);
    return {
      element,
      blockCount: mine.length,
      divisions: [...new Set(mine.map((b) => b.division).filter((d): d is string => d !== null))].sort(),
      adds: sum(mine.filter((b) => b.addsToTotal)),
      carvedOut: sum(mine.filter((b) => !b.addsToTotal)),
      levels: [...new Set(mine.map((b) => b.level).filter((l): l is DetailLevel => l !== null))].sort(),
    };
  });
}

function sum(blocks: Block[]): BlockRange {
  return {
    low: blocks.reduce((total, b) => total + b.low, 0),
    high: blocks.reduce((total, b) => total + b.high, 0),
  };
}
