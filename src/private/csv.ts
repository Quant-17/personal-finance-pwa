import { indiaDate, moneyInput } from "./domain";

export const CSV_TEMPLATE = "date,type,amount,category,description\r\n";
export const CSV_MAX_BYTES = 1_048_576;
export const CSV_MAX_ROWS = 500;
export type CsvEntry = {
  occurred_on: string;
  kind: "income" | "expense";
  amount_paise: number;
  category_id: string;
  description: string;
};
export type CsvRow = {
  line: number;
  cells: string[];
  entry: CsvEntry | null;
  error: string;
  repeated: boolean;
};
type Category = { id: string; name: string; kind: "income" | "expense" };

/** Bounded RFC 4180-style reader: quotes, escaped quotes, embedded newlines and BOM. */
export function readCsv(source: string): string[][] {
  if (new TextEncoder().encode(source).length > CSV_MAX_BYTES)
    throw new Error("Choose a CSV file no larger than 1 MiB.");
  if (source.includes("\0"))
    throw new Error("Use a UTF-8 text CSV without NUL characters.");
  const text = source.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  const pushRow = () => {
    row.push(field);
    field = "";
    closed = false;
    if (row.some((cell) => cell.trim() !== "")) records.push(row);
    row = [];
    if (records.length > CSV_MAX_ROWS + 1)
      throw new Error("Import at most 500 transactions per file.");
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
    } else if (c === ",") {
      row.push(field);
      field = "";
      closed = false;
      if (row.length > 5)
        throw new Error(
          "Use exactly the five columns in the Folio CSV template.",
        );
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      pushRow();
    } else if (c === '"' && field.length === 0 && !closed) quoted = true;
    else {
      if (closed || c === '"')
        throw new Error(
          "Malformed CSV quoting. Use double quotes around cells containing commas or newlines.",
        );
      field += c;
    }
  }
  if (quoted) throw new Error("The CSV ends inside a quoted cell.");
  if (field || row.length || closed) pushRow();
  return records;
}
export function csvPreview(
  source: string,
  categories: Category[],
  openingDate: string,
  today = indiaDate(),
): CsvRow[] {
  const records = readCsv(source);
  const headers =
    records.shift()?.map((cell) => cell.trim().toLowerCase()) ?? [];
  const required = ["date", "type", "amount", "category", "description"];
  if (
    headers.length !== 5 ||
    new Set(headers).size !== 5 ||
    required.some((key) => !headers.includes(key))
  )
    throw new Error(
      "Use the columns date, type, amount, category, description (in any order).",
    );
  if (!records.length)
    throw new Error("Add at least one transaction below the header.");
  const seen = new Set<string>();
  return records.map((cells, i) => {
    const result: CsvRow = {
      line: i + 2,
      cells,
      entry: null,
      error: "",
      repeated: false,
    };
    try {
      if (cells.length !== 5)
        throw new Error("This row must contain five cells.");
      const cell = (key: string) => cells[headers.indexOf(key)].trim();
      const date = cell("date");
      const parsed = new Date(date + "T00:00:00Z");
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(parsed.valueOf()) ||
        parsed.toISOString().slice(0, 10) !== date
      )
        throw new Error("Use a real date in YYYY-MM-DD format.");
      if (date < openingDate || date > today)
        throw new Error(
          "Date must be on/after the account opening and not in the future.",
        );
      const kind = cell("type").toLowerCase();
      if (kind !== "income" && kind !== "expense")
        throw new Error(
          "Type must be income or expense; transfers and loan payments need their dedicated forms.",
        );
      const amount = moneyInput(cell("amount"));
      if (amount <= 0)
        throw new Error(
          "Use a positive rupee amount; type determines money in or out.",
        );
      const matching = categories.filter(
        (c) =>
          c.kind === kind &&
          c.name.trim().toLowerCase() === cell("category").toLowerCase(),
      );
      if (matching.length !== 1)
        throw new Error(
          "Use an existing category name matching the transaction type.",
        );
      const description = cell("description");
      if (description.length > 240)
        throw new Error("Keep the description within 240 characters.");
      result.entry = {
        occurred_on: date,
        kind,
        amount_paise: amount,
        category_id: matching[0].id,
        description,
      };
      const signature = JSON.stringify(result.entry);
      result.repeated = seen.has(signature);
      seen.add(signature);
    } catch (failure) {
      result.error =
        failure instanceof Error ? failure.message : "Invalid transaction.";
    }
    return result;
  });
}
