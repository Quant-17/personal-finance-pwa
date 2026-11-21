import { z } from "zod";
import { indiaDate, safeTotal, MONEY_LIMIT } from "./domain";
import type { InvestmentHolding } from "./domain";
export const schemeNames = {
  nps_tier_1: "NPS · Tier I",
  nps_tier_2: "NPS · Tier II",
  ppf: "PPF",
  epf: "EPF / EPFO",
  other: "Other investment",
} as const;
export const fundingNames = {
  self: "Self-funded",
  payroll: "Deducted through payroll",
  mixed: "Mixed funding",
} as const;
export const entryNames = {
  valuation: "Reported valuation",
  self: "Your contribution",
  employer: "Employer contribution",
  withdrawal: "Withdrawal",
} as const;
export function financialYear(date = indiaDate()) {
  const year =
    Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 4 ? 1 : 0);
  return {
    start: `${year}-04-01`,
    end: `${year + 1}-03-31`,
    label: `FY ${year}–${String(year + 1).slice(-2)}`,
  };
}
export function portfolioSummary(holdings: InvestmentHolding[]) {
  return {
    value: safeTotal(holdings.map((h) => h.value_paise)),
    additionalNetWorth: safeTotal(
      holdings.filter((h) => !h.account_id).map((h) => h.value_paise),
    ),
    self: safeTotal(holdings.map((h) => h.fy_self_paise)),
    employer: safeTotal(holdings.map((h) => h.fy_employer_paise)),
    allocation: Object.entries(schemeNames)
      .map(([scheme, name]) => ({
        scheme,
        name,
        value: safeTotal(
          holdings.filter((h) => h.scheme === scheme).map((h) => h.value_paise),
        ),
      }))
      .filter((g) => g.value > 0),
  };
}
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T00:00:00Z");
    return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === s;
  }, "Use a real calendar date.");
export const holdingTerms = z
  .object({
    name: z.string().trim().min(1).max(80),
    scheme: z.enum(["nps_tier_1", "nps_tier_2", "ppf", "epf", "other"]),
    provider: z.string().trim().max(80),
    funding_source: z.enum(["self", "payroll", "mixed"]),
    locked_until: date.nullable(),
    account_id: z.string().uuid().nullable(),
    archived: z.boolean(),
  })
  .strict();
export const investmentEntrySchema = z
  .object({
    id: z.string().uuid(),
    holding_id: z.string().uuid(),
    kind: z.enum(["valuation", "self", "employer", "withdrawal"]),
    amount_paise: z.number().int().min(0).max(MONEY_LIMIT),
    occurred_on: date,
    note: z.string().max(160),
    created_at: z.string(),
  })
  .refine(
    (e) => e.kind === "valuation" || e.amount_paise > 0,
    "Contributions and withdrawals must be positive.",
  );
export type InvestmentEntry = z.infer<typeof investmentEntrySchema>;
export function settledEntry(
  kind: string,
  amount: number,
  occurred: string,
  note: string,
) {
  const parsed = investmentEntrySchema.parse({
    id: "00000000-0000-4000-8000-000000000001",
    holding_id: "00000000-0000-4000-8000-000000000002",
    kind,
    amount_paise: amount,
    occurred_on: occurred,
    note,
    created_at: "",
  });
  if (occurred > indiaDate())
    throw new Error("Use a current or past statement/activity date.");
  return parsed;
}
export function investmentError(code?: string) {
  return code === "40001"
    ? "This holding changed elsewhere. Close and reopen before saving."
    : code === "23505"
      ? "That investment account is already linked to another holding."
      : code === "22003"
        ? "The change would exceed the supported financial totals. Nothing was saved."
        : "Could not save this change. Review the fields, check connectivity and retry. An unchanged retry will not post twice.";
}
