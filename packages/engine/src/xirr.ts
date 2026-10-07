/*
 * Actual-day XIRR over 365 on dated cent amounts (xirr_actual_365.v1). Property returns and the
 * partnership waterfall (LA-1863) share it so every IRR in a run uses one convention.
 */

export type XirrResult =
  | { status: "ok"; rate: number; residualCents: number; toleranceCents: number }
  | { status: "no_root" | "convergence" };

export type DatedCents = { date: string; amountCents: number };

export function xirr(cashFlow: DatedCents[]): XirrResult {
  if (!cashFlow.some(({ amountCents }) => amountCents < 0) || !cashFlow.some(({ amountCents }) => amountCents > 0)) return { status: "no_root" };
  const first = Date.parse(`${cashFlow[0].date}T00:00:00.000Z`);
  const timed = cashFlow.map(({ date, amountCents }) => ({ amountCents, years: (Date.parse(`${date}T00:00:00.000Z`) - first) / 86_400_000 / 365 }));
  const toleranceCents = Math.max(0.01, cashFlow.reduce((total, item) => total + Math.abs(item.amountCents), 0) * 1e-10);
  const accept = (rate: number): XirrResult | undefined => {
    const residualCents = xnpv(timed, rate);
    return Number.isFinite(residualCents) && Math.abs(residualCents) <= toleranceCents
      ? { status: "ok", rate, residualCents, toleranceCents }
      : undefined;
  };
  let rate = 0.1;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const base = 1 + rate;
    if (base <= 0) break;
    const value = xnpv(timed, rate);
    const accepted = accept(rate);
    if (accepted) return accepted;
    const derivative = timed.reduce((total, item) => total - item.years * item.amountCents / base ** (item.years + 1), 0);
    if (!Number.isFinite(derivative) || Math.abs(derivative) < 1e-12) break;
    const next = rate - value / derivative;
    if (!Number.isFinite(next) || next <= -0.999999999) break;
    if (Math.abs(next - rate) <= 1e-12) {
      const acceptedNext = accept(next);
      if (acceptedNext) return acceptedNext;
      break;
    }
    rate = next;
  }
  const candidates: Array<{ low: number; high: number }> = [];
  let priorRate = Math.expm1(-20);
  let priorValue = xnpv(timed, priorRate);
  for (let logBase = -19.75; logBase <= 14; logBase += 0.25) {
    const currentRate = Math.expm1(logBase);
    const currentValue = xnpv(timed, currentRate);
    if (Number.isFinite(priorValue) && Number.isFinite(currentValue) && priorValue * currentValue <= 0) candidates.push({ low: priorRate, high: currentRate });
    priorRate = currentRate;
    priorValue = currentValue;
  }
  const bracket = candidates.sort((a, b) => Math.abs((a.low + a.high) / 2 - 0.1) - Math.abs((b.low + b.high) / 2 - 0.1))[0];
  if (!bracket) return { status: "convergence" };
  let { low, high } = bracket;
  let lowValue = xnpv(timed, low);
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const middle = (low + high) / 2;
    const value = xnpv(timed, middle);
    const accepted = accept(middle);
    if (accepted) return accepted;
    if (Math.abs(high - low) <= 1e-12) break;
    if (lowValue * value <= 0) high = middle;
    else { low = middle; lowValue = value; }
  }
  return { status: "convergence" };
}

export function xnpv(cashFlow: Array<{ amountCents: number; years: number }>, rate: number) {
  return cashFlow.reduce((total, item) => total + item.amountCents / (1 + rate) ** item.years, 0);
}

export function yearsFrom(firstDate: string, date: string) {
  return (Date.parse(`${date}T00:00:00.000Z`) - Date.parse(`${firstDate}T00:00:00.000Z`)) / 86_400_000 / 365;
}
