import { z } from "zod";
export const moneyValue = z
  .union([z.string().regex(/^-?\d+$/), z.number().int()])
  .transform(Number)
  .refine((n) => Number.isSafeInteger(n) && Math.abs(n) <= 1e12);
export const accountReportSchema = z.object({
  account_id: z.uuid(),
  month: z.string(),
  baseline_covers_month: z.boolean(),
  complete_month: z.boolean(),
  opening_paise: moneyValue,
  closing_paise: moneyValue,
  credits_paise: moneyValue,
  debits_paise: moneyValue,
  row_count: z.number().int().nonnegative(),
  ledger_hash: z.string(),
  review: z
    .object({ current: z.boolean(), reviewed_at: z.string() })
    .passthrough()
    .nullable(),
});
export type AccountReport = z.infer<typeof accountReportSchema>;
export const monthReportSchema = z.object({
  month: z.string(),
  complete_month: z.boolean(),
  income_paise: moneyValue,
  expenses_paise: moneyValue,
  loan_cash_paise: moneyValue,
  principal_paise: moneyValue,
  interest_paise: moneyValue,
  self_invested_paise: moneyValue,
  employer_invested_paise: moneyValue,
  withdrawn_paise: moneyValue,
  subscription_paid_paise: moneyValue,
  categories: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      spent_paise: moneyValue,
      budget_paise: moneyValue.nullable(),
    }),
  ),
  accounts: z.array(accountReportSchema),
  report_hash: z.string(),
  review: z
    .object({
      reviewed_at: z.string(),
      current: z.boolean(),
      saved_report: z.unknown(),
    })
    .nullable(),
});
export type MonthReport = z.infer<typeof monthReportSchema>;
