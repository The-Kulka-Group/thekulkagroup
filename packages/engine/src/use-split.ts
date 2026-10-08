import { residentialAreaSf, type ApartmentOperationsInputs, type MonthlyApartmentOperations } from "./apartment-operations";
import { resolveSpaces } from "./commercial-operations";

/*
 * LA-1870: net operating income by use, for pricing each use at its own cap rate. A month already
 * reports residential and commercial NOI on the tax the property pays. A sale or a loan test on full
 * tax adds the abatement back as extra tax, and that tax lands on each use in proportion to the
 * share of the property tax its tenants reimburse. A case with no commercial block carries none of it.
 */

export type UseSplitField = "netOperatingIncome" | "operatingCashFlow";
export type UseSplitTaxBasis = "scheduled" | "full";

export type UseSplit = {
  residentialCents: number;
  commercialCents: number;
  totalCents: number;
};

const cents = (value: number) => Math.round(value * 100);

/**
 * The share of the property tax the commercial use carries in each month, as a percent from 0 to
 * 100: the sum of the entered or area-based shares of every started property tax recovery. Spaces
 * pay no more than the whole tax, which validation already enforces.
 */
export function commercialTaxSharePercentFor(input: ApartmentOperationsInputs): (month: string) => number {
  if (!input.commercial) return () => 0;
  const shares = resolveSpaces(input.commercial, input.milestones, residentialAreaSf(input)).flatMap((space) =>
    space.recoveries
      .filter(({ recovery }) => recovery.basis.kind === "property_tax")
      .map(({ sharePercent }) => ({ startIndex: space.leaseStartIndex, sharePercent })));
  return (month) => {
    const [year, monthNumber] = month.split("-").map(Number);
    const index = year * 12 + monthNumber - 1;
    return Math.min(100, shares.reduce((total, share) => index >= share.startIndex ? total + share.sharePercent : total, 0));
  };
}

/**
 * Sums NOI by use over `months`. `operatingCashFlow` takes the capital expenditures out of the
 * residential use, which is the only use that carries them. On the full tax basis each month's
 * added tax is split by the commercial share, and the commercial part is rounded to the cent first,
 * so the two uses always add to the total.
 */
export function splitNoiByUse(
  months: MonthlyApartmentOperations[],
  field: UseSplitField,
  taxBasis: UseSplitTaxBasis,
  commercialTaxSharePercent: (month: string) => number,
): UseSplit {
  let residentialCents = 0;
  let commercialCents = 0;
  for (const month of months) {
    let residential = cents(month.residentialNetOperatingIncome) - (field === "operatingCashFlow" ? cents(month.capitalExpenditures) : 0);
    let commercial = cents(month.commercialNetOperatingIncome);
    if (taxBasis === "full") {
      const added = cents(month.fullPropertyTax) - cents(month.propertyTax);
      const commercialAdded = Math.round(added * commercialTaxSharePercent(month.month) / 100);
      commercial -= commercialAdded;
      residential -= added - commercialAdded;
    }
    residentialCents += residential;
    commercialCents += commercial;
  }
  return { residentialCents, commercialCents, totalCents: residentialCents + commercialCents };
}

/** Value of each use at its own cap rate, in cents, each rounded once. */
export function valueByUse(split: Pick<UseSplit, "residentialCents" | "commercialCents">, residentialCapPercent: number, commercialCapPercent: number) {
  const residentialValueCents = Math.round(split.residentialCents / (residentialCapPercent / 100));
  const commercialValueCents = Math.round(split.commercialCents / (commercialCapPercent / 100));
  return { residentialValueCents, commercialValueCents, totalValueCents: residentialValueCents + commercialValueCents };
}
