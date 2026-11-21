import { expect, it } from "vitest";
import { extractStatement } from "./statements";
import type { PdfLine } from "./readPdfText";
const line = (
  n: number,
  y: number,
  cells: [string, number, number?][],
  page = 1,
): PdfLine => ({
  page,
  line: n,
  y,
  page_width: 600,
  text: cells.map((c) => c[0]).join(" "),
  spans: cells.map(([text, x, width]) => ({
    text,
    x,
    width: width ?? text.length * 4,
  })),
});
const kotakHeader = (page = 1) =>
  line(
    1,
    750,
    [
      ["Date", 75],
      ["Description", 124],
      ["Ref No.", 280],
      ["Withdrawal (Dr.)", 355],
      ["Deposit (Cr.)", 429],
      ["Balance", 498],
    ],
    page,
  );
it("reassembles numbered Kotak rows and right-aligned small debits without treating them as deposits", () => {
  const lines = [
    kotakHeader(),
    line(2, 700, [
      ["7", 39],
      ["03 May 2026", 73],
      ["SYNTHETIC SERVICE", 119],
      ["REF-ALPHA", 275],
      ["10.37", 401, 22],
      ["8,001.29", 529, 40],
    ]),
    line(3, 690, [["quoted 980.00 in narration", 119, 145]]),
    line(4, 660, [
      ["8", 39],
      ["04 May 2026", 73],
      ["SYNTHETIC CREDIT", 119],
      ["REF-BETA", 275],
      ["500.00", 465, 26],
      ["8,501.29", 529, 40],
    ]),
  ];
  const rows = extractStatement(lines, "2026-05", false);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({
    date: "2026-05-03",
    amount: "10.37",
    kind: "expense",
    source_row: "1:2",
    selected: false,
  });
  expect(rows[0].description).toContain("quoted 980.00 in narration");
  expect(rows[0].description).toContain("REF-ALPHA");
  expect(rows[1]).toMatchObject({ amount: "500.00", kind: "" });
});
it("uses SBI post date, captures narration above/below centered date cells and excludes headerless summaries", () => {
  const lines = [
    line(1, 800, [["SYNTHETIC COVER", 20]]),
    line(2, 750, [["Balance", 515]]),
    line(3, 707, [["SYNTHETIC FIRST LINE", 138]]),
    line(4, 700, [
      ["01/05/2026", 28],
      ["03/05/2026", 85],
      ["-", 305],
      ["132.47", 355, 35],
      ["8,867.53", 525, 40],
    ]),
    line(5, 690, [["WRAPPED NARRATION", 138]]),
    line(6, 657, [["SYNTHETIC DEPOSIT", 138]]),
    line(7, 650, [
      ["02/05/2026", 28],
      ["04/05/2026", 85],
      ["-", 305],
      ["200.29", 440, 35],
      ["9,067.82", 525, 40],
    ]),
  ];
  const rows = extractStatement(lines, "2026-05", false);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({
    date: "2026-05-03",
    amount: "132.47",
    kind: "expense",
    description: "SYNTHETIC FIRST LINE WRAPPED NARRATION",
  });
  expect(rows[0].source).toContain("Value date: 01/05/2026");
  expect(rows[0].source).toContain("Post date: 03/05/2026");
  expect(rows[1]).toMatchObject({
    date: "2026-05-04",
    description: "SYNTHETIC DEPOSIT",
    amount: "200.29",
    kind: "",
  });
});
it("retains Kotak narration continuing below a repeated header on the next page", () => {
  const lines = [
    kotakHeader(),
    line(2, 700, [
      ["1", 39],
      ["03 May 2026", 73],
      ["SYNTHETIC LONG", 119],
      ["REF-GAMMA", 275],
      ["25.17", 401, 22],
      ["7,976.12", 529, 40],
    ]),
    kotakHeader(2),
    line(2, 730, [["CONTINUED DESCRIPTION", 119]], 2),
    line(
      3,
      710,
      [
        ["2", 39],
        ["04 May 2026", 73],
        ["SYNTHETIC NEXT", 119],
        ["REF-DELTA", 275],
        ["30.47", 401, 22],
        ["7,945.65", 529, 40],
      ],
      2,
    ),
  ];
  const rows = extractStatement(lines, "2026-05", false);
  expect(rows).toHaveLength(2);
  expect(rows[0].description).toContain("CONTINUED DESCRIPTION");
  expect(rows[0].source).toContain("continued on page 2");
  expect(rows[1].description).not.toContain("CONTINUED DESCRIPTION");
});
it("does not classify a balance's CR suffix as a refund of a bank debit", () => {
  const lines = [
    kotakHeader(),
    line(2, 700, [
      ["1", 39],
      ["03 May 2026", 73],
      ["SYNTHETIC PURCHASE", 119],
      ["REF-EPSILON", 275],
      ["25.17", 401, 22],
      ["7,976.12 CR", 529, 45],
    ]),
  ];
  expect(extractStatement(lines, "2026-05", false)[0]).toMatchObject({
    amount: "25.17",
    kind: "expense",
  });
});
it("keeps the date anchor when a blank narration cell starts its text on the next page", () => {
  const lines = [
    kotakHeader(),
    line(2, 700, [
      ["1", 39],
      ["03 May 2026", 73],
      ["-", 275],
      ["25.17", 401, 22],
      ["7976.12", 529, 40],
    ]),
    kotakHeader(2),
    line(2, 730, [["SYNTHETIC CONTINUED", 119]], 2),
    line(
      3,
      710,
      [
        ["2", 39],
        ["04 May 2026", 73],
        ["SYNTHETIC NEXT", 119],
        ["-", 275],
        ["30.47", 401, 22],
        ["7945.65", 529, 40],
      ],
      2,
    ),
  ];
  const rows = extractStatement(lines, "2026-05", false);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({
    date: "2026-05-03",
    description: "SYNTHETIC CONTINUED",
    amount: "25.17",
  });
});
