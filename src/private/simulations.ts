import { z } from "zod";
import { parseRupees } from "../lib/finance";
import { moneyToInput } from "./domain";
import type {
  SimulatorInputs,
  SimulationContext,
} from "../components/Simulator";

const amount = z.number().int().safe().min(0).max(1_000_000_000_000);
export const savedSimulationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  price_paise: amount.min(1).max(1_000_000_000),
  apr: z.number().finite().min(0).max(60),
  tenure_months: z.number().int().min(1).max(120),
  delay_months: z.union([
    z.literal(3),
    z.literal(6),
    z.literal(12),
    z.literal(24),
  ]),
  payment_method: z.enum(["cash", "emi", "delay", "skip"]),
  income_paise: amount,
  expenses_paise: amount,
  existing_emi_paise: amount,
  liquid_cash_paise: z
    .number()
    .int()
    .safe()
    .min(-1_000_000_000_000)
    .max(1_000_000_000_000),
  reserve_paise: amount,
  calculation_version: z.literal(1),
  created_at: z.string().datetime({ offset: true }),
});
export type SavedSimulation = z.infer<typeof savedSimulationSchema>;
export function simulationPayload(
  name: string,
  inputs: SimulatorInputs,
  context: SimulationContext,
) {
  const parsed = savedSimulationSchema
    .omit({ id: true, created_at: true })
    .safeParse({
      name,
      price_paise: parseRupees(inputs.price),
      apr: inputs.apr.trim() ? Number(inputs.apr) : NaN,
      tenure_months: inputs.months.trim() ? Number(inputs.months) : NaN,
      delay_months: Number(inputs.delay),
      payment_method: inputs.method,
      income_paise: context.income,
      expenses_paise: context.expenses,
      existing_emi_paise: context.existingEmi,
      liquid_cash_paise: context.liquidCash,
      reserve_paise: context.reserve,
      calculation_version: 1,
    });
  if (!parsed.success)
    throw new Error(
      "Enter a name (1–80 characters) and valid purchase inputs before saving.",
    );
  return parsed.data;
}
export function restoreSimulation(saved: SavedSimulation): {
  inputs: SimulatorInputs;
  context: SimulationContext;
} {
  return {
    inputs: {
      price: moneyToInput(saved.price_paise),
      apr: String(saved.apr),
      months: String(saved.tenure_months),
      delay: String(saved.delay_months),
      method: saved.payment_method,
    },
    context: {
      income: saved.income_paise,
      expenses: saved.expenses_paise,
      existingEmi: saved.existing_emi_paise,
      liquidCash: saved.liquid_cash_paise,
      reserve: saved.reserve_paise,
    },
  };
}
