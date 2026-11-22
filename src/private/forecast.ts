import { z } from "zod";
import Decimal from "decimal.js";
import { MONEY_LIMIT, safeTotal } from "./domain";
import type { Snapshot } from "./domain";
import { deductionsInMonth, recurringDate } from "./recurring";
import { monthlySubscriptions } from "./monthlyPlan";
export const planningSchema = z.object({
  salary_day: z.number().int().min(1).max(31).nullable(),
  salary_account_id: z.uuid().nullable(),
  spending_account_id: z.uuid().nullable(),
  loan_funding: z.record(z.string(), z.uuid()),
});
export type PlanningSettings = z.infer<typeof planningSchema>;
const paise = z
  .union([z.string().regex(/^\d+$/), z.number().int()])
  .transform(Number)
  .refine((n) => Number.isSafeInteger(n) && n >= 0 && n <= MONEY_LIMIT);
export const plannedEventSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(["income", "expense", "transfer"]),
  account_id: z.uuid(),
  to_account_id: z.uuid().nullable(),
  amount_paise: paise,
  due_on: z.string(),
  cadence: z.enum(["once", "monthly", "yearly"]),
  within_budget: z.boolean(),
  active: z.boolean(),
});
export type PlannedEvent = z.infer<typeof plannedEventSchema>;
export type ProjectionEvent = {
  date: string;
  name: string;
  account_id: string;
  amount: number;
  to_account_id?: string | null;
  withinBudget?: boolean;
};
const dayMs = 86400000;
const asDate = (s: string) => new Date(s + "T00:00:00Z");
const iso = (d: Date) => d.toISOString().slice(0, 10);
export function cashForecast(
  s: Snapshot,
  settings: PlanningSettings,
  planned: PlannedEvent[],
  asOf: string,
  alreadySpent: number,
  horizon = 90,
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(asOf) ||
    !Number.isFinite(asDate(asOf).valueOf()) ||
    iso(asDate(asOf)) !== asOf
  )
    throw Error("Review the forecast date.");
  if (
    !Number.isInteger(horizon) ||
    horizon < 1 ||
    horizon > 90 ||
    planned.length > 100
  )
    throw Error("Use 1–90 days and at most 100 planned events.");
  if (
    !Number.isSafeInteger(alreadySpent) ||
    alreadySpent < 0 ||
    alreadySpent > MONEY_LIMIT
  )
    throw Error("Review recorded month spending.");
  const accounts = s.accounts.filter(
    (a) => !a.archived_at && ["bank", "savings", "cash"].includes(a.type),
  );
  const cashIds = new Set(accounts.map((a) => a.id));
  if (
    !settings.spending_account_id ||
    !cashIds.has(settings.spending_account_id)
  )
    throw Error(
      "Choose the cash account for forecast living costs and unassigned subscriptions.",
    );
  if (
    s.profile.monthly_income_paise > 0 &&
    (!settings.salary_day ||
      !settings.salary_account_id ||
      !cashIds.has(settings.salary_account_id))
  )
    throw Error("Choose the salary day and destination account.");
  for (const l of s.loans.filter(
    (l) =>
      !l.card_account_id && l.status === "active" && l.outstanding_paise > 0,
  ))
    if (!l.deduction_anchor_on)
      throw Error(
        `Set a monthly deduction date for ${l.name} in Monthly plan.`,
      );
    else if (!cashIds.has(settings.loan_funding[l.id]))
      throw Error(`Choose a funding account for ${l.name}.`);
  const end = iso(new Date(asDate(asOf).valueOf() + horizon * dayMs));
  const lastMonthEnd = iso(
    new Date(Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)), 0)),
  );
  for (const sub of s.subscriptions.filter((x) => x.active))
    if (!sub.next_due_on)
      throw Error(`Set a deduction date for ${sub.name} in Monthly plan.`);
  const monthlySubs = monthlySubscriptions(s);
  if (monthlySubs === null)
    throw Error("Subscription totals exceed supported limits.");
  const baseLiving = Math.max(
    0,
    s.profile.monthly_living_budget_paise - monthlySubs,
  );
  const events: ProjectionEvent[] = [];
  const warnings: string[] = s.loans
    .filter(
      (l) =>
        !l.card_account_id && l.status !== "active" && l.outstanding_paise > 0,
    )
    .map(
      (l) =>
        `${l.name} has a balance but is not active; no scheduled payment was projected. Review its status.`,
    );
  const monthStarts: string[] = [];
  for (let m = asOf.slice(0, 7) + "-01"; m <= end; m = recurringDate(m, 1))
    monthStarts.push(m);
  const residual = new Map(s.loans.map((l) => [l.id, l.outstanding_paise]));
  for (const start of monthStarts) {
    const month = start.slice(0, 7),
      days =
        asDate(recurringDate(start, 1)).valueOf() - asDate(start).valueOf();
    if (
      settings.salary_day &&
      settings.salary_account_id &&
      s.profile.monthly_income_paise
    ) {
      const date =
        month +
        "-" +
        String(Math.min(settings.salary_day, days / dayMs)).padStart(2, "0");
      if (date > asOf)
        events.push({
          date,
          name: "Expected salary",
          account_id: settings.salary_account_id,
          amount: s.profile.monthly_income_paise,
        });
    }
    for (const due of deductionsInMonth(s, month)) {
      if (due.due_on <= asOf) continue;
      if (due.kind === "subscription") {
        const sub = s.subscriptions.find((x) => x.id === due.id)!;
        const account = sub.account_id ?? settings.spending_account_id;
        if (!cashIds.has(account)) {
          warnings.push(
            `${sub.name} is charged to a card/non-cash account; add its bank/card repayment separately.`,
          );
          continue;
        }
        events.push({
          date: due.due_on,
          name: due.name,
          account_id: account,
          amount: -due.amount_paise,
        });
      } else if (!due.card) {
        const loan = s.loans.find((x) => x.id === due.id)!,
          balance = residual.get(loan.id) ?? 0;
        if (balance <= 0) continue;
        const interest = new Decimal(balance)
          .times(loan.apr)
          .div(1200)
          .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
          .toNumber();
        const payment = Math.min(
          due.amount_paise,
          safeTotal([balance, interest]),
        );
        residual.set(loan.id, balance + interest - payment);
        events.push({
          date: due.due_on,
          name: due.name,
          account_id: settings.loan_funding[due.id],
          amount: -payment,
        });
      } else
        warnings.push(
          "Card-linked EMI principal is already in card debt; forecast bank repayments separately rather than adding it twice.",
        );
    }
  }
  for (const p of planned.filter((p) => p.active)) {
    let dates: string[] = [];
    if (p.cadence === "once") dates = [p.due_on];
    else
      for (const start of monthStarts) {
        const offset =
          (Number(start.slice(0, 4)) - Number(p.due_on.slice(0, 4))) * 12 +
          Number(start.slice(5, 7)) -
          Number(p.due_on.slice(5, 7));
        if (offset >= 0 && (p.cadence !== "yearly" || offset % 12 === 0))
          dates.push(recurringDate(p.due_on, offset));
      }
    if (!cashIds.has(p.account_id))
      throw Error(`${p.name}: account unavailable.`);
    if (
      p.kind === "transfer" &&
      !s.accounts.some((a) => a.id === p.to_account_id && !a.archived_at)
    )
      throw Error(`${p.name}: destination unavailable.`);
    for (const date of dates.filter((d) => d > asOf && d <= lastMonthEnd))
      events.push({
        date,
        name: p.name,
        account_id: p.account_id,
        amount: p.kind === "income" ? p.amount_paise : -p.amount_paise,
        to_account_id: p.to_account_id,
        withinBudget: p.kind === "expense" && p.within_budget,
      });
  }
  for (const month of monthStarts) {
    const start = month.slice(0, 7),
      finish = recurringDate(month, 1),
      first =
        month > asOf ? month : iso(new Date(asDate(asOf).valueOf() + dayMs));
    if (first >= finish) continue;
    const count = (asDate(finish).valueOf() - asDate(first).valueOf()) / dayMs;
    const reserved = safeTotal(
      events
        .filter((e) => e.date.startsWith(start) && e.withinBudget)
        .map((e) => -e.amount),
    );
    const available = Math.max(
      0,
      baseLiving - reserved - (asOf.startsWith(start) ? alreadySpent : 0),
    );
    const daily = Math.floor(available / count),
      remainder = available % count;
    for (let i = 0; i < count; i++)
      events.push({
        date: iso(new Date(asDate(first).valueOf() + i * dayMs)),
        name: "Budgeted everyday spending",
        account_id: settings.spending_account_id,
        amount: -(daily + (i < remainder ? 1 : 0)),
      });
    if (reserved + (asOf.startsWith(start) ? alreadySpent : 0) > baseLiving)
      warnings.push(
        `${start}: planned/recorded non-subscription spending exceeds the remaining living allocation.`,
      );
  }
  const balances = new Map(accounts.map((a) => [a.id, a.balance_paise]));
  const earmarked = safeTotal(
    s.allocations
      .filter((a) => cashIds.has(a.account_id))
      .map((a) => a.amount_paise),
  );
  const reserve = safeTotal([s.profile.emergency_reserve_paise, earmarked]);
  const rows = [];
  for (let i = 0; i <= horizon; i++) {
    const date = iso(new Date(asDate(asOf).valueOf() + i * dayMs));
    const dayEvents = i ? events.filter((e) => e.date === date) : [];
    for (const e of dayEvents) {
      if (balances.has(e.account_id))
        balances.set(
          e.account_id,
          safeTotal([balances.get(e.account_id)!, e.amount]),
        );
      if (e.to_account_id && balances.has(e.to_account_id))
        balances.set(
          e.to_account_id,
          safeTotal([balances.get(e.to_account_id)!, -e.amount]),
        );
    }
    const cash = safeTotal([...balances.values()]);
    const spendable = safeTotal([cash, -reserve]);
    rows.push({
      date,
      cash,
      spendable,
      accounts: Object.fromEntries(balances),
      events: dayEvents,
    });
  }
  return {
    rows,
    accounts,
    warnings: [...new Set(warnings)],
    firstLow:
      rows.find(
        (r) => r.spendable < 0 || Object.values(r.accounts).some((v) => v < 0),
      )?.date ?? null,
    reserve,
  };
}
