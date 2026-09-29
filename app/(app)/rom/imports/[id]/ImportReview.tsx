"use client";

import { useMemo, useState } from "react";
import type { MarkupHistorySetup } from "@kulka/engine";

import { titleCase } from "@/lib/format/title-case";
import type { CostImportDetail, LineStatus, StagedLine } from "@/lib/rom/ingest";

import "../imports.css";

// The review screen LA-978 asks for: every staged line, its current match,
// a way to fix that match or exclude the line by hand, and an approve
// button that says how many lines it will promote before it runs. Nothing
// here decides a match on its own -- every remap this component can send is
// one a person picked from the list of canonical work items handed down
// from the server.
//
// LA-1016 adds one more thing a person can do with a line: send it to the
// GRs/GCs history instead of a work item, when it is a General Requirements
// or General Conditions figure. That stays open for an unmapped line after
// approval, because an unmapped line never became a benchmark.

export type CanonicalItemOption = { id: string; itemNumber: string; name: string };

const PER_SF = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const STATUS_LABEL: Record<LineStatus, string> = {
  staged: "Staged",
  unmapped: "Unmapped",
  approved: "Approved",
  excluded: "Excluded",
  markup: "GRs/GCs",
};

const STATUS_CHIP: Record<LineStatus, string> = {
  staged: "high",
  approved: "done",
  unmapped: "medium",
  excluded: "neutral",
  markup: "markup",
};

const SETUP_OPTIONS: { value: MarkupHistorySetup; label: string }[] = [
  { value: "both", label: "GRs & GCs Combined" },
  { value: "gc_only", label: "GCs Only" },
  { value: "gr_only", label: "GRs Only" },
];

const PERCENT = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function itemLabel(item: { itemNumber: string; name: string }): string {
  return `${item.itemNumber} — ${titleCase(item.name)}`;
}

function sumOf(lines: StagedLine[], status: LineStatus): number {
  return lines
    .filter((line) => line.status === status)
    .reduce((total, line) => total + line.valueUsdPerGsf, 0);
}

export function ImportReview({
  costImport,
  canonicalItems,
}: {
  costImport: CostImportDetail;
  canonicalItems: CanonicalItemOption[];
}) {
  const [lines, setLines] = useState<StagedLine[]>(costImport.lines);
  const [status, setStatus] = useState<CostImportDetail["status"]>(costImport.status);
  const [busyLineId, setBusyLineId] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [setups, setSetups] = useState<Record<string, MarkupHistorySetup>>({});

  const totals = useMemo(
    () => ({
      staged: sumOf(lines, "staged"),
      unmapped: sumOf(lines, "unmapped"),
      excluded: sumOf(lines, "excluded"),
      markup: sumOf(lines, "markup"),
    }),
    [lines],
  );

  const willPromote = lines.filter((line) => line.status === "staged").length;
  const locked = status === "approved";

  async function sendPatch(lineId: string, body: Record<string, unknown>) {
    setBusyLineId(lineId);
    setError(null);
    try {
      const response = await fetch(`/api/rom/imports/${costImport.id}/lines/${lineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody = await response.json();
      if (!response.ok) {
        setError(responseBody.error ?? "The line could not be changed.");
        return;
      }
      const updated: StagedLine = responseBody.line;
      setLines((current) => current.map((line) => (line.id === lineId ? updated : line)));
    } catch {
      setError("The site could not reach the server.");
    } finally {
      setBusyLineId(null);
    }
  }

  async function sendToMarkup(lineId: string) {
    const setup = setups[lineId] ?? "both";
    setBusyLineId(lineId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/rom/imports/${costImport.id}/lines/${lineId}/markup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setup }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "The line could not be sent to GRs/GCs.");
        return;
      }
      const updated: StagedLine = body.line;
      setLines((current) => current.map((line) => (line.id === lineId ? updated : line)));
      // LA-1389: a split budget's General Conditions is measured over trade
      // cost plus its General Requirements, so the notice names that base.
      const partner = body.partner ?? null;
      const base = partner && setup === "gc_only" ? "trade subtotal plus its General Requirements" : "trade subtotal";
      const remeasured =
        partner && partner.setup === "gc_only"
          ? ` General Conditions on this import is now ${PERCENT.format(partner.pctOfSubtotal)} of the trade subtotal plus General Requirements.`
          : "";
      setNotice(
        `Row ${updated.rowNumber} recorded as GRs/GCs: ${PER_SF.format(body.history.usdPerGsf)} / SF, ${PERCENT.format(body.history.pctOfSubtotal)} of this import's ${base}.${remeasured}`,
      );
    } catch {
      setError("The site could not reach the server.");
    } finally {
      setBusyLineId(null);
    }
  }

  async function approve() {
    setApproving(true);
    setError(null);
    try {
      const response = await fetch(`/api/rom/imports/${costImport.id}/approve`, {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "The import could not be approved.");
        return;
      }
      setStatus("approved");
    } catch {
      setError("The site could not reach the server.");
    } finally {
      setApproving(false);
    }
  }

  return (
    <>
      <div className="import-totals">
        <div className="stat">
          <span className="t-label">Staged, will promote</span>
          <span className="num">{PER_SF.format(totals.staged)} / SF</span>
        </div>
        <div className="stat">
          <span className="t-label">Unmapped</span>
          <span className="num">{PER_SF.format(totals.unmapped)} / SF</span>
        </div>
        <div className="stat">
          <span className="t-label">Excluded</span>
          <span className="num">{PER_SF.format(totals.excluded)} / SF</span>
        </div>
        <div className="stat">
          <span className="t-label">GRs / GCs</span>
          <span className="num">{PER_SF.format(totals.markup)} / SF</span>
        </div>
      </div>

      {error ? <p className="empty">{error}</p> : null}
      {notice ? <p className="empty">{notice}</p> : null}

      {lines.length === 0 ? (
        <p className="empty">This import has no lines.</p>
      ) : (
        <table className="board board--import-lines">
          <colgroup>
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>Row</th>
              <th>Description</th>
              <th>Division</th>
              <th className="right">$/SF</th>
              <th>Matched Item</th>
              <th className="right">Score</th>
              <th>Status</th>
              <th>Remap</th>
              <th></th>
              <th>GRs / GCs</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const busy = busyLineId === line.id;
              const canSendToMarkup =
                line.status === "unmapped" || (line.status === "staged" && !locked);
              return (
                <tr className={`row${line.status === "markup" ? " row--markup" : ""}`} key={line.id}>
                  <td className="num">{line.rowNumber}</td>
                  <td>{titleCase(line.rawDescription)}</td>
                  <td>{line.rawDivision ?? "—"}</td>
                  <td className="num right">{PER_SF.format(line.valueUsdPerGsf)}</td>
                  <td className="num">{itemLabel(line.candidateCanonicalItem)}</td>
                  <td className="num right">{line.candidateScore.toFixed(2)}</td>
                  <td>
                    <span className={`chip chip--${STATUS_CHIP[line.status]}`}>
                      <span className="dot" />
                      {STATUS_LABEL[line.status]}
                    </span>
                  </td>
                  <td>
                    <select
                      className="input"
                      value=""
                      disabled={locked || busy}
                      onChange={(event) => {
                        const canonicalItemId = event.target.value;
                        if (canonicalItemId) void sendPatch(line.id, { canonicalItemId });
                      }}
                    >
                      <option value="">Change match&hellip;</option>
                      {canonicalItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {itemLabel(item)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      className="btn btn--secondary"
                      type="button"
                      disabled={locked || busy || line.status === "excluded"}
                      onClick={() => void sendPatch(line.id, { exclude: true })}
                    >
                      Exclude
                    </button>
                  </td>
                  <td>
                    {canSendToMarkup ? (
                      <div className="markup-send">
                        <select
                          className="input"
                          aria-label="How this budget files GRs and GCs"
                          value={setups[line.id] ?? "both"}
                          disabled={busy}
                          onChange={(event) => {
                            const setup = event.target.value as MarkupHistorySetup;
                            setSetups((current) => ({ ...current, [line.id]: setup }));
                          }}
                        >
                          {SETUP_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <button
                          className="btn btn--secondary"
                          type="button"
                          disabled={busy}
                          onClick={() => void sendToMarkup(line.id)}
                        >
                          Send to GRs/GCs
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="import-approve">
        <button
          className="btn btn--primary"
          type="button"
          disabled={locked || approving || willPromote === 0}
          onClick={approve}
        >
          {locked
            ? "Approved"
            : approving
              ? "Approving…"
              : `Approve (${willPromote} ${willPromote === 1 ? "line" : "lines"} will promote)`}
        </button>
      </div>
    </>
  );
}
