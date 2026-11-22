import { z } from "zod";
export const debtTermsSchema = z.object({
  id: z.uuid(),
  loan_id: z.uuid().nullable(),
  account_id: z.uuid().nullable(),
  prepayment_percent: z.number().min(0).max(120),
  closure_fee_paise: z
    .union([z.string(), z.number()])
    .transform(Number)
    .refine((n) => Number.isSafeInteger(n) && n >= 0 && n <= 1e12),
  tax_percent: z.number().min(0).max(30),
  promo_apr: z.number().min(0).max(120).nullable(),
  promo_until: z.string().nullable(),
});
export function fullPromoMonths(
  startMonth: string,
  until: string | null,
  horizon = 360,
) {
  if (!until) return 0;
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(until) ||
    !Number.isFinite(new Date(until + "T00:00:00Z").valueOf()) ||
    new Date(until + "T00:00:00Z").toISOString().slice(0, 10) !== until
  )
    throw Error("Review the promotion expiry date.");
  const [y, m] = startMonth.split("-").map(Number);
  let count = 0;
  for (let i = 0; i < horizon; i++) {
    const end = new Date(Date.UTC(y, m + i, 0)).toISOString().slice(0, 10);
    if (end > until) break;
    count++;
  }
  return count;
}
