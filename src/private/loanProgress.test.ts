import { describe, it, expect } from "vitest";
import { loanProgress } from "./loanProgress";
import type { Snapshot } from "./domain";
import type { LoanDocumentTerms } from "./loanDocuments";
const loan = {
  id: "synthetic",
  principal_paise: 90000,
  outstanding_paise: 75000,
  apr: 0,
  tenure_months: 9,
  start_date: "2026-11-01",
  progress_first_due_on: "2026-08-31",
  payments_reported_through: "2026-11-21",
} as Snapshot["loans"][number];
const terms = {
  original_principal_paise: 120000,
  original_months: 12,
  nominal_rate: 0,
  first_due_on: "2026-09-01",
  schedule: [],
  schedule_origin: "none",
} as unknown as LoanDocumentTerms;
describe("loan progress reporting", () => {
  it("uses corrected first dates, clamps months and counts only due instalments", () => {
    const p = loanProgress(loan, terms, "2026-11-21");
    expect(p.paid).toBe(3);
    expect(p.remaining).toBe(9);
    expect(p.first).toBe("2026-08-31");
    expect(p.schedule[1].date).toBe("2026-09-30");
    expect(p.payoff).toBe("2027-07-31");
    expect(p.principal_reduction).toBe(45000);
  });
  it("does not infer reported payments from a balance, future dates or closed status", () => {
    expect(
      loanProgress({ ...loan, payments_reported_through: null }, terms).paid,
    ).toBeNull();
    expect(
      loanProgress(
        { ...loan, payments_reported_through: "2027-12-01" },
        terms,
        "2026-08-30",
      ).paid,
    ).toBe(0);
    expect(
      loanProgress(
        { ...loan, payments_reported_through: "2030-01-01" },
        terms,
        "2030-01-01",
      ).paid,
    ).toBe(12);
  });
  it("falls back to tracking basis without original terms and avoids negative progress", () => {
    expect(loanProgress(loan, null).original).toBe(90000);
    expect(
      loanProgress({ ...loan, outstanding_paise: 130000 }, terms)
        .principal_reduction,
    ).toBeNull();
    expect(
      loanProgress({ ...loan, progress_first_due_on: null }, null).payoff,
    ).toBeNull();
  });
  it("keeps reviewed lender schedule values separate from reducing-balance estimates", () => {
    const document = {
      ...terms,
      schedule_origin: "lender",
      original_months: 1,
      schedule: [
        {
          sequence: 1,
          opening_paise: 120000,
          principal_paise: 120000,
          interest_paise: 1500,
          payment_paise: 121500,
          source_page: 1,
        },
      ],
    } as LoanDocumentTerms;
    const p = loanProgress(loan, document);
    expect(p.reviewed).toBe(true);
    expect(p.schedule[0]).toMatchObject({
      principal_paise: 120000,
      interest_paise: 1500,
      balance_paise: 0,
    });
    expect(loan.outstanding_paise).toBe(75000);
  });
});
