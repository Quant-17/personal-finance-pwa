import { loanSchedule } from "./schedule";
import { calculateLoan } from "../lib/finance";
import { describe, expect, it } from "vitest";
import {
  indiaDate,
  moneyInput,
  moneyToInput,
  safeTotal,
  snapshotSchema,
} from "./domain";
import { validateClientConfiguration as validate } from "./config";
describe("private financial boundaries", () => {
  it("parses rupees exactly and preserves signed opening debt", () => {
    expect(moneyInput("0.29")).toBe(29);
    expect(moneyInput("-125.49", true)).toBe(-12549);
    expect(moneyToInput(-12549)).toBe("-125.49");
  });
  it.each([
    "",
    "1e3",
    "1.001",
    "NaN",
    "Infinity",
    "-1",
    "1,000",
    "10000000000.01",
  ])("rejects ambiguous or unsupported amount %s", (value) => {
    expect(() => moneyInput(value)).toThrow();
  });
  it("handles India date rollover independently of host time", () => {
    expect(indiaDate(new Date("2026-11-17T18:29:59Z"))).toBe("2026-11-17");
    expect(indiaDate(new Date("2026-11-17T18:30:00Z"))).toBe("2026-11-18");
  });
  it("rejects unsafe aggregates instead of rounding silently", () => {
    expect(safeTotal([29, 71, -50])).toBe(50);
    expect(() => safeTotal([1e12, 1])).toThrow();
    expect(
      snapshotSchema.safeParse({
        summary: { net_worth_paise: "9007199254740993" },
      }).success,
    ).toBe(false);
  });
});
describe("public client configuration", () => {
  const valid = {
    mode: "private" as const,
    url: "https://project.supabase.co",
    key: "sb_publishable_test",
  };
  it("accepts a publishable key and exact origin", () =>
    expect(validate(valid)).toBeNull());
  it.each(["sb_secret_test", "service_role", "eyJhbGciOiJIUzI1NiJ9.invalid"])(
    "rejects non-publishable client key %s",
    (key) => expect(validate({ ...valid, key })).not.toBeNull(),
  );
  it.each([
    "not a url",
    "http://project.supabase.co",
    "https://project.supabase.co/rest/v1",
    "https://user:password@project.supabase.co",
    "https://project.supabase.co?q=x",
  ])("rejects unsafe URL %s", (url) =>
    expect(validate({ ...valid, url })).not.toBeNull(),
  );
  it("leaves demo independent of configuration", () =>
    expect(validate({ mode: "demo" })).toBeNull());
});

describe("loan repayment projection", () => {
  it.each([
    [10000000, 12, 12],
    [10000, 0, 3],
    [1, 0, 120],
    [1000000000, 60, 120],
  ])(
    "reconciles principal, interest and final residual for %j",
    (principal, apr, months) => {
      const rows = loanSchedule(principal, apr, months);
      const loan = calculateLoan(principal, apr, months);
      expect(rows.at(-1)?.balancePaise).toBe(0);
      expect(safeTotal(rows.map((row) => row.principalPaise))).toBe(principal);
      expect(safeTotal(rows.map((row) => row.paymentPaise))).toBe(
        loan.totalPaise,
      );
      expect(safeTotal(rows.map((row) => row.interestPaise))).toBe(
        loan.interestPaise,
      );
      expect(rows.every((row) => Number.isSafeInteger(row.paymentPaise))).toBe(
        true,
      );
    },
  );
});
