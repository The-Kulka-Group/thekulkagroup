// LA-1281, LA-1282. The code tables the E-1 and M-1 rules read, kept apart
// from the rules so the Design and Engineering card can draw them on the
// page without pulling in the database. Pure constants, no imports.

/** NEC 240.6(A) standard service ratings from 400 A up (docs/precon/criteria/la-776-electrical-service-size.md). */
export const SERVICE_RATINGS = [400, 450, 500, 600, 700, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000] as const;

export type GlazingBand = "standard" | "elevated";

/**
 * Each glazing band's window-to-wall ratio and the DOE apartment prototype it
 * maps to (docs/precon/criteria/la-777-hvac-tonnage.md). The elevated band
 * sits at New York's 30 percent prescriptive cap (2025 ECCCNYS C402.5.1).
 */
export const GLAZING = {
  standard: { percent: 19.9, model: "Mid-Rise Apartment", text: "Standard Glazing Band" },
  elevated: { percent: 29.8, model: "High-Rise Apartment", text: "Elevated Glazing Band" },
} as const;

/**
 * Gross square feet per ton of cooling, from DOE's IECC 2021 apartment
 * prototypes: every apartment's cooling coil summed, DOE's 1.2 sizing factor
 * included. Zone 4 runs New York JFK weather, zone 5 Buffalo, zone 6 DOE's
 * representative Rochester, Minnesota.
 */
export const GSF_PER_TON: Record<4 | 5 | 6, Record<GlazingBand, number>> = {
  4: { standard: 688, elevated: 609 },
  5: { standard: 701, elevated: 619 },
  6: { standard: 672, elevated: 584 },
};
