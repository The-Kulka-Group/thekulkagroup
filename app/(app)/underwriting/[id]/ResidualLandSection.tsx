"use client";

import {
  MAX_RESIDUAL_LAND_SOURCE_LABEL_LENGTH,
  RESIDUAL_LAND_INPUT_VERSION,
  RESIDUAL_LAND_TARGETS,
  type MonthlyCostLine,
  type PropertyReturnsEvidence,
  type ResidualLandPlan,
  type ResidualLandTarget,
} from "@kulka/engine";

export const RESIDUAL_LAND_TARGET_LABELS: Record<ResidualLandTarget, string> = {
  yield_on_cost: "Sale Yield on Cost",
  development_spread: "Development Spread",
  unlevered_xirr: "Unlevered XIRR",
  levered_xirr: "Levered XIRR",
};

/** The solve prices one land line with a fixed amount, because a derived line has no price of its own. */
export function residualLandLines(costLines: MonthlyCostLine[]) {
  return costLines.filter((line) => line.category === "land" && (line.basis === undefined || line.basis.type === "fixed"));
}

/**
 * The land price that meets a target return (LA-1975, LA-1979). The parent keeps the plan and sends it
 * with the sale plan, so a save and a run read one target.
 */
export function ResidualLandSection({ residualLand, setResidualLand, costLines, fieldErrors }: {
  residualLand?: ResidualLandPlan;
  setResidualLand: (plan?: ResidualLandPlan) => void;
  costLines: MonthlyCostLine[];
  fieldErrors: Record<string, string>;
}) {
  const landLines = residualLandLines(costLines);
  const update = (change: Partial<ResidualLandPlan>) => residualLand && setResidualLand({ ...residualLand, ...change });
  const updateEvidence = (change: Partial<PropertyReturnsEvidence>) => residualLand && update({ evidence: { ...residualLand.evidence, ...change } });
  const error = (path: string) => fieldErrors[`residualLand.${path}`];
  const spread = residualLand?.target === "development_spread";

  return <section className="underwriting-line-section" aria-labelledby="residual-land-heading">
    <h4 id="residual-land-heading">Residual Land</h4>
    <p className="t-meta">The solve finds the highest price for one land line, to the cent, at which the run still meets the target. Every other input stays as saved, and the stated run does not change. A stated credited land value stays fixed and caps the price.</p>
    <label className="field-label t-label underwriting-checkbox"><input type="checkbox" checked={Boolean(residualLand)} onChange={(event) => setResidualLand(event.target.checked ? blankPlan(landLines) : undefined)} /> Solve for Residual Land</label>
    {residualLand ? <>
      {landLines.length === 0 ? <p className="input-error" role="alert">The cost schedule has no land line with a fixed amount. Add one in the Land category to solve for its price.</p> : null}
      <div className="underwriting-form-grid underwriting-capital-controls">
        <label className="field-label t-label" htmlFor="residual-land-target">Target<select id="residual-land-target" className="input" value={residualLand.target} onChange={(event) => update({ target: event.target.value as ResidualLandTarget })} aria-invalid={Boolean(error("target"))}>{RESIDUAL_LAND_TARGETS.map((target) => <option key={target} value={target}>{RESIDUAL_LAND_TARGET_LABELS[target]}</option>)}</select><FieldError error={error("target")} /></label>
        <label className="field-label t-label" htmlFor="residual-land-target-value">Target Value<span className="underwriting-money-input"><input id="residual-land-target-value" className="input num" type="number" step={spread ? "1" : "0.000001"} value={residualLand.targetValue} onChange={(event) => update({ targetValue: event.target.value === "" ? blank() : Number(event.target.value) })} aria-invalid={Boolean(error("targetValue"))} aria-describedby={error("targetValue") ? "residual-land-target-value-error" : undefined} /><span>{spread ? "bps" : "%"}</span></span><FieldError id="residual-land-target-value-error" error={error("targetValue")} /></label>
        <label className="field-label t-label" htmlFor="residual-land-line">Land Line to Price<select id="residual-land-line" className="input" value={residualLand.landLineId} onChange={(event) => update({ landLineId: event.target.value })} aria-invalid={Boolean(error("landLineId"))} aria-describedby={error("landLineId") ? "residual-land-line-error" : undefined}><option value="">Choose a Land Line</option>{landLines.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}</select><FieldError id="residual-land-line-error" error={error("landLineId")} /></label>
      </div>
      <div className="underwriting-edit-table-wrap"><table className="underwriting-operations-table underwriting-assumption-evidence"><thead><tr><th>Residual Land Target</th><th>Source Label</th><th>Source Date</th><th>Review State</th></tr></thead><tbody>
        <tr><th scope="row">Target</th>
          <td><input className="input" aria-label="Residual land target source label" maxLength={MAX_RESIDUAL_LAND_SOURCE_LABEL_LENGTH} value={residualLand.evidence.sourceLabel ?? ""} onChange={(event) => updateEvidence({ sourceLabel: event.target.value || undefined })} aria-invalid={Boolean(error("evidence.sourceLabel"))} /><FieldError error={error("evidence.sourceLabel") ?? error("evidence")} /></td>
          <td><input className="input" type="date" aria-label="Residual land target source date" value={residualLand.evidence.sourceDate ?? ""} onChange={(event) => updateEvidence({ sourceDate: event.target.value || undefined })} aria-invalid={Boolean(error("evidence.sourceDate"))} /><FieldError error={error("evidence.sourceDate")} /></td>
          <td><select className="input" aria-label="Residual land target review state" value={residualLand.evidence.reviewState} onChange={(event) => updateEvidence({ reviewState: event.target.value as "working" | "done" })}><option value="working">Working on It</option><option value="done">Done</option></select><FieldError error={error("evidence.reviewState")} /></td>
        </tr>
      </tbody></table></div>
      <FieldError error={error("residualLandInputVersion") ?? fieldErrors.residualLand} />
    </> : null}
  </section>;
}

function blankPlan(landLines: MonthlyCostLine[]): ResidualLandPlan {
  return {
    residualLandInputVersion: RESIDUAL_LAND_INPUT_VERSION,
    target: "yield_on_cost",
    targetValue: blank(),
    landLineId: landLines.length === 1 ? landLines[0].id : "",
    evidence: { reviewState: "working" },
  };
}

/** An empty box stays empty so the engine names the missing target, in place of a silent zero. */
function blank() {
  return "" as unknown as number;
}

function FieldError({ id, error }: { id?: string; error?: string }) {
  return error ? <span id={id} className="input-error" role="alert">{error}</span> : null;
}
