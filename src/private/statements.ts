import { indiaDate, moneyInput } from "./domain";
import type { CsvEntry } from "./csv";
import type { Snapshot } from "./domain";
import type { PdfLine } from "./readPdfText";
import {
  positionedWords,
  prepareStatementLayout,
  statementDatePrefix,
} from "./statementLayouts";
export type StatementDraft = {
  source_row: string;
  page: number;
  source: string;
  date: string;
  description: string;
  amount: string;
  kind: "expense" | "income" | "loan_payment" | "";
  loan_id?: string;
  principal?: string;
  interest?: string;
  category_id: string;
  selected: boolean;
  note: string;
};
export type StatementEntry = {
  source_row: string;
  entry:
    | CsvEntry
    | {
        kind: "loan_payment";
        occurred_on: string;
        amount_paise: number;
        loan_id: string;
        principal_paise: number;
        interest_paise: number;
        description: string;
      };
};
const months = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
export function statementDate(raw: string, endingMonth: string) {
  const parts = raw
    .trim()
    .toLowerCase()
    .split(/[ /.-]+/);
  if (
    parts.length < 2 ||
    parts.length > 3 ||
    !/^\d{4}-\d{2}$/.test(endingMonth)
  )
    return "";
  let year = Number(endingMonth.slice(0, 4)),
    month = 0,
    day = 0;
  if (parts[0].length === 4 && parts.length === 3) {
    year = Number(parts[0]);
    month = Number(parts[1]);
    day = Number(parts[2]);
  } else {
    day = Number(parts[0]);
    month = /^\d+$/.test(parts[1])
      ? Number(parts[1])
      : months.indexOf(parts[1].slice(0, 3)) + 1;
    if (parts[2]) year = Number(parts[2]) + (parts[2].length === 2 ? 2000 : 0);
    else if (month > Number(endingMonth.slice(5))) year--;
  }
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const date = new Date(iso + "T00:00:00Z");
  return Number.isFinite(date.valueOf()) &&
    date.toISOString().slice(0, 10) === iso
    ? iso
    : "";
}
const dateAtStart = statementDatePrefix;
const numberPattern =
  /(?:₹|INR\s*|Rs\.?\s*)?(-?\(?\d[\d,]*\.\d{2}\)?)(?![\d.])(?:\s*(CR|DR))?/gi;
export function statementMoney(raw: string) {
  const text = raw
    .trim()
    .replace(/^(?:INR|Rs\.?|₹)\s*/i, "")
    .replace(/^\(/, "")
    .replace(/\)$/, "")
    .replace(/^-/, "");
  if (
    !/^(?:\d+|\d{1,3}(?:,\d{2})*,\d{3}|\d{1,3}(?:,\d{3})+)(?:\.\d{2})$/.test(
      text,
    )
  )
    return "";
  try {
    const normalized = text.replaceAll(",", "");
    return moneyInput(normalized) > 0 ? normalized : "";
  } catch {
    return "";
  }
}
export function extractStatement(
  lines: PdfLine[],
  endingMonth: string,
  card: boolean,
): StatementDraft[] {
  const rows: StatementDraft[] = [];
  let columns: { label: "expense" | "credit" | "balance"; x: number }[] = [];
  let lastPage = 0;
  for (const line of prepareStatementLayout(lines, card)) {
    if (line.page !== lastPage) {
      lastPage = line.page;
      columns = [];
    }
    const words = positionedWords(line);
    const headings = words.flatMap<{
      label: "expense" | "credit" | "balance";
      x: number;
    }>((w) =>
      /^(debit|withdrawals?|withdrawn)(?:\b|\()/i.test(w.text)
        ? [{ label: "expense" as const, x: w.left }]
        : /^(credit|deposits?)(?:\b|\()/i.test(w.text)
          ? [{ label: "credit" as const, x: w.left }]
          : /^balance(?:\b|\()/i.test(w.text)
            ? [{ label: "balance" as const, x: w.left }]
            : [],
    );
    if (headings.length >= 2 && !dateAtStart.test(line.text)) {
      columns = headings;
      continue;
    }
    const dateMatch = line.text.match(dateAtStart);
    if (!dateMatch) {
      // Wrapped descriptions are only taken before any footer/summary, within a page.
      const previous = rows.at(-1);
      if (
        previous?.page === line.page &&
        !/\b(total|balance|summary|statement|page|amount due|credit limit|terms|payment due)\b/i.test(
          line.text,
        ) &&
        line.text.trim() &&
        !numberPattern.test(line.text)
      )
        previous.description = (
          previous.description +
          " " +
          line.text.trim()
        ).slice(0, 240);
      numberPattern.lastIndex = 0;
      continue;
    }
    if (rows.length >= 500)
      throw new Error(
        "Import at most 500 transaction rows. Split a longer statement into smaller PDFs.",
      );
    const rest = line.text
      .slice(dateMatch[0].length)
      .trim()
      .replace(dateAtStart, "")
      .trim();
    const values = [...rest.matchAll(numberPattern)].map((m) => ({
      text: m[1],
      amount: statementMoney(m[1]),
      credit:
        m[2]?.toUpperCase() === "CR" ||
        m[1].startsWith("-") ||
        m[1].startsWith("("),
    }));
    let amount = "",
      kind: StatementDraft["kind"] = "",
      note = "Review amount and transaction type.";
    if (card && values.length === 1) {
      amount = values[0].amount;
      kind = values[0].credit ? "" : "expense";
      note = values[0].credit
        ? "Credit/refund/payment: reconcile manually; do not treat it as salary."
        : "Card debit: verify this is a settled purchase.";
    } else if (
      !card &&
      columns.some((c) => c.label === "expense") &&
      columns.some((c) => c.label === "credit")
    ) {
      const amounts = words.filter((w) =>
        statementMoney(w.text.replace(/(?:CR|DR)$/i, "")),
      );
      const classified = amounts.map((w) => ({
        amount: statementMoney(w.text.replace(/(?:CR|DR)$/i, "")),
        column: [...columns]
          .filter((c) => w.right >= c.x - 1)
          .sort((a, b) => b.x - a.x)[0],
      }));
      const debits = classified.filter((v) => v.column?.label === "expense"),
        credits = classified.filter((v) => v.column?.label === "credit");
      if (debits.length === 1 && credits.length === 0) {
        amount = debits[0].amount;
        kind = "expense";
        note = "Debit column: compare with the original statement.";
      } else if (credits.length === 1 && debits.length === 0) {
        amount = credits[0].amount;
        note =
          "Credit: review whether income, refund or a transfer. Excluded until classified.";
      }
    } else if (values.length === 1) {
      amount = values[0].amount;
      note =
        "One amount found; verify its direction. No transaction type was assumed.";
    }
    const risky =
      /\b(NEFT|IMPS|transfer|EMI|loan|payment received|autopay|card payment|payment thank|pending|failed|declined|cancelled)\b/i.test(
        line.narration ?? rest,
      );
    const semanticText = line.narration ?? rest;
    if (
      /\b(refund|reversal|cashback)\b/i.test(semanticText) ||
      (card && /\bCR\b/i.test(rest))
    ) {
      kind = "";
      note =
        "Credit/refund: reconcile against the original payment; do not import it as salary.";
    }
    if (risky) {
      kind = "";
      note =
        "Possible transfer, repayment, credit or unsettled transaction. For a standalone loan EMI, select EMI / loan repayment and review its split; otherwise use the dedicated form or verify normal income/expense.";
    }
    const description = (
      line.narration ??
      rest.replace(numberPattern, " ").replace(/\s+/g, " ").trim()
    ).slice(0, 240);
    const date = statementDate(dateMatch[1], endingMonth);
    rows.push({
      source_row: `${line.page}:${line.line}`,
      page: line.page,
      source: (line.source_context ?? line.text).slice(0, 1200),
      date,
      description,
      amount,
      kind,
      category_id: "",
      selected: false,
      note: date
        ? note
        : "Date could not be read. Correct it before selecting this row.",
    });
  }
  if (!rows.length)
    throw new Error(
      "No supported dated transaction rows were found. This PDF layout needs manual entry or a supported export; nothing was imported.",
    );
  return rows;
}
export function reviewedStatementEntry(
  row: StatementDraft,
  s: Snapshot,
  account: string,
  today = indiaDate(),
): StatementEntry {
  const a = s.accounts.find((a) => a.id === account && !a.archived_at);
  if (!a) throw new Error("Choose an active account.");
  const parsed = new Date(row.date + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
    !Number.isFinite(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== row.date ||
    row.date < a.opening_date ||
    row.date > today
  )
    throw new Error(
      "Use a settled date on/after account opening and not in the future.",
    );
  if (!row.kind)
    throw new Error(
      "Choose income, expense or EMI / loan repayment; leave transfers excluded.",
    );
  const amount = moneyInput(row.amount);
  if (amount <= 0) throw new Error("Enter a positive amount in rupees.");
  if (!row.description.trim() || row.description.length > 240)
    throw new Error("Review a description of 1–240 characters.");
  if (row.kind === "loan_payment") {
    if (a.type === "credit_card")
      throw new Error("Choose the bank account that paid this EMI.");
    const loan = s.loans.find(
      (l) =>
        l.id === row.loan_id && l.status === "active" && !l.card_account_id,
    );
    if (!loan) throw new Error("Choose an active standalone loan.");
    if (row.date < loan.start_date)
      throw new Error(
        "Payment predates the loan tracking balance. Do not import payments already included in that balance.",
      );
    const principal = moneyInput(row.principal ?? ""),
      interest = moneyInput(row.interest ?? "");
    if (principal + interest !== amount)
      throw new Error(
        "Reviewed principal + interest must equal the statement debit exactly.",
      );
    // Outstanding is enforced by PostgreSQL only for new rows, after duplicate detection.
    return {
      source_row: row.source_row,
      entry: {
        kind: "loan_payment",
        occurred_on: row.date,
        amount_paise: amount,
        loan_id: loan.id,
        principal_paise: principal,
        interest_paise: interest,
        description: row.description.trim(),
      },
    };
  }
  const category = s.categories.find(
    (c) => c.id === row.category_id && c.kind === row.kind,
  );
  if (!category)
    throw new Error("Choose a category matching the transaction type.");
  return {
    source_row: row.source_row,
    entry: {
      occurred_on: row.date,
      kind: row.kind,
      amount_paise: amount,
      category_id: category.id,
      description: row.description.trim(),
    },
  };
}
