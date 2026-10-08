"use client";

import {
  GROWTH_CATEGORIES,
  GROWTH_CATEGORY_LABELS,
  MAX_GROWTH_YEARS,
  MAX_OPERATION_SOURCE_LABEL_LENGTH,
  type CategoryGrowth,
} from "@kulka/engine";

/**
 * Optional growth by category (LA-1838). Off, rent and other income grow at the income rate and
 * expenses at the expense rate. The editor keeps every category on the same number of years; a
 * shorter saved list is padded with its last rate, which the engine reads the same way.
 */
export function GrowthSection({ growth, setGrowth, incomePercent, expensePercent, fieldErrors }: {
  growth?: CategoryGrowth;
  setGrowth: (value?: CategoryGrowth) => void;
  incomePercent: number;
  expensePercent: number;
  fieldErrors: Record<string, string>;
}) {
  // A block saved before commercial rent existed has no commercial list, and the engine grows commercial rent at the market rent rates.
  const savedRates = (category: (typeof GROWTH_CATEGORIES)[number]) => growth![category] ?? growth!.marketRentPercent;
  const years = growth ? Math.max(...GROWTH_CATEGORIES.map((category) => savedRates(category).length)) : 0;
  const ratesFor = (category: (typeof GROWTH_CATEGORIES)[number]) => {
    const rates = savedRates(category);
    return [...rates, ...Array(years - rates.length).fill(rates.at(-1) ?? 0)];
  };
  const setYears = (count: number) => setGrowth({
    ...growth!,
    ...Object.fromEntries(GROWTH_CATEGORIES.map((category) => {
      const rates = ratesFor(category);
      return [category, count > rates.length ? [...rates, rates.at(-1) ?? 0] : rates.slice(0, count)];
    })),
  });
  return (
    <section className="underwriting-line-section" aria-labelledby="category-growth-heading">
      <h4 id="category-growth-heading">Growth by Category</h4>
      <p className="t-meta">Separate yearly rates for market rent, affordable rent, commercial rent, other income and operating expenses. Leave it off to grow rent and other income at the income rate and expenses at the expense rate.</p>
      <label className="field-label t-label underwriting-checkbox"><input type="checkbox" checked={Boolean(growth)} onChange={(event) => setGrowth(event.target.checked ? {
        marketRentPercent: [incomePercent],
        affordableRentPercent: [incomePercent],
        otherIncomePercent: [incomePercent],
        operatingExpensePercent: [expensePercent],
        commercialRentPercent: [incomePercent],
        reviewState: "working",
      } : undefined)} /> Add Growth by Category</label>
      {growth ? <>
        <p className="t-meta">These rates replace Annual Income Growth and Annual Expense Growth. Year 1 applies from the first anniversary of the growth start month, and the last year&apos;s rate carries forward. Affordable rent covers workforce and affordable unit types. Commercial rent grows the base rent of every commercial space. Capital expenditures grow with operating expenses, and a property tax schedule keeps its own rate growth.</p>
        <div className="underwriting-edit-table-wrap">
          <table className="underwriting-operations-table underwriting-category-growth">
            <thead><tr><th>Category</th>{Array.from({ length: years }, (_, index) => <th key={index} className="right">Year {index + 1}</th>)}</tr></thead>
            <tbody>{GROWTH_CATEGORIES.map((category) => (
              <tr key={category}>
                <th scope="row">{GROWTH_CATEGORY_LABELS[category]}<FieldError error={fieldErrors[`categoryGrowth.${category}`]} /></th>
                {ratesFor(category).map((rate, index) => {
                  const path = `categoryGrowth.${category}.${index}`;
                  return <td key={index}><input id={controlId(path)} className="input num right" type="number" min="0" max="100" step="0.01" aria-label={`${GROWTH_CATEGORY_LABELS[category]} year ${index + 1} percent`} value={rate} onChange={(event) => setGrowth({ ...growth, [category]: ratesFor(category).map((value, position) => position === index ? Number(event.target.value) : value) })} aria-invalid={Boolean(fieldErrors[path])} /><FieldError error={fieldErrors[path]} /></td>;
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="underwriting-form-actions">
          <button type="button" className="btn btn--secondary" disabled={years >= MAX_GROWTH_YEARS} onClick={() => setYears(years + 1)}>Add Year</button>
          <button type="button" className="btn btn--secondary" disabled={years <= 1} onClick={() => setYears(years - 1)}>Remove Last Year</button>
        </div>
        <EvidenceRow item={growth} onChange={(change) => setGrowth({ ...growth, ...change })} fieldErrors={fieldErrors} />
      </> : null}
    </section>
  );
}

function EvidenceRow({ item, onChange, fieldErrors }: {
  item: CategoryGrowth;
  onChange: (change: Partial<CategoryGrowth>) => void;
  fieldErrors: Record<string, string>;
}) {
  const label = "Growth by Category";
  return (
    <div className="underwriting-edit-table-wrap">
      <table className="underwriting-operations-table underwriting-assumption-evidence">
        <thead><tr><th>Input</th><th>Source Label</th><th>Source Date</th><th>Review State</th></tr></thead>
        <tbody><tr>
          <th scope="row">{label}</th>
          <td><input className="input" id={controlId("categoryGrowth.sourceLabel")} maxLength={MAX_OPERATION_SOURCE_LABEL_LENGTH} aria-label={`${label} source label`} value={item.sourceLabel ?? ""} onChange={(event) => onChange({ sourceLabel: event.target.value || undefined })} aria-invalid={Boolean(fieldErrors["categoryGrowth.sourceLabel"])} /><FieldError error={fieldErrors["categoryGrowth.sourceLabel"]} /></td>
          <td><input className="input" id={controlId("categoryGrowth.sourceDate")} type="date" aria-label={`${label} source date`} value={item.sourceDate ?? ""} onChange={(event) => onChange({ sourceDate: event.target.value || undefined })} aria-invalid={Boolean(fieldErrors["categoryGrowth.sourceDate"])} /><FieldError error={fieldErrors["categoryGrowth.sourceDate"]} /></td>
          <td><select className="input" id={controlId("categoryGrowth.reviewState")} aria-label={`${label} review state`} value={item.reviewState} onChange={(event) => onChange({ reviewState: event.target.value as CategoryGrowth["reviewState"] })}><option value="working">Working on It</option><option value="done">Done</option></select></td>
        </tr></tbody>
      </table>
    </div>
  );
}

function FieldError({ error }: { error?: string }) {
  return error ? <span className="input-error" role="alert">{error}</span> : null;
}

function controlId(path: string) {
  return `apartment-operations-${path.replaceAll(".", "-")}`;
}
