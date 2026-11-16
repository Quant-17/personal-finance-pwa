import { describe, expect, it } from "vitest";
import { calculateLoan, monthlySavings, parseRupees } from "../src/lib/finance";

describe("reducing-balance EMI with integer-paise settlement", () => {
  it("matches a known ₹1 lakh, 12%, 12-month loan", () => {
    const result = calculateLoan(10_000_000, 12, 12);
    expect(result.emiPaise).toBe(888488);
    expect(result.totalPaise).toBe(
      result.emiPaise * 11 + result.finalPaymentPaise,
    );
    expect(result.interestPaise).toBeGreaterThan(660000);
    expect(result.interestPaise).toBeLessThan(662000);
  });
  it("settles a zero-interest loan exactly, including the rounding residual", () => {
    expect(calculateLoan(10_000, 0, 3)).toEqual({
      emiPaise: 3333,
      finalPaymentPaise: 3334,
      totalPaise: 10000,
      interestPaise: 0,
    });
  });
  it("handles zero principal and tiny amounts without negative payments", () => {
    expect(calculateLoan(0, 14, 12).totalPaise).toBe(0);
    expect(calculateLoan(1, 0, 120)).toEqual({
      emiPaise: 0,
      finalPaymentPaise: 1,
      totalPaise: 1,
      interestPaise: 0,
    });
    expect(calculateLoan(100, 0, 120).totalPaise).toBe(100);
  });
  it("calculates a single-month loan independently", () => {
    expect(calculateLoan(10_000_000, 12, 1)).toEqual({
      emiPaise: 10_100_000,
      finalPaymentPaise: 10_100_000,
      totalPaise: 10_100_000,
      interestPaise: 100_000,
    });
  });
  it("settles an amortisation schedule with independently calculated monthly interest", () => {
    const result = calculateLoan(8_500_000, 14, 12);
    let balance = 8_500_000;
    let paid = 0;
    for (let n = 1; n <= 12; n++) {
      const interest = Math.round((balance * 14) / 1200);
      const payment = n === 12 ? result.finalPaymentPaise : result.emiPaise;
      expect(payment).toBeLessThanOrEqual(balance + interest);
      balance += interest - payment;
      paid += payment;
    }
    expect(balance).toBe(0);
    expect(paid).toBe(result.totalPaise);
    expect(result.interestPaise).toBe(paid - 8_500_000);
  });
  it("handles negligible positive APR without cancellation or non-finite outputs", () => {
    expect(calculateLoan(10_000_000, 1e-300, 12)).toEqual(
      calculateLoan(10_000_000, 0, 12),
    );
    expect(calculateLoan(1_000_000_000, 2e-12, 120)).toEqual(
      calculateLoan(1_000_000_000, 0, 120),
    );
  });
  it("has integer outputs at supported upper limits", () => {
    const result = calculateLoan(1_000_000_000, 60, 120);
    Object.values(result).forEach((value) =>
      expect(Number.isSafeInteger(value)).toBe(true),
    );
    expect(result.finalPaymentPaise).toBeGreaterThan(0);
  });
  it.each([
    [-1, 14, 12],
    [1.1, 14, 12],
    [1e9 + 1, 14, 12],
    [NaN, 14, 12],
    [100, -1, 12],
    [100, 61, 12],
    [100, Infinity, 12],
    [100, 12, 0],
    [100, 12, 1.5],
    [100, 12, 121],
  ])(
    "rejects invalid principal/APR/tenure (%s, %s, %s)",
    (principal, apr, months) => {
      expect(() => calculateLoan(principal, apr, months)).toThrow(RangeError);
    },
  );
  it("higher rates increase interest and longer terms reduce the monthly EMI", () => {
    expect(calculateLoan(10_000_000, 15, 12).interestPaise).toBeGreaterThan(
      calculateLoan(10_000_000, 10, 12).interestPaise,
    );
    expect(calculateLoan(10_000_000, 12, 24).emiPaise).toBeLessThan(
      calculateLoan(10_000_000, 12, 12).emiPaise,
    );
  });
});
describe("money boundaries", () => {
  it("parses fractional rupees exactly", () => {
    expect(parseRupees("0.29")).toBe(29);
    expect(parseRupees("85000.01")).toBe(8500001);
  });
  it.each(["", "-1", "1.001", "1e5", "NaN", "10000000.01"])(
    "rejects malformed or unsupported input %s",
    (value) => expect(parseRupees(value)).toBeNull(),
  );
  it("rounds savings upward so the purchase is funded", () => {
    expect(monthlySavings(10000, 3)).toBe(3334);
  });
});
