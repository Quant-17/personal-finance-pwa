import { describe, expect, it } from "vitest";
import { calculateLoan } from "../lib/finance";
import {
  restoreSimulation,
  savedSimulationSchema,
  simulationPayload,
} from "./simulations";

const inputs = {
  price: "50000.29",
  apr: "12.125",
  months: "18",
  delay: "6",
  method: "emi",
};
const context = {
  income: 9000000,
  expenses: 3000000,
  existingEmi: 1000000,
  liquidCash: 20000000,
  reserve: 15000000,
};
const row = () => ({
  id: "480dfbb1-c387-49e4-9a08-61a643c40896",
  created_at: "2026-11-20T10:00:00+00:00",
  ...simulationPayload("  Laptop  ", inputs, context),
});
describe("saved comparisons", () => {
  it("round trips integer paise, APR and all four choices without changing EMI", () => {
    for (const method of ["cash", "emi", "delay", "skip"]) {
      const saved = savedSimulationSchema.parse({
        ...row(),
        payment_method: method,
      });
      const restored = restoreSimulation(saved);
      expect(saved.name).toBe("Laptop");
      expect(saved.price_paise).toBe(5000029);
      expect(restored.inputs).toEqual({ ...inputs, method });
      expect(restored.context).toEqual(context);
      expect(
        calculateLoan(saved.price_paise, saved.apr, saved.tenure_months),
      ).toEqual(calculateLoan(5000029, 12.125, 18));
    }
  });
  it("keeps saved assumptions independent of changes to the current plan", () => {
    const saved = row();
    const current = { ...context, liquidCash: 100, income: 0 };
    expect(restoreSimulation(saved).context).toEqual(context);
    expect(
      simulationPayload("New plan", inputs, current).liquid_cash_paise,
    ).toBe(100);
    expect(restoreSimulation(saved).context.income).toBe(9000000);
  });
  it.each([
    { price: "0" },
    { price: "1.001" },
    { price: "10000001" },
    { apr: "" },
    { apr: "NaN" },
    { apr: "61" },
    { months: "0" },
    { months: "1.5" },
    { delay: "0" },
    { method: "unknown" },
  ])("rejects invalid purchase inputs %j", (change) => {
    expect(() =>
      simulationPayload("Laptop", { ...inputs, ...change }, context),
    ).toThrow();
  });
  it("validates names, saved amounts, and calculation versions before rendering", () => {
    expect(() => simulationPayload(" ", inputs, context)).toThrow();
    expect(() => simulationPayload("x".repeat(81), inputs, context)).toThrow();
    expect(() =>
      savedSimulationSchema.parse({ ...row(), calculation_version: 2 }),
    ).toThrow();
    expect(() =>
      savedSimulationSchema.parse({ ...row(), income_paise: 1.5 }),
    ).toThrow();
    expect(() =>
      savedSimulationSchema.parse({
        ...row(),
        liquid_cash_paise: Number.MAX_SAFE_INTEGER,
      }),
    ).toThrow();
    expect(
      simulationPayload("Debt", inputs, { ...context, liquidCash: -100 })
        .liquid_cash_paise,
    ).toBe(-100);
  });
});
