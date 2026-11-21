import type { PdfLine } from "./readPdfText";
// Optional printed row number, then an ISO/Indian numeric/English-month date.
export const statementDatePrefix =
  /^\s*(?:\d{1,5}\s+)?(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/. ](?:\d{1,2}|[A-Za-z]{3,9})(?:[-/. ]\d{2,4})?)(?=\s|$)/;
export function positionedWords(line: PdfLine) {
  return line.spans.flatMap((span) =>
    [...span.text.matchAll(/\S+/g)].map((m) => {
      const left =
        span.x + ((m.index ?? 0) * span.width) / Math.max(1, span.text.length);
      const right =
        left + (m[0].length * span.width) / Math.max(1, span.text.length);
      return { text: m[0], left, right, x: (left + right) / 2 };
    }),
  );
}
const rawMoney = (text: string) =>
  /^(?:₹|INR|Rs\.?)?-?\(?\d[\d,]*\.\d{2}\)?(?:CR|DR)?$/i.test(text);
type Profile = {
  twoDates: boolean;
  description: number;
  reference: number;
  debit: number;
  credit: number;
  balance: number;
  headerY: number;
};
function dateInfo(line: PdfLine) {
  const first = line.text.match(statementDatePrefix);
  if (!first) return null;
  const rest = line.text.slice(first[0].length).trim(),
    second = rest.match(statementDatePrefix);
  const words = positionedWords(line),
    ordinal = first[0].trim() !== first[1];
  return {
    first: first[1],
    second: second?.[1] ?? null,
    left: words[ordinal ? 1 : 0]?.left ?? Infinity,
    words,
  };
}
function profileFor(lines: PdfLine[]): Profile | null {
  for (const line of lines) {
    if (line.y === undefined || statementDatePrefix.test(line.text)) continue;
    const ws = positionedWords(line);
    const description = ws.find((w) =>
      /^(description|narration|particulars)(?:\b|\()/i.test(w.text),
    );
    const debit = ws.find((w) =>
      /^(withdrawals?|debit)(?:\b|\()/i.test(w.text),
    );
    const credit = ws.find((w) => /^(deposits?|credit)(?:\b|\()/i.test(w.text));
    const balance = ws.find((w) => /^balance(?:\b|\()/i.test(w.text));
    if (
      description &&
      debit &&
      credit &&
      balance &&
      description.left < debit.left &&
      debit.left < credit.left &&
      credit.left < balance.left
    ) {
      const reference = ws.find((w) =>
        /^(chq|cheque|ref)(?:\b|\/)/i.test(w.text),
      );
      return {
        twoDates: false,
        description: description.left - 10,
        reference: reference ? reference.left - 10 : debit.left - 20,
        debit: debit.left,
        credit: credit.left,
        balance: balance.left,
        headerY: line.y,
      };
    }
  }
  // SBI's supplied Value Date / Post Date grid has headings without reliable text.
  // Require paired left-hand dates AND right-aligned amount/balance columns before
  // using its page-relative table bands. A date alone never activates this adapter.
  for (const line of lines) {
    const d = dateInfo(line),
      width = line.page_width;
    if (!d?.second || !width || line.y === undefined || d.left > width * 0.12)
      continue;
    const monetary = d.words.filter((w) => rawMoney(w.text));
    const balance = monetary.some(
      (w) => w.right > width * 0.86 && w.right < width * 0.99,
    );
    const movement = monetary.some(
      (w) => w.right > width * 0.56 && w.right < width * 0.83,
    );
    if (balance && movement)
      return {
        twoDates: true,
        description: width * 0.225,
        reference: width * 0.47,
        debit: width * 0.55,
        credit: width * 0.69,
        balance: width * 0.825,
        headerY: line.y + 15,
      };
  }
  return null;
}
function narrative(lines: PdfLine[], profile: Profile) {
  const chunks: string[] = [];
  for (const line of lines) {
    const text = line.spans
      .filter((s) => s.x >= profile.description && s.x < profile.reference)
      .map((s) => s.text)
      .join(" ")
      .trim();
    if (
      /^(?:opening|closing|balance\s+(?:brought|carried)|total|summary|statement|page\s+\d)\b/i.test(
        text,
      )
    )
      break;
    if (text) chunks.push(text);
  }
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}
/** Reassemble printed table cells before generic parsing. Never execute PDF content. */
export function prepareStatementLayout(
  input: PdfLine[],
  card: boolean,
): PdfLine[] {
  if (card || !input.some((l) => l.y !== undefined)) return input;
  const result: PdfLine[] = [];
  let matched = false;
  const pages = [...new Set(input.map((l) => l.page))];
  const transactionRows: PdfLine[] = [];
  for (const page of pages) {
    const lines = input.filter((l) => l.page === page),
      profile = profileFor(lines);
    if (!profile) {
      continue;
    }
    const anchors = lines.flatMap((line) => {
      const info = dateInfo(line);
      if (
        !info ||
        line.y === undefined ||
        line.y > profile.headerY + 2 ||
        info.left >= profile.description - 10
      )
        return [];
      if (profile.twoDates && !info.second) return [];
      if (!info.words.some((w) => rawMoney(w.text) && w.right >= profile.debit))
        return [];
      return [{ line, info }];
    });
    if (!anchors.length) continue;
    matched = true;
    const lead = profile.twoDates ? 10 : 2;
    const previousRow = transactionRows.at(-1);
    // A description can continue underneath the repeated header on the next page.
    if (previousRow && previousRow.page === page - 1 && !profile.twoDates) {
      const leading = lines.filter(
        (l) =>
          l.y !== undefined &&
          l.y < profile.headerY - 2 &&
          l.y > anchors[0].line.y! + lead,
      );
      const continuation = narrative(leading, profile);
      if (continuation) {
        const before = previousRow.narration ?? "",
          combined = (before + " " + continuation).trim();
        previousRow.narration = combined;
        // Narration is carried separately; never rewrite immutable date/amount text.
        const span = previousRow.spans[1];
        if (span) span.text = combined;
        previousRow.source_context =
          (previousRow.source_context ?? "") +
          ` · continued on page ${page}: ` +
          continuation;
      }
    }
    result.push({
      page,
      line: 0,
      text: "Debit Credit Balance",
      spans: [
        { text: "Debit", x: profile.debit, width: 20 },
        { text: "Credit", x: profile.credit, width: 25 },
        { text: "Balance", x: profile.balance, width: 30 },
      ],
    });
    anchors.forEach(({ line, info }, index) => {
      const next = anchors[index + 1]?.line;
      const lower = next?.y !== undefined ? next.y + lead : line.y! - 80;
      const band = lines.filter(
        (l) => l.y !== undefined && l.y <= line.y! + lead && l.y > lower,
      );
      const details = narrative(band, profile);
      const reference = line.spans
        .filter(
          (s) => s.x >= profile.reference && s.x + s.width < profile.debit - 1,
        )
        .map((s) => s.text)
        .join(" ")
        .trim();
      const description = (
        details + (reference && reference !== "-" ? ` · ${reference}` : "")
      ).trim();
      const amounts = line.spans.filter(
        (s) =>
          s.x >= profile.debit - 40 &&
          s.x + s.width >= profile.debit &&
          /\d[\d,]*\.\d{2}/.test(s.text),
      );
      const primary = profile.twoDates ? info.second! : info.first;
      const secondary = profile.twoDates ? info.first : "";
      const text = [
        primary,
        secondary,
        description,
        ...amounts.map((s) => s.text),
      ]
        .filter(Boolean)
        .join(" ");
      const source_context = profile.twoDates
        ? `Post date: ${primary} · Value date: ${secondary} · ${details} · ${line.text}`
        : `${line.text} · ${details}`;
      const row: PdfLine = {
        ...line,
        text,
        narration: description,
        source_context,
        spans: [
          {
            text: primary + (secondary ? " " + secondary : ""),
            x: info.left,
            width: 95,
          },
          {
            text: description,
            x: profile.description,
            width: Math.max(1, profile.reference - profile.description - 2),
          },
          ...amounts,
        ],
      };
      result.push(row);
      transactionRows.push(row);
    });
  }
  return matched ? result : input;
}
