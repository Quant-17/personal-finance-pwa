import { z } from "zod";
import { moneyInput } from "./domain";
import type { Snapshot } from "./domain";
import type { StatementDraft } from "./statements";
import {
  statementNeedsReconciliation,
  statementRecipient,
} from "./statementRecipients";
export const statementRuleSchema = z.object({
  id: z.uuid(),
  account_id: z.uuid(),
  recipient_key: z.string().min(3).max(240),
  recipient_name: z.string().min(1).max(120),
  review_note: z.string().max(160),
  direction: z.enum(["debit", "credit"]),
  kind: z.enum(["expense", "income", "loan_payment", "exclude"]),
  category_id: z.uuid().nullable(),
  loan_id: z.uuid().nullable(),
  subscription_id: z.uuid().nullable(),
  amount_paise: z.number().int().positive().max(1e12).nullable(),
  enabled: z.boolean(),
});
export type StatementRule = z.infer<typeof statementRuleSchema>;
export type RuleInput = Omit<StatementRule, "id" | "enabled">;
export function ruleFromRow(
  row: StatementDraft,
  account: string,
  exactAmount: boolean,
): RuleInput {
  const recipient = statementRecipient(row.narration ?? row.description);
  if (!recipient || recipient.key.length > 240)
    throw new Error(
      "No reliable recipient identity was extracted. Keep this row manual.",
    );
  if (row.card_statement && row.direction === "credit" && row.kind)
    throw new Error(
      "Card credits need reconciliation. Only an exclusion rule can be saved.",
    );
  if (recipient.exclusionOnly && row.kind)
    throw new Error(
      "This narration does not identify the recipient. Save an exclusion and review it in the dedicated section.",
    );
  if (!row.direction || row.direction === "unknown")
    throw new Error(
      "The statement direction is unknown. Keep this row manual.",
    );
  if (
    row.kind &&
    statementNeedsReconciliation(row.narration ?? row.description)
  )
    throw new Error(
      "This row needs reconciliation. Only an exclusion rule can be saved.",
    );
  if ((row.kind === "expense" || row.kind === "income") && !row.category_id)
    throw new Error("Choose a category before saving this rule.");
  if (row.kind === "loan_payment" && !row.loan_id)
    throw new Error("Choose the loan before saving this rule.");
  if (
    (row.kind === "income" && row.direction !== "credit") ||
    (row.kind && row.kind !== "income" && row.direction !== "debit")
  )
    throw new Error("Classification does not match the statement direction.");
  return {
    account_id: account,
    recipient_key: recipient.key,
    recipient_name: recipient.name,
    review_note: (row.rule_note ?? "").trim().slice(0, 160),
    direction: row.direction,
    kind: row.kind || "exclude",
    category_id:
      row.kind === "expense" || row.kind === "income" ? row.category_id : null,
    loan_id: row.kind === "loan_payment" ? row.loan_id! : null,
    subscription_id:
      row.kind === "expense" ? row.subscription_id || null : null,
    amount_paise:
      exactAmount ||
      recipient.exclusionOnly ||
      row.kind === "loan_payment" ||
      !!row.subscription_id
        ? moneyInput(row.amount)
        : null,
  };
}
function targetValid(r: StatementRule, s: Snapshot, account: string) {
  if (r.kind === "exclude") return true;
  if (r.kind === "loan_payment")
    return (
      s.accounts.some((a) => a.id === account && a.type !== "credit_card") &&
      s.loans.some(
        (l) =>
          l.id === r.loan_id && l.status === "active" && !l.card_account_id,
      )
    );
  return (
    s.categories.some((c) => c.id === r.category_id && c.kind === r.kind) &&
    (!r.subscription_id ||
      s.subscriptions.some(
        (sub) =>
          sub.id === r.subscription_id &&
          sub.active &&
          (!sub.account_id || sub.account_id === account),
      ))
  );
}
export function suggestStatementRule(
  row: StatementDraft,
  rules: StatementRule[],
  account: string,
  s: Snapshot,
): StatementDraft {
  const recipient = statementRecipient(row.narration ?? row.description);
  if (!recipient || !row.direction || row.direction === "unknown") return row;
  let amount: number;
  try {
    amount = moneyInput(row.amount);
  } catch {
    return row;
  }
  const matches = rules.filter(
    (r) =>
      r.enabled &&
      r.account_id === account &&
      r.direction === row.direction &&
      r.recipient_key === recipient.key &&
      (r.amount_paise === null || r.amount_paise === amount),
  );
  if (!matches.length) return row;
  // A stale or conflicting rule must not silently fall back to a different classification.
  const targets = new Set(
    matches.map((r) =>
      JSON.stringify([r.kind, r.category_id, r.loan_id, r.subscription_id]),
    ),
  );
  if (targets.size !== 1 || matches.some((r) => !targetValid(r, s, account)))
    return {
      ...row,
      kind: "",
      category_id: "",
      selected: false,
      note: "Remembered rules conflict or their target is unavailable. Classify manually.",
    };
  const r = matches[0];
  if (
    (row.card_statement ||
      s.accounts.some((a) => a.id === account && a.type === "credit_card")) &&
    row.direction === "credit" &&
    r.kind !== "exclude"
  )
    return row;
  if (
    recipient.exclusionOnly &&
    (r.kind !== "exclude" || r.amount_paise === null)
  )
    return row;
  if (
    r.kind !== "exclude" &&
    statementNeedsReconciliation(row.narration ?? row.description)
  )
    return row;
  return {
    ...row,
    kind: r.kind === "exclude" ? "" : r.kind,
    category_id: r.category_id ?? "",
    loan_id: r.loan_id ?? "",
    subscription_id: r.subscription_id ?? "",
    principal: "",
    interest: "",
    selected: false,
    note:
      r.kind === "exclude"
        ? `Remembered exclusion: ${recipient.name}. No money will be posted. ${r.review_note}`
        : `Remembered recipient: ${recipient.name}. ${r.review_note} Review before selecting${r.kind === "loan_payment" ? "; enter this month’s principal/interest split" : ""}.`,
  };
}
