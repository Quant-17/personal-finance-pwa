import { describe, it, expect } from "vitest";
import {
  documentMoney,
  extractLoanDocument,
  documentBalance,
  instalmentDate,
  loanDocumentSchema,
} from "./loanDocuments";
const page = (text: string) => [{ number: 1, text }];
const cs = `CRED App / Credit Saison
1 Sanctioned Loan amount (in Rupees) 12000.00
Interest rate 0%
Annual Percentage Rate (APR) 3.25%
Loan tenure (in months) 2
Monthly Fixed Repayments 2 6,000 31/01/2025
Detailed Repayment Charges
1 6000.00 6000.00 0.00 6000.00
2 0.00 6000.00 0.00 6000.00`;
const terms = {
  name: "Fixture loan",
  provider: "credit_saison",
  source_sha256: "a".repeat(64),
  source_page_count: 1,
  original_principal_paise: 1200000,
  original_months: 2,
  nominal_rate: 0,
  disclosure_apr: 3.25,
  net_disbursed_paise: null,
  fees_paise: null,
  reported_emi_paise: 600000,
  current_outstanding_paise: 600000,
  remaining_months: 1,
  as_of: "2025-02-01",
  paid_through: "2025-02-01",
  first_due_on: "2025-01-31",
  balance_basis: "confirmed_schedule",
  card_account_id: null,
  schedule_origin: "lender",
  schedule: extractLoanDocument(page(cs)).schedule,
  source_pages: {
    principal: 1,
    rate: 1,
    apr: 1,
    emi: 1,
    tenure: 1,
    first_due: 1,
  },
};
describe("local loan document review", () => {
  it("parses paise without binary rounding", () => {
    expect(documentMoney("1,234.57")).toBe(123457);
    expect(documentMoney("12.345")).toBeNull();
    expect(documentMoney("-10")).toBeNull();
    expect(documentMoney("1,,234")).toBeNull();
    expect(documentMoney("1,23,456.78")).toBe(12345678);
  });
  it("keeps nominal interest separate from disclosed APR", () => {
    const r = extractLoanDocument(page(cs));
    expect(r.rate.value).toBe(0);
    expect(r.apr.value).toBe(3.25);
    expect(r.principal.value).toBe(1200000);
    expect(r.emi.value).toBe(600000);
  });
  it("converts Saison closing-principal columns to opening balances", () => {
    const r = extractLoanDocument(page(cs));
    expect(r.schedule.map((s) => s.opening_paise)).toEqual([1200000, 600000]);
    expect(loanDocumentSchema.parse(terms).schedule).toHaveLength(2);
  });
  it("does not take a KFS cross-reference number or legal prose as principal", () => {
    const r = extractLoanDocument(
      page(
        cs +
          "\nSanctioned Loan amount (in Rupees) ( Sl no. 1 of the KFS\nLoan Amount on demand within 30 days",
      ),
    );
    expect(r.principal.value).toBe(1200000);
  });
  it("clears conflicting candidate fields for manual review", () => {
    const r = extractLoanDocument(page(cs + "\nInterest rate 9%"));
    expect(r.rate.value).toBeNull();
    expect(r.warnings.some((w) => w.includes("Conflicting rate"))).toBe(true);
  });
  it("recognizes L&T labels without treating a blank schedule as populated", () => {
    const r = extractLoanDocument(
      page(
        "L&T Finance\nLoan Amount (In fgures) : Rs. 12000\nEMI Amount (In fgures) : Rs. 1100.00\nAnnualized Interest Rate 10%\nFORMAT OF REPAYMENT SCHEDULE",
      ),
    );
    expect(r.principal.value).toBe(1200000);
    expect(r.emi.value).toBe(110000);
    expect(r.schedule).toEqual([]);
  });
  it("does not invent missing card due dates", () => {
    const r = extractLoanDocument(
      page(
        "Kotak credit card\nLoan amount (in Rupees) 12000\nEMI of Rs. 1025.57 would be billed",
      ),
    );
    expect(r.first_due.value).toBeNull();
    expect(r.emi.value).toBe(102557);
    expect(r.warnings.some((w) => w.includes("GST"))).toBe(true);
  });
  it("rejects unknown formats", () =>
    expect(() => extractLoanDocument(page("Unrelated PDF"))).toThrow(
      "not supported",
    ));
  it("clamps month-end due dates without drifting subsequent months", () => {
    expect(instalmentDate("2024-01-31", 1)).toBe("2024-02-29");
    expect(instalmentDate("2024-01-31", 2)).toBe("2024-03-31");
  });
  const input = {
    principal: 1200000,
    rate: 0,
    emi: 600000,
    months: 2,
    firstDue: "2025-01-31",
    paidThrough: "2025-02-01",
    schedule: terms.schedule,
  };
  it("uses a complete confirmed schedule rather than recomputing a quoted EMI", () =>
    expect(documentBalance(input)).toEqual({
      balance: 600000,
      remaining: 1,
      basis: "confirmed_schedule",
    }));
  it("uses an explicit estimate when a lender table is missing", () =>
    expect(documentBalance({ ...input, schedule: [] })).toEqual({
      balance: 600000,
      remaining: 1,
      basis: "estimate",
    }));
  it("recognizes fully paid loans and no payments before first due", () => {
    expect(documentBalance({ ...input, paidThrough: "2025-02-28" })).toEqual({
      balance: 0,
      remaining: 0,
      basis: "confirmed_schedule",
    });
    expect(
      documentBalance({ ...input, paidThrough: "2025-01-30" }).balance,
    ).toBe(1200000);
  });
  it("rejects inconsistent rows and negative amortization", () => {
    expect(() =>
      documentBalance({
        ...input,
        schedule: [{ ...terms.schedule[0], payment_paise: 1 }],
      }),
    ).toThrow();
    expect(() =>
      documentBalance({ ...input, rate: 60, emi: 1, schedule: [] }),
    ).toThrow("does not cover");
  });
  it("rejects raw document payloads, impossible dates and invalid source pages", () => {
    for (const change of [
      { raw_text: "private" },
      { as_of: "2025-02-30" },
      { source_page_count: 0 },
      { source_pages: { ...terms.source_pages, emi: 2 } },
      { nominal_rate: 1.23456 },
      { remaining_months: 0 },
    ])
      expect(
        loanDocumentSchema.safeParse({ ...terms, ...change }).success,
      ).toBe(false);
  });
  it("retains small lender rounding differences but never calls their balance exact", () => {
    const rounded = terms.schedule.map((r, i) => ({
      ...r,
      opening_paise: r.opening_paise + (i ? 20 : 40),
    }));
    expect(
      loanDocumentSchema.safeParse({ ...terms, schedule: rounded }).success,
    ).toBe(true);
    expect(documentBalance({ ...input, schedule: rounded }).basis).toBe(
      "estimate",
    );
  });
  it("rejects out-of-order and discontinuous repayment tables", () => {
    expect(
      loanDocumentSchema.safeParse({
        ...terms,
        schedule: [{ ...terms.schedule[0], sequence: 2 }],
      }).success,
    ).toBe(false);
    expect(
      loanDocumentSchema.safeParse({
        ...terms,
        schedule: [
          terms.schedule[0],
          { ...terms.schedule[1], opening_paise: 700000 },
        ],
      }).success,
    ).toBe(false);
  });
});
