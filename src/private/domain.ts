import Decimal from "decimal.js";
import { z } from "zod";
const MoneyDecimal = Decimal.clone({ precision: 40 });
export const MONEY_LIMIT = 1_000_000_000_000;
export function moneyInput(value: string, signed = false): number {
  if (!(signed ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/).test(value))
    throw new Error(
      "Enter an amount in rupees, with up to two decimal places.",
    );
  const amount = new MoneyDecimal(value).times(100);
  if (amount.abs().gt(MONEY_LIMIT))
    throw new Error("Amount exceeds the supported limit of ₹1,000 crore.");
  return amount.toNumber();
}
export const moneyToInput = (paise: number) =>
  new MoneyDecimal(paise).div(100).toFixed(2);
export function indiaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export const indiaMonth = () => indiaDate().slice(0, 7) + "-01";
export const displayDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value.length === 10 ? value + "T00:00:00+05:30" : value));
const paise = z
  .union([z.number().int().safe(), z.string().regex(/^-?\d+$/)])
  .transform((value, context) => {
    const amount = Number(value);
    if (!Number.isSafeInteger(amount) || Math.abs(amount) > MONEY_LIMIT) {
      context.addIssue({
        code: "custom",
        message: "Financial total is outside the supported safe range.",
      });
      return z.NEVER;
    }
    return amount;
  });
const id = z.string().uuid();
export const accountSchema = z.object({
  id,
  name: z.string(),
  type: z.enum(["bank", "savings", "credit_card", "cash", "investment"]),
  opening_balance_paise: paise,
  opening_date: z.string(),
  balance_paise: paise,
  archived_at: z.string().nullable(),
});
const categorySchema = z.object({
  id,
  name: z.string(),
  kind: z.enum(["income", "expense"]),
});
const loanSchema = z.object({
  id,
  name: z.string(),
  principal_paise: paise,
  apr: z.number(),
  tenure_months: z.number().int(),
  start_date: z.string(),
  status: z.enum(["active", "closed"]),
  emi_paise: paise,
  outstanding_paise: paise,
  reported_emi_paise: paise.nullable().optional().default(null),
  card_account_id: id.nullable().optional().default(null),
  progress_first_due_on: z.string().nullable().optional(),
  payments_reported_through: z.string().nullable().optional(),
  deduction_anchor_on: z.string().nullable().optional(),
  has_document: z.boolean().optional().default(false),
});
const subscriptionSchema = z.object({
  id,
  name: z.string(),
  account_id: id.nullable(),
  amount_paise: paise,
  cadence: z.enum(["monthly", "yearly", "weekly"]),
  next_due_on: z.string(),
  active: z.boolean(),
});
const budgetSchema = z.object({
  id,
  category_id: id,
  month: z.string(),
  limit_paise: paise,
  spent_paise: paise,
});
const goalSchema = z.object({
  id,
  name: z.string(),
  target_paise: paise,
  allocated_paise: paise,
  target_on: z.string().nullable(),
});
const allocationSchema = z.object({
  id,
  goal_id: id,
  account_id: id,
  amount_paise: paise,
});
export const transactionSchema = z.object({
  id,
  account_id: id,
  category_id: id.nullable(),
  kind: z.enum(["income", "expense", "transfer", "loan_payment"]),
  amount_paise: paise,
  occurred_on: z.string(),
  description: z.string(),
  transfer_id: id.nullable(),
  subscription_id: id.nullable().optional(),
  card_emi_loan_id: id.nullable().optional(),
  created_at: z.string(),
});
export const investmentHoldingSchema = z.object({
  id,
  name: z.string(),
  scheme: z.enum(["nps_tier_1", "nps_tier_2", "ppf", "epf", "other"]),
  provider: z.string(),
  funding_source: z.enum(["self", "payroll", "mixed"]),
  locked_until: z.string().nullable(),
  account_id: id.nullable(),
  archived: z.boolean(),
  revision: z.number().int().positive(),
  value_paise: paise.refine((v) => v >= 0),
  valued_on: z.string(),
  valuation_id: id,
  self_paise: paise.refine((v) => v >= 0),
  employer_paise: paise.refine((v) => v >= 0),
  withdrawn_paise: paise.refine((v) => v >= 0),
  fy_self_paise: paise.refine((v) => v >= 0),
  fy_employer_paise: paise.refine((v) => v >= 0),
  activity_after_valuation: z.number().int().nonnegative(),
});
export type InvestmentHolding = z.infer<typeof investmentHoldingSchema>;
export const snapshotSchema = z.object({
  profile: z.object({
    id,
    display_name: z.string(),
    tracking_start_date: z.string().nullable().optional(),
    monthly_income_paise: paise,
    monthly_living_budget_paise: paise,
    emergency_reserve_paise: paise,
  }),
  accounts: z.array(accountSchema),
  investments: z.array(investmentHoldingSchema).optional().default([]),
  categories: z.array(categorySchema),
  loans: z.array(loanSchema),
  subscriptions: z.array(subscriptionSchema),
  budgets: z.array(budgetSchema),
  goals: z.array(goalSchema),
  allocations: z.array(allocationSchema),
  summary: z.object({
    month: z.string(),
    income_paise: paise,
    expense_paise: paise,
    loan_payments_paise: paise,
    liquid_cash_paise: paise,
    assets_paise: paise,
    net_worth_paise: paise,
    existing_emi_paise: paise,
  }),
  deductions: z
    .array(
      z.object({
        transaction_id: id,
        kind: z.enum(["loan", "subscription", "card_emi"]),
        commitment_id: id,
        paid_on: z.string(),
        amount_paise: paise,
        principal_paise: paise.nullable(),
        interest_paise: paise.nullable(),
      }),
    )
    .optional(),
  category_spending: z
    .array(
      z.object({
        month: z.string(),
        category_id: id,
        name: z.string(),
        amount_paise: paise,
      }),
    )
    .optional(),
  cashflow: z.array(
    z.object({ month: z.string(), income_paise: paise, outflow_paise: paise }),
  ),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Account = z.infer<typeof accountSchema>;
export type Entry = z.infer<typeof transactionSchema>;
export const parseTransactions = (value: unknown) =>
  z.array(transactionSchema).parse(value);
export function safeTotal(values: number[]) {
  const total = values
    .reduce((sum, value) => sum.plus(value), new MoneyDecimal(0))
    .toNumber();
  if (!Number.isSafeInteger(total) || Math.abs(total) > MONEY_LIMIT)
    throw new Error("Financial total exceeds the supported range.");
  return total;
}
