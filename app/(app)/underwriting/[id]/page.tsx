import Link from "next/link";
import { notFound } from "next/navigation";

import { Sheet, Sep } from "@/components/Sheet";
import { Chip } from "@/components/Status";
import { getDb } from "@/lib/db";
import { getUnderwritingCase } from "@/lib/underwriting/cases";

export const dynamic = "force-dynamic";

const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function UnderwritingCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const savedCase = await getUnderwritingCase(getDb(), id);
  if (!savedCase) notFound();

  const missingFacts = [
    savedCase.proposedUnits,
    savedCase.averageUnitSquareFeet,
    savedCase.grossBuildingSquareFeet,
  ].filter((value) => value === undefined).length;

  return (
    <Sheet
      number={savedCase.sheetNumber}
      title={savedCase.name}
      actions={<Link className="btn btn--secondary" href="/underwriting">All cases</Link>}
      meta={
        <>
          <span>{savedCase.address}</span>
          <Sep />
          <span>Ground-up multifamily</span>
          <Sep />
          <span className="num">Updated {DATE.format(new Date(savedCase.updatedAt))}</span>
        </>
      }
      needsReview={missingFacts}
      reviewLabel="project facts missing"
    >
      <div className="record underwriting-record">
        <div className="margin" />
        <div className="col-field underwriting-decision-row">
          <div>
            <span className="t-label">Current state</span>
            <h2 className="t-1">The case is ready for assumptions.</h2>
            <p className="t-meta">No financial result exists until the calculation engine runs.</p>
          </div>
          <Chip status={savedCase.status} />
        </div>

        <div className="margin" />
        <div className="col-field record-section">
          <h3>Project facts</h3>
          <dl className="record-grid">
            <Fact label="Property address" value={savedCase.address} />
            <Fact label="Development type" value="Ground-up multifamily" />
            <Fact label="Proposed units" value={format(savedCase.proposedUnits)} number />
            <Fact label="Average unit size" value={format(savedCase.averageUnitSquareFeet, " SF")} number />
            <Fact label="Gross building area" value={format(savedCase.grossBuildingSquareFeet, " GSF")} number />
          </dl>
        </div>

        <div className="margin" />
        <div className="col-field record-section">
          <h3>Supplied assumptions</h3>
          {savedCase.assumptions.length === 0 ? (
            <div className="empty empty--inline"><p>No financial assumptions were supplied.</p></div>
          ) : (
            <table className="underwriting-assumptions">
              <thead>
                <tr><th>Assumption</th><th className="right">Value</th><th>Source</th><th>Date</th></tr>
              </thead>
              <tbody>
                {savedCase.assumptions.map((assumption) => (
                  <tr key={assumption.key}>
                    <td>{assumption.label}</td>
                    <td className="num right">{formatAssumption(assumption.value, assumption.unit)}</td>
                    <td>{assumption.sourceLabel}</td>
                    <td className="num">{assumption.sourceDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function Fact({ label, value, number = false }: { label: string; value: string; number?: boolean }) {
  return <div className="record-row"><dt className="t-label">{label}</dt><dd className={number ? "num" : undefined}>{value}</dd></div>;
}

function format(value?: number, suffix = "") {
  return value === undefined ? "Needs input" : `${NUMBER.format(value)}${suffix}`;
}

function formatAssumption(value: number, unit: string) {
  if (unit === "usd") return MONEY.format(value);
  if (unit === "usd_per_month") return `${MONEY.format(value)}/month`;
  if (unit === "usd_per_gross_square_foot") return `${MONEY.format(value)}/GSF`;
  if (unit === "percent") return `${NUMBER.format(value)}%`;
  return `${NUMBER.format(value)} ${unit}`;
}
