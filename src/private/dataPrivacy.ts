import { z } from "zod";
import type { Snapshot } from "./domain";
const tables = [
  "profiles",
  "accounts",
  "categories",
  "transactions",
  "loans",
  "loan_payments",
  "subscriptions",
  "budgets",
  "savings_goals",
  "goal_allocations",
  "loan_document_details",
  "saved_simulations",
  "investment_holdings",
  "investment_entries",
  "statement_rules",
] as const;
export function financialExport(value: unknown, owner: string) {
  const parsed = z
    .object({
      format: z.literal("folio-financial-export"),
      schema_version: z.literal(1),
      owner_id: z.uuid(),
      exported_at: z.iso.datetime({ offset: true }),
      currency: z.literal("INR"),
      timezone: z.literal("Asia/Kolkata"),
      data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
    })
    .parse(value);
  if (
    parsed.owner_id !== owner ||
    Object.keys(parsed.data).length !== tables.length ||
    tables.some((t) => !Array.isArray(parsed.data[t]))
  )
    throw new Error("Export identity or tables could not be verified.");
  for (const name of tables)
    for (const row of parsed.data[name]) {
      if ((name === "profiles" ? row.id : row.user_id) !== owner)
        throw new Error("Export ownership could not be verified.");
    }
  const text = JSON.stringify(parsed, null, 2) + "\n";
  if (new Blob([text]).size > 24 * 1024 * 1024)
    throw new Error("Export is too large for this device download.");
  return text;
}
export function importReadiness(s: Snapshot, month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new Error("Choose a valid statement month.");
  const start = month + "-01";
  const date = new Date(start + "T00:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  const end = date.toISOString().slice(0, 10);
  return {
    cutoff:
      s.profile.tracking_start_date && s.profile.tracking_start_date > start
        ? s.profile.tracking_start_date
        : null,
    accounts: s.accounts
      .filter(
        (a) =>
          !a.archived_at && ["bank", "savings", "credit_card"].includes(a.type),
      )
      .map((a) => ({
        ...a,
        needsReview: a.opening_date > start,
        entireMonthBlocked: a.opening_date > end,
      })),
    loans: s.loans.filter(
      (l) =>
        l.status === "active" && !l.card_account_id && l.start_date > start,
    ),
  };
}
