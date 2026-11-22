import Decimal from "decimal.js";
import { safeTotal } from "./domain";
export type ReturnEntry = {
  id: string;
  kind: "valuation" | "self" | "employer" | "withdrawal";
  amount_paise: number;
  occurred_on: string;
  created_at: string;
};
export function investmentReturns(
  input: ReturnEntry[],
  openingStatement: boolean,
) {
  if (input.length > 10000) throw Error("Use at most 10,000 history rows.");
  for (const e of input)
    if (
      !Number.isSafeInteger(e.amount_paise) ||
      e.amount_paise < 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(e.occurred_on) ||
      !Number.isFinite(new Date(e.occurred_on + "T00:00:00Z").valueOf()) ||
      new Date(e.occurred_on + "T00:00:00Z").toISOString().slice(0, 10) !==
        e.occurred_on
    )
      throw Error("Review dated integer-paise history.");
  const entries = [...input].sort(
    (a, b) =>
      a.occurred_on.localeCompare(b.occurred_on) ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id),
  );
  const valuations = entries.filter((e) => e.kind === "valuation"),
    last = valuations.at(-1);
  if (!last) throw Error("Add a dated terminal statement value.");
  const opening = openingStatement ? valuations[0] : null;
  if (opening?.id === last.id)
    throw Error(
      "Use two dated valuations for a statement-to-statement return.",
    );
  const dated = entries.filter(
    (e) =>
      e.kind !== "valuation" &&
      e.occurred_on <= last.occurred_on &&
      (!opening || e.occurred_on > opening.occurred_on),
  );
  const self = safeTotal(
      dated.filter((e) => e.kind === "self").map((e) => e.amount_paise),
    ),
    employer = safeTotal(
      dated.filter((e) => e.kind === "employer").map((e) => e.amount_paise),
    ),
    withdrawn = safeTotal(
      dated.filter((e) => e.kind === "withdrawal").map((e) => e.amount_paise),
    );
  const gain = safeTotal([
    last.amount_paise,
    withdrawn,
    -(opening?.amount_paise ?? 0),
    -self,
    -employer,
  ]);
  const flows = new Map<string, number>();
  const add = (date: string, value: number) =>
    flows.set(date, safeTotal([flows.get(date) ?? 0, value]));
  if (opening) add(opening.occurred_on, -opening.amount_paise);
  for (const e of dated)
    add(
      e.occurred_on,
      e.kind === "withdrawal" ? e.amount_paise : -e.amount_paise,
    );
  add(last.occurred_on, last.amount_paise);
  const ordered = [...flows]
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([, v]) => v !== 0);
  const result = {
    self,
    employer,
    withdrawn,
    gain,
    closing: last.amount_paise,
    opening: opening?.amount_paise ?? 0,
    start: opening?.occurred_on ?? ordered[0]?.[0] ?? last.occurred_on,
    end: last.occurred_on,
    ignoredAfter: entries.filter(
      (e) => e.kind !== "valuation" && e.occurred_on > last.occurred_on,
    ).length,
    xirr: null as number | null,
    reason: "",
  };
  if (ordered.length < 2 || ordered[0][1] >= 0 || ordered.at(-1)![1] <= 0) {
    result.reason =
      "A dated initial investment and later positive terminal cash flow are required.";
    return result;
  }
  const signs = ordered.map(([, v]) => Math.sign(v));
  const changes = signs.slice(1).filter((v, i) => v !== signs[i]).length;
  if (changes !== 1) {
    result.reason =
      "Withdrawals followed by further contributions can create multiple XIRRs. No single rate is shown for this cash-flow pattern.";
    return result;
  }
  const start = new Date(ordered[0][0] + "T00:00:00Z").valueOf();
  const values = ordered.map(([date, value]) => ({
    years: (new Date(date + "T00:00:00Z").valueOf() - start) / 86400000 / 365,
    value,
  }));
  if (values.at(-1)!.years <= 0) {
    result.reason = "The return period must span more than one day.";
    return result;
  }
  const scale = values
    .reduce((sum, x) => sum.plus(Math.abs(x.value)), new Decimal(0))
    .toNumber();
  const npv = (y: number) => {
    const max = Math.max(...values.map((v) => -y * v.years));
    let sum = 0,
      compensation = 0;
    for (const v of values) {
      const term =
        (v.value / scale) * Math.exp(-y * v.years - max) - compensation;
      const next = sum + term;
      compensation = next - sum - term;
      sum = next;
    }
    return sum;
  };
  let low = Math.log(0.0001),
    high = Math.log(1001),
    a = npv(low),
    b = npv(high);
  if (a * b > 0) {
    result.reason =
      "No XIRR was found in the supported −99.99% to 100,000% annual range.";
    return result;
  }
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2,
      c = npv(mid);
    if (c === 0) {
      low = high = mid;
      break;
    }
    if (Math.sign(c) === Math.sign(a)) {
      low = mid;
      a = c;
    } else {
      high = mid;
      b = c;
    }
  }
  result.xirr = Math.expm1((low + high) / 2);
  return result;
}
