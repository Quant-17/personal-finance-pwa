import Decimal from "decimal.js";

const FinancialDecimal = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
});

export const formatMoney = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
export const formatExactMoney = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(paise / 100);

/** Parse rupees at the input boundary, with no binary floating-point multiplication. */
export function parseRupees(value: string): number | null {
  if (!/^\d+(\.\d{0,2})?$/.test(value)) return null;
  const paise = new FinancialDecimal(value).times(100);
  if (paise.gt(1_000_000_000)) return null;
  return paise.toNumber();
}

export interface LoanResult {
  emiPaise: number;
  finalPaymentPaise: number;
  totalPaise: number;
  interestPaise: number;
}
/** Monthly reducing-balance loan; round each month's interest half-up to paise.
 * The final instalment clears the residual caused by monthly rounding.
 * Excludes fees, GST, insurance, down payments and lender-specific day counts.
 */
export function calculateLoan(
  principalPaise: number,
  annualApr: number,
  months: number,
): LoanResult {
  if (
    !Number.isSafeInteger(principalPaise) ||
    principalPaise < 0 ||
    principalPaise > 1_000_000_000
  )
    throw new RangeError(
      "Principal must be integer paise between 0 and ₹1 crore.",
    );
  if (!Number.isFinite(annualApr) || annualApr < 0 || annualApr > 60)
    throw new RangeError("APR must be between 0 and 60%.");
  if (!Number.isInteger(months) || months < 1 || months > 120)
    throw new RangeError("Tenure must be 1–120 months.");
  const round = (n: Decimal) => n.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const principal = new FinancialDecimal(principalPaise);
  const rate = new FinancialDecimal(annualApr).div(1200);
  const growth = rate.plus(1).pow(months);
  // At this rate even the maximum supported balance accrues < 0.000001 paise/month.
  // Use the zero-rate limit to avoid cancellation in (1 + r)^n - 1.
  const emi = round(
    rate.lt("1e-15")
      ? principal.div(months)
      : principal.times(rate).times(growth).div(growth.minus(1)),
  );
  let remaining = principal;
  let total = new FinancialDecimal(0);
  let finalPayment = new FinancialDecimal(0);
  for (let month = 1; month <= months; month++) {
    const due = remaining.plus(round(remaining.times(rate)));
    const payment = month === months ? due : FinancialDecimal.min(emi, due);
    total = total.plus(payment);
    remaining = due.minus(payment);
    finalPayment = payment;
  }
  return {
    emiPaise: emi.toNumber(),
    finalPaymentPaise: finalPayment.toNumber(),
    totalPaise: total.toNumber(),
    interestPaise: total.minus(principal).toNumber(),
  };
}
export function monthlySavings(pricePaise: number, months: number) {
  return new FinancialDecimal(pricePaise).div(months).ceil().toNumber();
}
