export const MAX_MILESTONES = 24;
export const MAX_ANCHOR_OFFSET_MONTHS = 240;
export const MIN_ANCHOR_YEAR = 1900;
export const MAX_ANCHOR_YEAR = 2200;

/** A named month on the case timeline. Cost lines and project dates anchor to it by id. */
export type Milestone = {
  id: string;
  name: string;
  month: string;
};

/** A month a whole number of months before or after a milestone. A negative offset is before it. */
export type MilestoneAnchor = {
  milestoneId: string;
  offsetMonths: number;
};

/** A cost line ends at a milestone plus an offset, or a set number of months after it starts, counting the start month. */
export type MilestoneEndAnchor = MilestoneAnchor | { durationMonths: number };

export type MilestoneIssueCode =
  | "invalid_milestone"
  | "duplicate_milestone"
  | "too_many_milestones"
  | "invalid_anchor"
  | "missing_milestone"
  | "anchor_outside_timeline"
  | "anchor_end_before_start";

export type MilestoneIssue = {
  path: string;
  code: MilestoneIssueCode;
  message: string;
};

/** One month the engine resolved from an anchor, kept so a run can say where the month came from. */
export type MilestoneResolution = {
  path: string;
  label: string;
  month: string;
  milestoneId?: string;
  milestoneName?: string;
  offsetMonths?: number;
  durationMonths?: number;
  trace: string;
};

/**
 * Everything an anchor can move. A field the case does not use stays absent. The resolver writes
 * the resolved months into the same fields the engine already reads, so anchored and typed months
 * run through identical formulas.
 */
export type AnchorTarget = {
  analysisStartMonth?: string;
  saleMonth?: string;
  saleAnchor?: MilestoneAnchor;
  milestones?: Milestone[];
  costLines?: Array<{
    id?: string;
    name?: string;
    startMonth?: string;
    endMonth?: string;
    startAnchor?: MilestoneAnchor;
    endAnchor?: MilestoneEndAnchor;
  }>;
  operationStartMonth?: string;
  operationStartAnchor?: MilestoneAnchor;
  growthStartMonth?: string;
  growthStartAnchor?: MilestoneAnchor;
  payoffMonth?: string;
};

export type MilestoneResolutionResult = {
  issues: MilestoneIssue[];
  resolutions: MilestoneResolution[];
};

/**
 * Resolves every milestone anchor on the target to a month, writing the months into the target.
 * Resolving twice gives the same months, because the anchors stay on the target. A case with no
 * anchors is left exactly as it was.
 *
 * Stabilization is an output of lease-up, so no anchor can point at it: an anchor only reads a
 * milestone's typed month, and a milestone with no valid month fails here.
 */
export function resolveMilestoneAnchors(target: AnchorTarget): MilestoneResolutionResult {
  const issues: MilestoneIssue[] = [];
  const resolutions: MilestoneResolution[] = [];
  const lines = Array.isArray(target.costLines) ? target.costLines : [];
  const usesAnchors = target.saleAnchor !== undefined
    || target.operationStartAnchor !== undefined
    || target.growthStartAnchor !== undefined
    || lines.some((line) => line && typeof line === "object" && (line.startAnchor !== undefined || line.endAnchor !== undefined));
  if (target.milestones === undefined && !usesAnchors) return { issues, resolutions };

  const milestones = new Map<string, { milestone: Milestone; index: number }>();
  validateMilestones(target.milestones, milestones, issues);
  if (issues.length > 0) return { issues, resolutions };

  const anchorMonth = (anchor: unknown, path: string, subject: string): { index: number; milestone: Milestone; offset: number } | null => {
    if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)) {
      issues.push({ path, code: "invalid_anchor", message: `${subject}: an anchor needs a milestone and an offset in months.` });
      return null;
    }
    const { milestoneId, offsetMonths } = anchor as Record<string, unknown>;
    if (typeof milestoneId !== "string" || milestoneId === "") {
      issues.push({ path: `${path}.milestoneId`, code: "invalid_anchor", message: `${subject}: choose a milestone.` });
      return null;
    }
    if (typeof offsetMonths !== "number" || !Number.isInteger(offsetMonths) || Math.abs(offsetMonths) > MAX_ANCHOR_OFFSET_MONTHS) {
      issues.push({
        path: `${path}.offsetMonths`,
        code: "invalid_anchor",
        message: `${subject}: the offset must be a whole number of months, no more than ${MAX_ANCHOR_OFFSET_MONTHS} either way.`,
      });
      return null;
    }
    const found = milestones.get(milestoneId);
    if (!found) {
      issues.push({
        path: `${path}.milestoneId`,
        code: "missing_milestone",
        message: `${subject}: the milestone it points to is not on this case. Add it or choose another.`,
      });
      return null;
    }
    const index = found.index + offsetMonths;
    if (!validYear(index)) {
      issues.push({
        path,
        code: "anchor_outside_timeline",
        message: `${subject}: ${found.milestone.name} ${offsetPhrase(offsetMonths)} falls outside the supported years ${MIN_ANCHOR_YEAR} to ${MAX_ANCHOR_YEAR}.`,
      });
      return null;
    }
    return { index, milestone: found.milestone, offset: offsetMonths };
  };

  const resolutionFor = (path: string, label: string, resolved: { index: number; milestone: Milestone; offset: number }, verb: string): MilestoneResolution => {
    const month = monthFromIndex(resolved.index);
    return {
      path,
      label,
      month,
      milestoneId: resolved.milestone.id,
      milestoneName: resolved.milestone.name,
      offsetMonths: resolved.offset,
      trace: `${verb} ${offsetPhrase(resolved.offset)} ${resolved.milestone.name} (${resolved.milestone.month}), which is ${month}.`,
    };
  };

  let saleIndex = monthIndex(target.saleMonth);
  if (target.saleAnchor !== undefined) {
    const resolved = anchorMonth(target.saleAnchor, "saleAnchor", "Sale month");
    if (resolved) {
      const resolution = resolutionFor("saleMonth", "Sale Month", resolved, "Sale month is");
      resolutions.push(resolution);
      target.saleMonth = resolution.month;
      saleIndex = resolved.index;
      if (target.payoffMonth !== undefined && target.payoffMonth !== resolution.month) {
        target.payoffMonth = resolution.month;
        resolutions.push({
          path: "payoffMonth",
          label: "Debt Payoff Month",
          month: resolution.month,
          trace: `The construction debt pays off in the sale month, ${resolution.month}, because the sale month follows ${resolved.milestone.name}.`,
        });
      }
    }
  }
  const analysisIndex = monthIndex(target.analysisStartMonth);
  const withinTimeline = (index: number) => analysisIndex === null || saleIndex === null || (index >= analysisIndex && index <= saleIndex);
  const outsideMessage = (subject: string, index: number) => `${subject} falls in ${monthFromIndex(index)}, outside the analysis timeline of ${target.analysisStartMonth} to ${target.saleMonth}.`;

  for (const [index, line] of lines.entries()) {
    if (!line || typeof line !== "object") continue;
    const path = `costLines.${index}`;
    const subject = `Cost line "${typeof line.name === "string" && line.name.trim() !== "" ? line.name : line.id ?? index + 1}"`;
    let startIndex = monthIndex(line.startMonth);
    let endIndex = monthIndex(line.endMonth);
    let anchored = false;

    if (line.startAnchor !== undefined) {
      const resolved = anchorMonth(line.startAnchor, `${path}.startAnchor`, `${subject} start`);
      if (resolved) {
        anchored = true;
        startIndex = resolved.index;
        const resolution = resolutionFor(`${path}.startMonth`, `${line.name ?? "Cost Line"} Start`, resolved, "Starts");
        resolutions.push(resolution);
        line.startMonth = resolution.month;
        if (!withinTimeline(resolved.index)) {
          issues.push({ path: `${path}.startAnchor`, code: "anchor_outside_timeline", message: outsideMessage(`${subject} start`, resolved.index) });
        }
      } else startIndex = null;
    }

    if (line.endAnchor !== undefined) {
      const end = line.endAnchor as unknown;
      if (end && typeof end === "object" && !Array.isArray(end) && "durationMonths" in end) {
        const { durationMonths } = end as { durationMonths: unknown };
        if (typeof durationMonths !== "number" || !Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > MAX_ANCHOR_OFFSET_MONTHS) {
          issues.push({
            path: `${path}.endAnchor.durationMonths`,
            code: "invalid_anchor",
            message: `${subject} duration must be a whole number of months from 1 to ${MAX_ANCHOR_OFFSET_MONTHS}.`,
          });
          endIndex = null;
        } else if (startIndex === null) {
          endIndex = null;
        } else {
          anchored = true;
          endIndex = startIndex + durationMonths - 1;
          if (!validYear(endIndex)) {
            issues.push({ path: `${path}.endAnchor`, code: "anchor_outside_timeline", message: `${subject} end falls outside the supported years ${MIN_ANCHOR_YEAR} to ${MAX_ANCHOR_YEAR}.` });
            endIndex = null;
          } else {
            const month = monthFromIndex(endIndex);
            resolutions.push({
              path: `${path}.endMonth`,
              label: `${line.name ?? "Cost Line"} End`,
              month,
              durationMonths,
              trace: `Ends ${durationMonths} ${durationMonths === 1 ? "month" : "months"} after it starts, counting the start month, which is ${month}.`,
            });
            line.endMonth = month;
            if (!withinTimeline(endIndex)) {
              issues.push({ path: `${path}.endAnchor`, code: "anchor_outside_timeline", message: outsideMessage(`${subject} end`, endIndex) });
            }
          }
        }
      } else {
        const resolved = anchorMonth(end, `${path}.endAnchor`, `${subject} end`);
        if (resolved) {
          anchored = true;
          endIndex = resolved.index;
          const resolution = resolutionFor(`${path}.endMonth`, `${line.name ?? "Cost Line"} End`, resolved, "Ends");
          resolutions.push(resolution);
          line.endMonth = resolution.month;
          if (!withinTimeline(resolved.index)) {
            issues.push({ path: `${path}.endAnchor`, code: "anchor_outside_timeline", message: outsideMessage(`${subject} end`, resolved.index) });
          }
        } else endIndex = null;
      }
    }

    if (anchored && startIndex !== null && endIndex !== null && endIndex < startIndex) {
      issues.push({
        path: `${path}.endAnchor`,
        code: "anchor_end_before_start",
        message: `${subject} ends in ${monthFromIndex(endIndex)}, before it starts in ${monthFromIndex(startIndex)}.`,
      });
    }
  }

  for (const [anchorKey, monthKey, label, subject] of [
    ["operationStartAnchor", "operationStartMonth", "Operation Start Month", "Operation start month"],
    ["growthStartAnchor", "growthStartMonth", "Growth Start Month", "Growth start month"],
  ] as const) {
    if (target[anchorKey] === undefined) continue;
    const resolved = anchorMonth(target[anchorKey], anchorKey, subject);
    if (!resolved) continue;
    const resolution = resolutionFor(monthKey, label, resolved, `${subject} is`);
    resolutions.push(resolution);
    target[monthKey] = resolution.month;
    if (!withinTimeline(resolved.index)) {
      issues.push({ path: anchorKey, code: "anchor_outside_timeline", message: outsideMessage(subject, resolved.index) });
    }
  }
  return { issues, resolutions };
}

/** The month an anchor points to, or null when the milestone is missing. For editors that show a preview. */
export function anchorPreview(milestones: Milestone[], anchor: MilestoneAnchor): string | null {
  const milestone = milestones.find(({ id }) => id === anchor.milestoneId);
  const index = milestone ? monthIndex(milestone.month) : null;
  if (index === null || !Number.isInteger(anchor.offsetMonths) || !validYear(index + anchor.offsetMonths)) return null;
  return monthFromIndex(index + anchor.offsetMonths);
}

function validateMilestones(
  milestones: unknown,
  found: Map<string, { milestone: Milestone; index: number }>,
  issues: MilestoneIssue[],
) {
  if (milestones === undefined) return;
  if (!Array.isArray(milestones)) {
    issues.push({ path: "milestones", code: "invalid_milestone", message: "Milestones must be a list." });
    return;
  }
  if (milestones.length > MAX_MILESTONES) {
    issues.push({ path: "milestones", code: "too_many_milestones", message: `A case cannot hold more than ${MAX_MILESTONES} milestones.` });
    return;
  }
  const names = new Set<string>();
  for (const [position, milestone] of milestones.entries()) {
    const path = `milestones.${position}`;
    if (!milestone || typeof milestone !== "object" || Array.isArray(milestone)) {
      issues.push({ path, code: "invalid_milestone", message: "Milestone must be an object." });
      continue;
    }
    const { id, name, month } = milestone as Record<string, unknown>;
    if (typeof id !== "string" || id.trim() === "" || Array.from(id).length > 100) {
      issues.push({ path: `${path}.id`, code: "invalid_milestone", message: "Milestone ID is required and cannot exceed 100 characters." });
      continue;
    }
    if (typeof name !== "string" || name.trim() === "" || Array.from(name).length > 80) {
      issues.push({ path: `${path}.name`, code: "invalid_milestone", message: "Milestone name is required and cannot exceed 80 characters." });
      continue;
    }
    const index = monthIndex(month);
    if (index === null || !validYear(index)) {
      issues.push({ path: `${path}.month`, code: "invalid_milestone", message: `${name} needs a month in YYYY-MM form between ${MIN_ANCHOR_YEAR} and ${MAX_ANCHOR_YEAR}.` });
      continue;
    }
    if (found.has(id)) {
      issues.push({ path: `${path}.id`, code: "duplicate_milestone", message: "Milestone IDs must be unique." });
      continue;
    }
    const key = name.trim().toLowerCase();
    if (names.has(key)) {
      issues.push({ path: `${path}.name`, code: "duplicate_milestone", message: `Two milestones are named ${name.trim()}. Give each a different name.` });
      continue;
    }
    names.add(key);
    found.set(id, { milestone: { id, name, month: month as string }, index });
  }
}

function offsetPhrase(offset: number) {
  if (offset === 0) return "at";
  const count = Math.abs(offset);
  return `${count} ${count === 1 ? "month" : "months"} ${offset < 0 ? "before" : "after"}`;
}

function monthIndex(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  return year * 12 + month - 1;
}

function validYear(index: number) {
  const year = Math.floor(index / 12);
  return year >= MIN_ANCHOR_YEAR && year <= MAX_ANCHOR_YEAR;
}

function monthFromIndex(index: number) {
  const year = Math.floor(index / 12);
  const month = index % 12 + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}
