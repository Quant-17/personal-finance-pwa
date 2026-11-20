import { describe, expect, it } from "vitest";
import { CSV_TEMPLATE, csvPreview, readCsv } from "./csv";
const categories = [
  {
    id: "11b52b82-8714-46ff-bf2b-87fa35e6324b",
    name: "Food & groceries",
    kind: "expense" as const,
  },
  {
    id: "f1e8c598-224d-4591-80fc-5d7c30f019fc",
    name: "Salary",
    kind: "income" as const,
  },
];
const valid = "2026-11-19,expense,100.29,Food & groceries,Lunch";
const preview = (text: string) =>
  csvPreview(text, categories, "2026-01-01", "2026-11-20");
describe("CSV preview", () => {
  it("reads BOM/CRLF, escaped quotes, quoted commas/newlines and reordered headers", () => {
    const rows = preview(
      '\uFEFFdescription,category,amount,type,date\r\n"Lunch, ""special""\nmenu",Food & groceries,100.29,expense,2026-11-19\r\n',
    );
    expect(rows[0].entry).toEqual({
      occurred_on: "2026-11-19",
      kind: "expense",
      amount_paise: 10029,
      category_id: categories[0].id,
      description: 'Lunch, "special"\nmenu',
    });
    expect(rows[0].error).toBe("");
  });
  it("recognizes repeated normalized records without confusing different descriptions or amounts", () => {
    const rows = preview(
      CSV_TEMPLATE +
        [
          valid,
          valid.replace("Food & groceries", " food & GROCERIES "),
          valid.replace("Lunch", "Dinner"),
          valid.replace("100.29", "100.30"),
        ].join("\n"),
    );
    expect(rows.map((r) => r.repeated)).toEqual([false, true, false, false]);
    expect(rows[3].entry?.amount_paise).toBe(10030);
  });
  it.each([
    valid.replace("2026-11-19", "2026-02-30"),
    valid.replace("2026-11-19", "19/11/2026"),
    valid.replace("2026-11-19", "2027-01-01"),
    valid.replace("2026-11-19", "2025-12-31"),
    valid.replace("expense", "transfer"),
    valid.replace("100.29", "-1"),
    valid.replace("100.29", "0"),
    valid.replace("100.29", "1.001"),
    valid.replace("100.29", "1e3"),
    valid.replace("100.29", "NaN"),
    valid.replace("100.29", "10000000000.01"),
    valid.replace("Food & groceries", "Unknown"),
    valid.replace("Food & groceries", "Salary"),
    valid.replace("Lunch", "x".repeat(241)),
    valid + ",extra",
  ])("marks invalid rows without producing an import payload: %s", (row) => {
    const result = preview(CSV_TEMPLATE + row);
    expect(result[0].entry).toBeNull();
    expect(result[0].error).not.toBe("");
  });
  it("does not execute formula-looking text, and treats blank descriptions as text", () => {
    const row = preview(
      CSV_TEMPLATE +
        valid
          .replace("Lunch", '=HYPERLINK(""unsafe"")')
          .replace('=HYPERLINK(""unsafe"")', "=1+1"),
    )[0];
    expect(row.entry?.description).toBe("=1+1");
    expect(
      preview(CSV_TEMPLATE + valid.replace("Lunch", ""))[0].entry?.description,
    ).toBe("");
  });
  it("handles the paise boundary and case-normalized income", () => {
    const rows = preview(
      CSV_TEMPLATE + "2026-11-20,INCOME,10000000000, salary ,Pay",
    );
    expect(rows[0].entry?.amount_paise).toBe(1000000000000);
    expect(rows[0].entry?.kind).toBe("income");
  });
  it("rejects malformed structure, binary content, ambiguous categories and empty files", () => {
    for (const text of [
      "",
      CSV_TEMPLATE,
      "date,type,amount,category,date\n" + valid,
      CSV_TEMPLATE + '"unterminated',
      CSV_TEMPLATE + 'x"quote',
      CSV_TEMPLATE + '"closed"oops',
      "x".repeat(1048577),
      CSV_TEMPLATE + "\0",
    ])
      expect(() => preview(text)).toThrow();
    expect(
      csvPreview(
        CSV_TEMPLATE + valid,
        [...categories, { ...categories[0], name: "food & groceries" }],
        "2026-01-01",
        "2026-11-20",
      )[0].entry,
    ).toBeNull();
  });
  it("caps the record count and ignores blank records", () => {
    expect(
      preview(CSV_TEMPLATE + Array(500).fill(valid).join("\n")),
    ).toHaveLength(500);
    expect(() =>
      preview(CSV_TEMPLATE + Array(501).fill(valid).join("\n")),
    ).toThrow(/500/);
    expect(readCsv(CSV_TEMPLATE + "\r\n" + valid + "\r\n\r\n")).toHaveLength(2);
  });
});
