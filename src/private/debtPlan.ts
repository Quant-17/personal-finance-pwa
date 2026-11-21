import Decimal from "decimal.js";
import type { Snapshot } from "./domain";
import { MONEY_LIMIT, safeTotal } from "./domain";
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Debt = {
  id: string;
  name: string;
  balance: number;
  apr: number;
  minimum: number;
  allowExtra: boolean;
  feePercent: number;
  anchor?: string | null;
};
export type DebtSource = Omit<
  Debt,
  "apr" | "minimum" | "allowExtra" | "feePercent"
> & {
  apr: number | null;
  minimum: number | null;
  kind: "loan" | "card_emi" | "card" | "overdraft";
};
export type Strategy = "minimum" | "avalanche" | "snowball";
export function debtSources(s: Snapshot): {
  debts: DebtSource[];
  issues: string[];
} {
  const debts: DebtSource[] = [],
    issues: string[] = [];
  for (const l of s.loans.filter(
    (l) => !l.card_account_id && l.outstanding_paise > 0,
  ))
    debts.push({
      id: l.id,
      name: l.name,
      balance: l.outstanding_paise,
      apr: l.apr,
      minimum: l.reported_emi_paise ?? l.emi_paise,
      kind: "loan",
      anchor: l.deduction_anchor_on,
    });
  for (const a of s.accounts) {
    const linked = s.loans.filter(
      (l) => l.card_account_id === a.id && l.outstanding_paise > 0,
    );
    if (a.type === "credit_card") {
      const owed = Math.max(0, -a.balance_paise),
        plansDecimal = linked.reduce(
          (sum, l) => sum.plus(l.outstanding_paise),
          new D(0),
        );
      const plans = plansDecimal.lte(owed) ? plansDecimal.toNumber() : owed + 1;
      if (plans > owed) {
        issues.push(
          `${a.name}: linked EMI principal exceeds the card balance. Reconcile these balances before simulating.`,
        );
        continue;
      }
      for (const l of linked)
        debts.push({
          id: l.id,
          name: l.name,
          balance: l.outstanding_paise,
          apr: l.apr,
          minimum: l.reported_emi_paise ?? l.emi_paise,
          kind: "card_emi",
          anchor: l.deduction_anchor_on,
        });
      if (owed > plans)
        debts.push({
          id: a.id,
          name: a.name + " · revolving balance",
          balance: owed - plans,
          apr: null,
          minimum: null,
          kind: "card",
        });
    } else if (a.balance_paise < 0) {
      if (a.type === "investment")
        issues.push(
          `${a.name}: a negative investment balance needs review; it has not been treated as an ordinary repayment loan.`,
        );
      else
        debts.push({
          id: a.id,
          name: a.name + " · overdraft",
          balance: -a.balance_paise,
          apr: null,
          minimum: null,
          kind: "overdraft",
        });
    }
  }
  for (const l of s.loans.filter(
    (l) => l.card_account_id && l.outstanding_paise > 0,
  ))
    if (
      !s.accounts.some(
        (a) => a.id === l.card_account_id && a.type === "credit_card",
      )
    )
      issues.push(`${l.name}: the linked credit-card account is unavailable.`);
  return { debts, issues };
}
export type Payment = {
  id: string;
  interest: number;
  minimum: number;
  extra: number;
  fee: number;
  closing: number;
};
export type PlanRow = {
  month: number;
  opening: number;
  interest: number;
  paid: number;
  fees: number;
  closing: number;
  unused: number;
  payments: Payment[];
};
export type PlanResult = {
  strategy: Strategy;
  status: "paid_off" | "horizon" | "limit" | "unaffordable";
  rows: PlanRow[];
  months: number | null;
  initial: number;
  afterLump: number;
  lumpPaid: number;
  lumpFees: number;
  unusedLump: number;
  shortfall: number;
  interest: number;
  fees: number;
  totalPaid: number;
  payoffs: { id: string; month: number }[];
  lumpPayments: { id: string; extra: number; fee: number; closing: number }[];
};
const money = (v: number, label: string) => {
  if (!Number.isSafeInteger(v) || v < 0 || v > MONEY_LIMIT)
    throw new Error(`${label} must be bounded integer paise.`);
};
function rate(v: number, label: string) {
  if (!Number.isFinite(v) || v < 0 || v > 120)
    throw new Error(`${label} must be between 0 and 120%.`);
}
function fee(payment: number, percent: number) {
  return new D(payment).times(percent).div(100).toDecimalPlaces(0).toNumber();
}
function affordablePayment(balance: number, wallet: number, percent: number) {
  let low = 0,
    high = Math.min(balance, wallet);
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (mid + fee(mid, percent) <= wallet) low = mid;
    else high = mid - 1;
  }
  return { payment: low, fee: fee(low, percent) };
}
export function simulateDebtPlan(
  input: Debt[],
  strategy: Strategy,
  monthlyBudget: number,
  lumpSum = 0,
  horizon = 360,
): PlanResult {
  if (input.length > 100) throw new Error("Simulate up to 100 debt balances.");
  if (!["minimum", "avalanche", "snowball"].includes(strategy))
    throw new Error("Unknown repayment strategy.");
  money(monthlyBudget, "Monthly budget");
  money(lumpSum, "One-time payment");
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 360)
    throw new Error("Use a horizon of 1–360 months.");
  if (new Set(input.map((d) => d.id)).size !== input.length)
    throw new Error("Debt identities must be unique.");
  for (const d of input) {
    money(d.balance, "Balance");
    money(d.minimum, "Minimum");
    rate(d.apr, "Annual rate");
    rate(d.feePercent, "Extra-payment charge");
    if (d.balance > 0 && d.minimum === 0)
      throw new Error("Every debt needs a positive minimum payment.");
  }
  const debts = input.filter((d) => d.balance > 0).map((d) => ({ ...d }));
  const initial = safeTotal(debts.map((d) => d.balance));
  const result: PlanResult = {
    strategy,
    status: "horizon",
    rows: [],
    months: null,
    initial,
    afterLump: initial,
    lumpPaid: 0,
    lumpFees: 0,
    unusedLump: lumpSum,
    shortfall: 0,
    interest: 0,
    fees: 0,
    totalPaid: 0,
    payoffs: [],
    lumpPayments: [],
  };
  const order = () =>
    debts
      .filter((d) => d.balance > 0 && d.allowExtra)
      .sort((a, b) =>
        strategy === "snowball"
          ? a.balance - b.balance || b.apr - a.apr || a.id.localeCompare(b.id)
          : b.apr - a.apr || a.balance - b.balance || a.id.localeCompare(b.id),
      );
  // No surplus/lump is used by the minimum-only comparison.
  if (strategy !== "minimum")
    for (const d of order()) {
      const p = affordablePayment(d.balance, result.unusedLump, d.feePercent);
      d.balance -= p.payment;
      result.unusedLump -= p.payment + p.fee;
      result.lumpPaid += p.payment;
      result.lumpFees += p.fee;
      if (p.payment)
        result.lumpPayments.push({
          id: d.id,
          extra: p.payment,
          fee: p.fee,
          closing: d.balance,
        });
      if (!d.balance) result.payoffs.push({ id: d.id, month: 0 });
    }
  result.afterLump = safeTotal(debts.map((d) => d.balance));
  result.totalPaid = result.lumpPaid + result.lumpFees;
  result.fees = result.lumpFees;
  if (!result.afterLump) {
    result.status = "paid_off";
    result.months = 0;
    return result;
  }
  const required = safeTotal(
    debts
      .filter((d) => d.balance > 0)
      .map((d) =>
        Math.min(
          d.minimum,
          d.balance +
            new D(d.balance)
              .times(d.apr)
              .div(1200)
              .toDecimalPlaces(0)
              .toNumber(),
        ),
      ),
  );
  if (monthlyBudget < required) {
    result.status = "unaffordable";
    result.shortfall = required - monthlyBudget;
    return result;
  }
  for (let month = 1; month <= horizon; month++) {
    const payoffCount = result.payoffs.length;
    const opening = safeTotal(debts.map((d) => d.balance)),
      payments: Payment[] = [];
    let wallet = monthlyBudget,
      interest = 0,
      paid = 0,
      fees = 0;
    for (const d of debts.filter((d) => d.balance > 0)) {
      const accrued = new D(d.balance)
        .times(d.apr)
        .div(1200)
        .toDecimalPlaces(0)
        .toNumber();
      if (d.balance + accrued > MONEY_LIMIT) {
        result.payoffs.length = payoffCount;
        result.status = "limit";
        return result;
      }
      d.balance += accrued;
      const minimum = Math.min(d.minimum, d.balance);
      d.balance -= minimum;
      wallet -= minimum;
      paid += minimum;
      interest += accrued;
      payments.push({
        id: d.id,
        interest: accrued,
        minimum,
        extra: 0,
        fee: 0,
        closing: d.balance,
      });
      if (!d.balance) result.payoffs.push({ id: d.id, month });
    }
    if (strategy !== "minimum")
      for (const d of order()) {
        const p = affordablePayment(d.balance, wallet, d.feePercent);
        d.balance -= p.payment;
        wallet -= p.payment + p.fee;
        paid += p.payment;
        fees += p.fee;
        const row = payments.find((p) => p.id === d.id)!;
        row.extra = p.payment;
        row.fee = p.fee;
        row.closing = d.balance;
        if (!d.balance) result.payoffs.push({ id: d.id, month });
      }
    const closing = debts.reduce((sum, d) => sum + d.balance, 0);
    if (
      [
        closing,
        interest,
        result.interest + interest,
        result.totalPaid + paid + fees,
        result.fees + fees,
      ].some((x) => x > MONEY_LIMIT)
    ) {
      result.payoffs.length = payoffCount;
      result.status = "limit";
      return result;
    }
    result.rows.push({
      month,
      opening,
      interest,
      paid,
      fees,
      closing,
      unused: wallet,
      payments,
    });
    result.interest += interest;
    result.fees += fees;
    result.totalPaid += paid + fees;
    if (!closing) {
      result.status = "paid_off";
      result.months = month;
      return result;
    }
  }
  return result;
}
