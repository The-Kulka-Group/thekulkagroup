import { PARTNERSHIP_INPUT_VERSION, type PartnershipPlan } from "../partnership-waterfall";

/*
 * LA-1863: the v2.98 public sample's single promote (Underwriting rows 233 to 252) as engine terms.
 *
 * GP 10 percent and LP 90 percent fund every negative levered month (H234, H235). The first hurdle is
 * a 9 percent LP IRR with no promote (F239, G239), which returns capital inside it, so there is no
 * separate preferred return block. The 12 and 15 percent hurdles carry 15 and 30 percent promotes
 * (F240:G241), and the final split a 40 percent promote (G242), each on a 90 percent LP base share
 * (H240:H242 add the promote to the GP's 10 percent of the rest). The GP catch-up flag (D239) is off
 * in effect, because the first tier's GP share equals its funding share (EV213).
 *
 * The workbook also pays the GP an asset management fee before the waterfall (E227, FA202, FA216):
 * 0.4 percent of total project cost a year, monthly from the first stabilized month (G227, month 33)
 * to the sale. The engine has no fee module, so the full run leaves it out and the replay test adds it.
 */

const evidence = { sourceLabel: "Apartment Development Model v2.98, Underwriting rows 233 to 252", sourceDate: "2026-10-07", reviewState: "done" as const };

export const APARTMENT_DEVELOPMENT_V2_98_PARTNERSHIP: PartnershipPlan = {
  partnershipInputVersion: PARTNERSHIP_INPUT_VERSION,
  lpFundingSharePercent: 90,
  fundingOrder: "pari_passu",
  tiers: [
    { lpIrrHurdlePercent: 9, promotePercent: 0, lpBaseSharePercent: 90 },
    { lpIrrHurdlePercent: 12, promotePercent: 15, lpBaseSharePercent: 90 },
    { lpIrrHurdlePercent: 15, promotePercent: 30, lpBaseSharePercent: 90 },
  ],
  finalSplit: { promotePercent: 40, lpBaseSharePercent: 90 },
  partnershipEvidence: { funding: evidence, promoteTiers: evidence },
};

/** Underwriting E227 rounded to cents, and its first month (G227) counted from the workbook's month 0. */
export const APARTMENT_DEVELOPMENT_V2_98_ASSET_MANAGEMENT_FEE = { monthly: 20_361.71, firstMonthIndex: 33 } as const;

/** Saved results in golden-tests.json (Underwriting I229, I230, I247, I252). */
export const APARTMENT_DEVELOPMENT_V2_98_WATERFALL_EXPECTED = {
  lpNetXirr: 0.1334536850452423,
  gpNetXirr: 0.252662569284439,
  distributionTotal: 34_469_792.30410923,
  partnershipNetProfit: 13_089_945.14686824,
} as const;
