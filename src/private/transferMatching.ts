import { moneyInput } from "./domain";
import type { StatementDraft } from "./statements";
export type TransferPair = {
  debit: StatementDraft;
  credit: StatementDraft;
  amount: number;
  days: number;
  key: string;
};
const unsafe =
  /\b(refund|reversal|reversed|cashback|pending|failed|declined|cancelled)\b/i;
export function transferPairs(
  debits: StatementDraft[],
  credits: StatementDraft[],
): TransferPair[] {
  const groups = new Map<number, StatementDraft[]>();
  const valid = (r: StatementDraft) =>
    /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
    Number.isFinite(new Date(r.date + "T00:00:00Z").valueOf()) &&
    new Date(r.date + "T00:00:00Z").toISOString().slice(0, 10) === r.date &&
    !unsafe.test(r.narration ?? r.description);
  for (const r of credits) {
    if (r.direction !== "credit" || !valid(r)) continue;
    let amount: number;
    try {
      amount = moneyInput(r.amount);
    } catch {
      continue;
    }
    if (amount <= 0) continue;
    groups.set(amount, [...(groups.get(amount) ?? []), r]);
  }
  const pairs: TransferPair[] = [];
  for (const debit of debits) {
    if (debit.direction !== "debit" || !valid(debit)) continue;
    let amount: number;
    try {
      amount = moneyInput(debit.amount);
    } catch {
      continue;
    }
    for (const credit of groups.get(amount) ?? []) {
      const days =
        Math.abs(Date.parse(debit.date) - Date.parse(credit.date)) / 86400000;
      if (days <= 3)
        pairs.push({
          debit,
          credit,
          amount,
          days,
          key: debit.source_row + "/" + credit.source_row,
        });
      if (pairs.length > 2000)
        throw Error(
          "Too many similar payments. Use a narrower statement period or reconcile manually.",
        );
    }
  }
  return pairs.sort(
    (a, b) =>
      a.days - b.days ||
      a.debit.date.localeCompare(b.debit.date) ||
      a.key.localeCompare(b.key),
  );
}
