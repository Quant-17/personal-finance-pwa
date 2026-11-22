import { z } from "zod";
import type { Snapshot } from "./domain";
export const legacyArchiveTables = [
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
export const archiveTables = [
  ...legacyArchiveTables,
  "account_reconciliations",
  "month_reviews",
  "planning_settings",
  "planned_cash_events",
  "debt_terms",
  "audit_events",
] as const;
export function parseFinancialArchive(value: unknown, owner?: string) {
  const parsed = z
    .object({
      format: z.literal("folio-financial-export"),
      schema_version: z.union([z.literal(1), z.literal(2)]),
      owner_id: z.uuid(),
      exported_at: z.iso.datetime({ offset: true }),
      currency: z.literal("INR"),
      timezone: z.literal("Asia/Kolkata"),
      data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
      source_markers: z
        .object({
          statement_rows: z.array(z.record(z.string(), z.unknown())),
          transfer_sources: z.array(z.record(z.string(), z.unknown())),
        })
        .optional(),
    })
    .strict()
    .parse(value);
  const tables =
    parsed.schema_version === 1 ? legacyArchiveTables : archiveTables;
  if (
    (owner !== undefined && parsed.owner_id !== owner) ||
    Object.keys(parsed.data).length !== tables.length ||
    tables.some((t) => !Array.isArray(parsed.data[t]))
  )
    throw new Error("Export identity or tables could not be verified.");
  for (const name of tables)
    for (const row of parsed.data[name]) {
      if ((name === "profiles" ? row.id : row.user_id) !== parsed.owner_id)
        throw new Error("Export ownership could not be verified.");
    }
  if (parsed.schema_version === 2 && !parsed.source_markers)
    throw new Error("Archive source markers are missing.");
  for (const records of Object.values(parsed.source_markers ?? {}))
    for (const row of records)
      if (row.user_id !== parsed.owner_id)
        throw new Error("Source marker ownership could not be verified.");
  return parsed;
}
export function financialExport(value: unknown, owner: string) {
  const parsed = parseFinancialArchive(value, owner);
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
