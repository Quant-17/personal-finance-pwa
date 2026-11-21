import { describe, it, expect } from "vitest";
import {
  financialYear,
  holdingTerms,
  portfolioSummary,
  settledEntry,
  investmentEntrySchema,
} from "./investments";
import { investmentHoldingSchema, indiaDate, moneyInput } from "./domain";
const holding = investmentHoldingSchema.parse({
  id: "10000000-0000-4000-8000-000000000001",
  name: "Synthetic NPS",
  scheme: "nps_tier_1",
  provider: "Fixture CRA",
  funding_source: "self",
  locked_until: null,
  account_id: null,
  archived: false,
  revision: 1,
  value_paise: "1000029",
  valued_on: "2025-04-01",
  valuation_id: "10000000-0000-4000-8000-000000000002",
  self_paise: "20029",
  employer_paise: "0",
  withdrawn_paise: "0",
  fy_self_paise: "20029",
  fy_employer_paise: "0",
  activity_after_valuation: 1,
});
describe("manual savings and investment tracking", () => {
  it.each([
    ["2026-03-31", "2025-04-01", "2026-03-31", "FY 2025–26"],
    ["2026-04-01", "2026-04-01", "2027-03-31", "FY 2026–27"],
    ["2024-02-29", "2023-04-01", "2024-03-31", "FY 2023–24"],
  ])(
    "uses the India April-to-March financial year for %s",
    (date, start, end, label) =>
      expect(financialYear(date)).toEqual({ start, end, label }),
  );
  it("keeps paise exact when aggregating portfolio values", () => {
    expect(
      portfolioSummary([
        holding,
        {
          ...holding,
          id: "10000000-0000-4000-8000-000000000003",
          value_paise: 71,
          scheme: "ppf",
        },
      ]).value,
    ).toBe(1000100);
    expect(moneyInput("0.29")).toBe(29);
  });
  it("counts archived assets but avoids adding linked account values twice", () => {
    const summary = portfolioSummary([
      holding,
      {
        ...holding,
        archived: true,
        account_id: "10000000-0000-4000-8000-000000000003",
      },
    ]);
    expect(summary.value).toBe(2000058);
    expect(summary.additionalNetWorth).toBe(1000029);
  });
  it("does not infer reported value or returns from contribution history", () => {
    const changed = { ...holding, self_paise: 80000, fy_self_paise: 80000 };
    expect(portfolioSummary([changed]).value).toBe(holding.value_paise);
    expect(portfolioSummary([changed]).self).toBe(80000);
  });
  it("accepts zero valuations but rejects zero contributions and future activity", () => {
    expect(settledEntry("valuation", 0, indiaDate(), "").amount_paise).toBe(0);
    expect(() => settledEntry("self", 0, indiaDate(), "")).toThrow();
    expect(() => settledEntry("employer", 100, "2999-01-01", "")).toThrow(
      "current or past",
    );
  });
  it("rejects invalid dates, negative values and unsafe amounts", () => {
    for (const [amount, date] of [
      [-1, "2025-04-01"],
      [1e12 + 1, "2025-04-01"],
      [100, "2025-02-30"],
    ] as const)
      expect(() => settledEntry("valuation", amount, date, "")).toThrow();
    expect(
      investmentHoldingSchema.safeParse({ ...holding, value_paise: -1 })
        .success,
    ).toBe(false);
  });
  it("validates metadata without accepting arbitrary account identifiers or raw data", () => {
    const terms = {
      name: "  Fixture PPF  ",
      scheme: "ppf",
      provider: "Fixture bank",
      funding_source: "self",
      locked_until: "2040-03-31",
      account_id: null,
      archived: false,
    };
    expect(holdingTerms.parse(terms).name).toBe("Fixture PPF");
    expect(
      holdingTerms.safeParse({ ...terms, raw_statement: "private" }).success,
    ).toBe(false);
    expect(
      holdingTerms.safeParse({ ...terms, account_id: "not-a-uuid" }).success,
    ).toBe(false);
  });
  it("rejects malformed history rather than rendering untrusted financial values", () => {
    expect(
      investmentEntrySchema.safeParse({
        id: holding.id,
        holding_id: holding.id,
        kind: "employer",
        amount_paise: "29",
        occurred_on: "2025-04-01",
        note: "",
        created_at: "",
      }).success,
    ).toBe(false);
  });
});
