import { describe, expect, it } from "vitest";
import { statementRecipient } from "./statementRecipients";
import { ruleFromRow, suggestStatementRule } from "./statementRules";
import type { StatementRule } from "./statementRules";
import type { Snapshot } from "./domain";
import type { StatementDraft } from "./statements";
const s = {
  accounts: [{ id: "bank", type: "bank" }],
  categories: [
    { id: "food", kind: "expense" },
    { id: "other", kind: "expense" },
  ],
  loans: [{ id: "loan", status: "active", card_account_id: null }],
  subscriptions: [{ id: "sub", active: true, account_id: "bank" }],
} as Snapshot;
const row = {
  source_row: "1:2",
  page: 1,
  source: "Synthetic",
  date: "2026-11-01",
  description: "UPI/SYNTHETIC CAFE/ABCD/123456789012/lunch",
  amount: "100.29",
  kind: "expense",
  direction: "debit",
  category_id: "food",
  selected: false,
  note: "",
} as StatementDraft;
const rule = {
  id: "r",
  ...ruleFromRow(row, "bank", false),
  enabled: true,
} as StatementRule;
describe("recipient identities", () => {
  it("ignores Kotak reference and remark changes, while separating recipients and banks", () => {
    const key = statementRecipient(row.description)!.key;
    expect(
      statementRecipient("UPI/SYNTHETIC CAFE/ABCD/999999999999/dinner")!.key,
    ).toBe(key);
    expect(
      statementRecipient("UPI/SYNTHETIC CAFE/EFGH/999999999999/dinner")!.key,
    ).not.toBe(key);
    expect(
      statementRecipient("UPI/SYNTHETIC TEA/ABCD/999999999999/dinner")!.key,
    ).not.toBe(key);
  });
  it("normalises wrapped SBI bank codes, preserves payee digits and ignores DR/CR reference slots", () => {
    const a = statementRecipient(
      "WDL TFR UPI/DR/111111111111/TEST PERSON/A BCD/person77@bank/rent",
    );
    expect(a?.key).toBe(
      statementRecipient(
        "DEP TFR UPI/CR/222222222222/TEST PERSON/AB CD/person77@bank/new",
      )?.key,
    );
    expect(a?.key).not.toBe(
      statementRecipient(
        "WDL TFR UPI/DR/111111111111/TEST PERSON/ABCD/person88@bank/rent",
      )?.key,
    );
    expect(
      statementRecipient("UPI/DR/111/TEST PERSON/INVALID/a/rent"),
    ).toBeNull();
  });
  it("extracts PCD merchants without card suffix, location or time", () => {
    expect(
      statementRecipient("PCD/1234/SYNTHETIC SHOP/LOCATION/13:42")?.key,
    ).toBe(statementRecipient("PCD/4321/SYNTHETIC SHOP/OTHER/18:41")?.key);
    expect(
      statementRecipient(
        "POS ATM PURCH OTHPG 123456 OPENAI *CHATGPT SUBSCRSAN FRANC",
      )?.key,
    ).toBe("card:OPENAI CHATGPT");
  });
  it("uses stable synthetic NACH mandate, never the debit reference", () => {
    expect(
      statementRecipient(
        "NACH-10-DR-C111111111- SYNTHETICMANDATE999 · NACHDB123",
      )?.key,
    ).toBe("nach:SYNTHETICMANDATE999");
    expect(statementRecipient("NACHDB123456789")).toBeNull();
    expect(statementRecipient("DIRECT DR OF Mr TEST")).toMatchObject({
      exclusionOnly: true,
    });
    expect(
      statementRecipient("SWIGGY mention in an unknown transfer format"),
    ).toBeNull();
  });
});
describe("remembered suggestions", () => {
  it("matches recipient despite a changing amount, and leaves every row unselected", () => {
    expect(
      suggestStatementRule(
        { ...row, amount: "209.78", category_id: "" },
        [rule],
        "bank",
        s,
      ),
    ).toMatchObject({ kind: "expense", category_id: "food", selected: false });
  });
  it("scopes by account, direction and enabled state", () => {
    const input = { ...row, category_id: "" };
    expect(suggestStatementRule(input, [rule], "other-bank", s)).toBe(input);
    expect(
      suggestStatementRule({ ...input, direction: "credit" }, [rule], "bank", s)
        .category_id,
    ).toBe("");
    expect(
      suggestStatementRule(input, [{ ...rule, enabled: false }], "bank", s),
    ).toBe(input);
    expect(
      suggestStatementRule(
        { ...input, direction: "unknown" },
        [rule],
        "bank",
        s,
      ).category_id,
    ).toBe("");
  });
  it("never reuses an EMI split and requires exact EMI amount", () => {
    const emi = {
      ...row,
      kind: "loan_payment",
      loan_id: "loan",
      principal: "90.00",
      interest: "10.29",
    } as StatementDraft;
    const learned = {
      id: "emi",
      ...ruleFromRow(emi, "bank", false),
      enabled: true,
    };
    expect(learned.amount_paise).toBe(10029);
    expect(learned).not.toHaveProperty("principal");
    expect(suggestStatementRule(emi, [learned], "bank", s)).toMatchObject({
      loan_id: "loan",
      principal: "",
      interest: "",
      selected: false,
    });
    const different = { ...row, amount: "101.00", category_id: "" };
    expect(suggestStatementRule(different, [learned], "bank", s)).toBe(
      different,
    );
  });
  it("keeps conflicting and unavailable targets for manual review", () => {
    const conflict = {
      ...rule,
      id: "r2",
      category_id: "other",
      amount_paise: 10029,
    };
    expect(
      suggestStatementRule(row, [rule, conflict], "bank", s),
    ).toMatchObject({ kind: "", category_id: "", selected: false });
    expect(
      suggestStatementRule(
        row,
        [{ ...rule, category_id: "deleted" }],
        "bank",
        s,
      ).kind,
    ).toBe("");
  });
  it("does not classify refunds, failures, self transfers or card payments as ordinary expenses", () => {
    for (const word of ["refund", "failed", "self", "kotakccpay123"]) {
      const input = {
        ...row,
        description: row.description + " " + word,
        category_id: "",
      };
      expect(suggestStatementRule(input, [rule], "bank", s)).toBe(input);
      expect(() => ruleFromRow(input, "bank", false)).toThrow(/reconciliation/);
    }
  });
  it("supports remembered exclusions and subscription links without ledger writes", () => {
    const exclude = {
      id: "exclude",
      ...ruleFromRow({ ...row, kind: "" }, "bank", false),
      enabled: true,
    };
    expect(suggestStatementRule(row, [exclude], "bank", s)).toMatchObject({
      kind: "",
      selected: false,
    });
    const sub = {
      id: "subrule",
      ...ruleFromRow({ ...row, subscription_id: "sub" }, "bank", false),
      enabled: true,
    };
    expect(sub.amount_paise).toBe(10029);
    expect(suggestStatementRule(row, [sub], "bank", s).subscription_id).toBe(
      "sub",
    );
    expect(
      suggestStatementRule(
        row,
        [{ ...sub, subscription_id: "missing" }],
        "bank",
        s,
      ).kind,
    ).toBe("");
  });
  it("only remembers unidentified direct debits as exact-amount exclusions", () => {
    const direct = {
      ...row,
      description: "DIRECT DR OF Mr TEST",
      kind: "" as const,
      rule_note: "Review in Investments",
    };
    const learned = {
      id: "direct",
      ...ruleFromRow(direct, "bank", false),
      enabled: true,
    };
    expect(learned).toMatchObject({
      kind: "exclude",
      amount_paise: 10029,
      review_note: "Review in Investments",
    });
    expect(() =>
      ruleFromRow({ ...direct, kind: "expense" }, "bank", false),
    ).toThrow(/recipient/);
    expect(suggestStatementRule(direct, [learned], "bank", s).note).toContain(
      "Review in Investments",
    );
  });
  it("rejects ambiguous or incomplete learning", () => {
    expect(() =>
      ruleFromRow({ ...row, direction: "unknown" }, "bank", false),
    ).toThrow(/unknown/);
    expect(() =>
      ruleFromRow({ ...row, description: "Unknown" }, "bank", false),
    ).toThrow(/reliable/);
    expect(() =>
      ruleFromRow({ ...row, category_id: "" }, "bank", false),
    ).toThrow(/category/);
    expect(() =>
      ruleFromRow({ ...row, kind: "income" }, "bank", false),
    ).toThrow(/direction/);
  });
});
