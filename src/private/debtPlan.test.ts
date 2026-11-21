import { describe, it, expect } from "vitest";
import { debtSources, simulateDebtPlan } from "./debtPlan";
import type { Debt, Strategy } from "./debtPlan";
import type { Snapshot } from "./domain";
const debt = (
  id: string,
  balance: number,
  apr = 0,
  minimum = 1000,
  extra: Partial<Debt> = {},
): Debt => ({
  id,
  name: id,
  balance,
  apr,
  minimum,
  allowExtra: true,
  feePercent: 0,
  ...extra,
});
describe("adaptive debt repayment accounting", () => {
  it("caps final payments and conserves integer paise in an exact 0% example", () => {
    const p = simulateDebtPlan([debt("a", 2501)], "minimum", 1000);
    expect(p.months).toBe(3);
    expect(p.totalPaid).toBe(2501);
    expect(p.interest).toBe(0);
    expect(p.rows.map((r) => r.paid)).toEqual([1000, 1000, 501]);
  });
  it("allows a capped final minimum and a lump-funded complete payoff on a zero monthly budget", () => {
    const p = simulateDebtPlan([debt("a", 500, 12, 1000)], "avalanche", 800);
    expect(p.status).toBe("paid_off");
    expect(p.totalPaid).toBe(505);
  });
  it("rounds monthly interest half up to paise", () => {
    const p = simulateDebtPlan([debt("a", 10050, 12, 20000)], "minimum", 20000);
    expect(p.interest).toBe(101);
    expect(p.totalPaid).toBe(10151);
  });
  it("allocates by rate or balance after covering every minimum", () => {
    const ds = [debt("high", 100000, 24, 1000), debt("small", 10000, 0, 1000)];
    const a = simulateDebtPlan(ds, "avalanche", 7000),
      s = simulateDebtPlan(ds, "snowball", 7000);
    expect(a.rows[0].payments.find((p) => p.id === "high")?.extra).toBe(5000);
    expect(s.rows[0].payments.find((p) => p.id === "small")?.extra).toBe(5000);
    expect(ds[0].balance).toBe(100000);
  });
  it("rolls freed minimums into eligible debts and preserves the baseline comparison", () => {
    const ds = [debt("a", 1000), debt("b", 9000)];
    expect(simulateDebtPlan(ds, "minimum", 2000).months).toBe(9);
    expect(simulateDebtPlan(ds, "avalanche", 2000).months).toBe(5);
  });
  it("pays fees from the cash budget rather than adding them to principal", () => {
    const p = simulateDebtPlan(
      [debt("a", 10000, 0, 1000, { feePercent: 10 })],
      "avalanche",
      2100,
      1100,
    );
    expect(p.lumpPaid).toBe(1000);
    expect(p.lumpFees).toBe(100);
    expect(p.afterLump).toBe(9000);
    expect(p.rows[0].payments[0]).toMatchObject({
      minimum: 1000,
      extra: 1000,
      fee: 100,
      closing: 7000,
    });
    expect(p.rows[0].paid + p.rows[0].fees).toBe(2100);
  });
  it("honours locked extra payments and reports unused one-time cash", () => {
    const p = simulateDebtPlan(
      [debt("a", 10000, 0, 1000, { allowExtra: false })],
      "avalanche",
      5000,
      5000,
    );
    expect(p.lumpPaid).toBe(0);
    expect(p.unusedLump).toBe(5000);
    expect(p.rows[0].unused).toBe(4000);
    expect(p.months).toBe(10);
  });
  it("clears with a lump sum before month one without accruing future interest", () => {
    const p = simulateDebtPlan(
      [debt("a", 10000, 36)],
      "avalanche",
      1000,
      20000,
    );
    expect(p.months).toBe(0);
    expect(p.interest).toBe(0);
    expect(p.unusedLump).toBe(10000);
    expect(p.rows).toHaveLength(0);
  });
  it("rejects unaffordable minimums, invalid money, duplicate debts and missing minimums", () => {
    expect(simulateDebtPlan([debt("a", 10000)], "avalanche", 999).status).toBe(
      "unaffordable",
    );
    expect(() =>
      simulateDebtPlan([debt("a", 10.5)], "avalanche", 1000),
    ).toThrow("integer paise");
    expect(() =>
      simulateDebtPlan([debt("a", 10), debt("a", 10)], "avalanche", 2000),
    ).toThrow("unique");
    expect(() =>
      simulateDebtPlan([debt("a", 10, 12, 0)], "avalanche", 1000),
    ).toThrow("positive");
    expect(() =>
      simulateDebtPlan([debt("a", 10, NaN)], "avalanche", 1000),
    ).toThrow("Annual rate");
  });
  it("does not invent a debt-free date for non-amortizing or out-of-range debt", () => {
    const p = simulateDebtPlan(
      [debt("a", 100000, 12, 100)],
      "minimum",
      100,
      12,
    );
    expect(p.status).toBe("horizon");
    expect(p.months).toBeNull();
    expect(p.rows.at(-1)!.closing).toBeGreaterThan(100000);
    const q = simulateDebtPlan(
      [debt("a", 1000000000000, 120, 1)],
      "minimum",
      1,
    );
    expect(q.status).toBe("limit");
    expect(q.months).toBeNull();
  });
  it("conserves debt and budgets across mixed rates, fees and strategies", () => {
    for (const strategy of ["minimum", "avalanche", "snowball"] as Strategy[]) {
      const p = simulateDebtPlan(
        [
          debt("x", 123456, 17.25, 6000, { feePercent: 2.36 }),
          debt("y", 78901, 8.5, 3500),
        ],
        strategy,
        20000,
        4567,
      );
      let closing = p.initial - p.lumpPaid;
      for (const r of p.rows) {
        expect(r.opening).toBe(closing);
        expect(r.opening + r.interest - r.paid).toBe(r.closing);
        expect(r.paid + r.fees + r.unused).toBe(20000);
        expect(r.payments.reduce((sum, d) => sum + d.closing, 0)).toBe(
          r.closing,
        );
        for (const d of r.payments)
          expect(Number.isSafeInteger(d.closing) && d.closing >= 0).toBe(true);
        closing = r.closing;
      }
      expect(p.initial + p.interest).toBe(p.totalPaid - p.fees + closing);
      expect(p.status).toBe("paid_off");
    }
  });
});
describe("complete debt source coverage", () => {
  const snapshot = {
    loans: [
      {
        id: "standalone",
        name: "Loan",
        outstanding_paise: 50000,
        apr: 12,
        emi_paise: 5000,
        reported_emi_paise: null,
        card_account_id: null,
        status: "closed",
      },
      {
        id: "plan",
        name: "Card EMI",
        outstanding_paise: 30000,
        apr: 10,
        emi_paise: 3000,
        reported_emi_paise: null,
        card_account_id: "card",
        status: "active",
      },
    ],
    accounts: [
      {
        id: "card",
        name: "Synthetic card",
        type: "credit_card",
        balance_paise: -100000,
      },
      {
        id: "bank",
        name: "Synthetic overdraft",
        type: "bank",
        balance_paise: -5000,
      },
    ],
  } as Snapshot;
  it("includes closed balances, splits linked card principal once and requires missing card terms", () => {
    const { debts, issues } = debtSources(snapshot);
    expect(issues).toEqual([]);
    expect(debts.map((d) => [d.id, d.balance])).toEqual([
      ["standalone", 50000],
      ["plan", 30000],
      ["card", 70000],
      ["bank", 5000],
    ]);
    expect(debts.find((d) => d.id === "card")?.apr).toBeNull();
    expect(debts.find((d) => d.id === "bank")?.minimum).toBeNull();
  });
  it("blocks inconsistent linked-card balances instead of double counting", () => {
    expect(
      debtSources({
        ...snapshot,
        accounts: [{ ...snapshot.accounts[0], balance_paise: -10000 }],
      }).issues[0],
    ).toContain("exceeds");
  });
});

it("treats oversized linked-card totals as a reconciliation issue rather than crashing", () => {
  const s = {
    accounts: [
      {
        id: "c",
        type: "credit_card",
        name: "Synthetic card",
        balance_paise: -1000000000000,
      },
    ],
    loans: [
      {
        id: "a",
        name: "A",
        card_account_id: "c",
        outstanding_paise: 1000000000000,
      },
      {
        id: "b",
        name: "B",
        card_account_id: "c",
        outstanding_paise: 1000000000000,
      },
    ],
  } as Snapshot;
  expect(debtSources(s).issues[0]).toContain("exceeds");
});
