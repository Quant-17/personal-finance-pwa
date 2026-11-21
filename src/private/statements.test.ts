import { describe, expect, it } from "vitest";
import {
  extractStatement,
  reviewedStatementEntry,
  statementDate,
  statementMoney,
} from "./statements";
import type { PdfLine } from "./readPdfText";
import type { Snapshot } from "./domain";
const line = (n: number, cells: [string, number][], page = 1): PdfLine => ({
  page,
  line: n,
  text: cells.map((c) => c[0]).join(" "),
  spans: cells.map(([text, x]) => ({ text, x, width: text.length * 5 })),
});
const header = line(1, [
  ["Date", 20],
  ["Description", 120],
  ["Debit", 330],
  ["Credit", 430],
  ["Balance", 530],
]);
const bankRows = [
  header,
  line(2, [
    ["19/11/2026", 20],
    ["SYNTHETIC FOOD PURCHASE", 120],
    ["1,250.29", 330],
    ["48,749.71", 530],
  ]),
  line(3, [
    ["20/11/2026", 20],
    ["SYNTHETIC SALARY", 120],
    ["20,000.00", 430],
    ["68,749.71", 530],
  ]),
];
const s = {
  accounts: [{ id: "bank", opening_date: "2026-01-01", archived_at: null }],
  categories: [
    { id: "food", kind: "expense", name: "Food" },
    { id: "salary", kind: "income", name: "Salary" },
  ],
} as Snapshot;
describe("monthly statement extraction", () => {
  it("reads common SBI-style separate debit/credit/balance columns without treating balance as spending", () => {
    const rows = extractStatement(bankRows, "2026-11", false);
    expect(rows[0]).toMatchObject({
      date: "2026-11-19",
      amount: "1250.29",
      kind: "expense",
      source_row: "1:2",
      selected: false,
      category_id: "",
    });
    expect(rows[1]).toMatchObject({
      amount: "20000.00",
      kind: "",
      selected: false,
    });
    expect(rows[0].amount).not.toBe("48749.71");
  });
  it("reads Kotak-style Withdrawal/Deposit headers and named month dates", () => {
    const lines = [
      line(1, [
        ["Date", 20],
        ["Narration", 120],
        ["Withdrawal(Dr.)", 330],
        ["Deposit(Cr.)", 430],
        ["Balance", 530],
      ]),
      line(2, [
        ["19-Nov-2026", 20],
        ["SYNTHETIC SHOP", 120],
        ["2,340.17", 330],
        ["20,000.00", 530],
      ]),
    ];
    expect(extractStatement(lines, "2026-11", false)[0]).toMatchObject({
      date: "2026-11-19",
      amount: "2340.17",
      kind: "expense",
    });
  });
  it("keeps card credits, refunds and repayments excluded instead of inflating income", () => {
    for (const text of [
      "SYNTHETIC PAYMENT RECEIVED 1,200.00 CR",
      "SYNTHETIC REFUND 1,200.00",
      "SYNTHETIC CASHBACK 20.00",
      "SYNTHETIC EMI 1,200.00",
    ]) {
      const r = extractStatement(
        [
          line(1, [
            ["19/11/26", 20],
            [text, 120],
          ]),
        ],
        "2026-11",
        true,
      )[0];
      expect(r.kind).toBe("");
      expect(r.selected).toBe(false);
    }
    expect(
      extractStatement(
        [
          line(1, [
            ["19/11/26", 20],
            ["SYNTHETIC SHOP 123.29 DR", 120],
          ]),
        ],
        "2026-11",
        true,
      )[0],
    ).toMatchObject({ amount: "123.29", kind: "expense" });
  });
  it("requires direction review for unknown layouts and never picks between two unexplained totals", () => {
    expect(
      extractStatement(
        [
          line(1, [
            ["19/11/2026", 20],
            ["SYNTHETIC 123.29 20000.00", 120],
          ]),
        ],
        "2026-11",
        false,
      )[0],
    ).toMatchObject({ amount: "", kind: "" });
    expect(
      extractStatement(
        [
          line(1, [
            ["19/11/2026", 20],
            ["SYNTHETIC 123.29", 120],
          ]),
        ],
        "2026-11",
        false,
      )[0],
    ).toMatchObject({ amount: "123.29", kind: "" });
  });
  it("handles a missing year around January and rejects impossible dates", () => {
    expect(statementDate("20 Dec", "2026-01")).toBe("2025-12-20");
    expect(statementDate("2026-11-19", "2026-11")).toBe("2026-11-19");
    expect(statementDate("31/02/2026", "2026-11")).toBe("");
  });
  it("parses grouped rupees exactly and rejects unsupported precision/ranges", () => {
    expect(statementMoney("1,23,456.07")).toBe("123456.07");
    expect(statementMoney("₹100.29")).toBe("100.29");
    for (const n of ["1,23.00", "100.001", "0.00", "10000000000.01"])
      expect(statementMoney(n)).toBe("");
    expect(
      extractStatement(
        [
          line(1, [
            ["19/11/2026", 20],
            ["SYNTHETIC 1.009", 120],
          ]),
        ],
        "2026-11",
        true,
      )[0].amount,
    ).toBe("");
  });
  it("keeps wrapped descriptions but excludes balance/footer summaries", () => {
    const rows = extractStatement(
      [
        bankRows[0],
        bankRows[1],
        line(3, [["SYNTHETIC REFERENCE ABC", 120]]),
        line(4, [["Closing balance 48,749.71", 120]]),
      ],
      "2026-11",
      false,
    );
    expect(rows[0].description).toContain("SYNTHETIC REFERENCE ABC");
    expect(rows[0].description).not.toContain("Closing balance");
  });
  it("requires an owned active account, real settled date and matching category before selecting a posting", () => {
    const row = {
      ...extractStatement(bankRows, "2026-11", false)[0],
      category_id: "food",
    };
    expect(
      reviewedStatementEntry(row, s, "bank", "2026-11-21").entry.amount_paise,
    ).toBe(125029);
    expect(() =>
      reviewedStatementEntry(row, s, "foreign", "2026-11-21"),
    ).toThrow("active account");
    expect(() =>
      reviewedStatementEntry(
        { ...row, date: "2026-12-01" },
        s,
        "bank",
        "2026-11-21",
      ),
    ).toThrow("settled date");
    expect(() =>
      reviewedStatementEntry(
        { ...row, category_id: "salary" },
        s,
        "bank",
        "2026-11-21",
      ),
    ).toThrow("matching");
  });
  it("bounds statement size and rejects documents with no transaction dates", () => {
    expect(() =>
      extractStatement(
        [line(1, [["This is a summary only", 20]])],
        "2026-11",
        false,
      ),
    ).toThrow("No supported dated");
    expect(() =>
      extractStatement(
        Array.from({ length: 501 }, (_, i) =>
          line(i + 1, [
            ["19/11/2026", 20],
            ["SYNTHETIC 100.29", 120],
          ]),
        ),
        "2026-11",
        true,
      ),
    ).toThrow("at most 500");
  });
});

describe("reviewed statement EMI splits", () => {
  const loan = {
    id: "loan",
    status: "active",
    card_account_id: null,
    start_date: "2026-10-01",
    outstanding_paise: 500000,
  };
  const snapshot = { ...s, loans: [loan] } as Snapshot;
  const row = {
    ...extractStatement(bankRows, "2026-11", false)[0],
    kind: "loan_payment" as const,
    loan_id: "loan",
    principal: "1000.20",
    interest: "250.09",
  };
  it("sends exact paise and a linked loan without an expense category", () => {
    expect(
      reviewedStatementEntry(row, snapshot, "bank", "2026-11-21").entry,
    ).toEqual({
      kind: "loan_payment",
      loan_id: "loan",
      principal_paise: 100020,
      interest_paise: 25009,
      amount_paise: 125029,
      occurred_on: "2026-11-19",
      description: row.description,
    });
  });
  it("rejects missing splits, mismatches and extra decimal places", () => {
    for (const edit of [
      { principal: "" },
      { interest: "250.08" },
      { principal: "1000.201" },
    ])
      expect(() =>
        reviewedStatementEntry(
          { ...row, ...edit },
          snapshot,
          "bank",
          "2026-11-21",
        ),
      ).toThrow();
  });
  it("rejects unowned, card-linked, closed and pre-baseline loans", () => {
    for (const edit of [
      { id: "other" },
      { card_account_id: "card" },
      { status: "closed" },
      { start_date: "2026-11-20" },
    ])
      expect(() =>
        reviewedStatementEntry(
          row,
          { ...snapshot, loans: [{ ...loan, ...edit }] } as Snapshot,
          "bank",
          "2026-11-21",
        ),
      ).toThrow();
  });
});
