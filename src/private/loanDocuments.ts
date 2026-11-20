import Decimal from "decimal.js";
import { z } from "zod";
import { indiaDate } from "./domain";

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type DocumentPage = { number: number; text: string };
export type SourceField<T> = { value: T | null; page: number | null };
export const providerNames = {
  credit_saison: "Credit Saison / CRED",
  kotak: "Kotak credit-card EMI",
  lt_finance: "L&T Finance",
};
export type Provider = keyof typeof providerNames;
const paise = z.number().int().min(0).max(1_000_000_000);
export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const date = new Date(v + "T00:00:00Z");
    return (
      Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === v
    );
  }, "Use a real YYYY-MM-DD date.");
export const documentScheduleRow = z
  .object({
    sequence: z.number().int().min(1).max(120),
    opening_paise: paise,
    principal_paise: paise,
    interest_paise: paise,
    payment_paise: paise.min(1),
    source_page: z.number().int().min(1).max(60).nullable(),
  })
  .strict()
  .refine(
    (r) =>
      Math.abs(r.principal_paise + r.interest_paise - r.payment_paise) <= 100 &&
      r.principal_paise <= r.opening_paise,
    "Principal and interest must agree within ₹1 lender rounding; principal cannot exceed opening balance.",
  );
export type DocumentScheduleRow = z.infer<typeof documentScheduleRow>;
export const loanDocumentSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    provider: z.enum(["credit_saison", "kotak", "lt_finance"]),
    source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    source_page_count: z.number().int().min(1).max(60),
    original_principal_paise: paise.min(1),
    original_months: z.number().int().min(1).max(120),
    nominal_rate: z
      .number()
      .finite()
      .min(0)
      .max(60)
      .refine((v) => new D(v).decimalPlaces() <= 4),
    disclosure_apr: z.number().finite().min(0).max(1000).nullable(),
    net_disbursed_paise: paise.nullable(),
    fees_paise: paise.nullable(),
    reported_emi_paise: paise.min(1),
    current_outstanding_paise: paise,
    remaining_months: z.number().int().min(0).max(120),
    as_of: calendarDate,
    paid_through: calendarDate.nullable(),
    first_due_on: calendarDate.nullable(),
    balance_basis: z.enum([
      "manual",
      "statement",
      "confirmed_schedule",
      "estimate",
    ]),
    card_account_id: z.string().uuid().nullable(),
    schedule_origin: z.enum(["lender", "manual", "none"]),
    schedule: z.array(documentScheduleRow).max(120),
    source_pages: z
      .object({
        principal: z.number().int().min(1).max(60).nullable(),
        rate: z.number().int().min(1).max(60).nullable(),
        apr: z.number().int().min(1).max(60).nullable(),
        emi: z.number().int().min(1).max(60).nullable(),
        tenure: z.number().int().min(1).max(60).nullable(),
        first_due: z.number().int().min(1).max(60).nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.as_of > indiaDate() || (v.paid_through && v.paid_through > v.as_of))
      ctx.addIssue({
        code: "custom",
        message:
          "Use a current/past balance date, with paid-through no later than that date.",
      });
    if (v.current_outstanding_paise > 0 && v.remaining_months < 1)
      ctx.addIssue({
        code: "custom",
        message: "A remaining balance needs at least one remaining instalment.",
      });
    if (
      (v.schedule_origin === "none" && v.schedule.length) ||
      (v.schedule_origin !== "none" && !v.schedule.length)
    )
      ctx.addIssue({
        code: "custom",
        message: "Schedule source and rows must agree.",
      });
    for (const [i, r] of v.schedule.entries()) {
      if (
        r.sequence !== i + 1 ||
        (r.source_page && r.source_page > v.source_page_count)
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Schedule rows must be consecutive and refer to a real source page.",
        });
      if (
        i > 0 &&
        Math.abs(
          v.schedule[i - 1].opening_paise -
            v.schedule[i - 1].principal_paise -
            r.opening_paise,
        ) > 100
      )
        ctx.addIssue({
          code: "custom",
          message: "Consecutive schedule balances do not reconcile.",
        });
    }
    if (
      Object.values(v.source_pages).some(
        (p) => p !== null && p > v.source_page_count,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Source page exceeds the document length.",
      });
  });
export type LoanDocumentTerms = z.infer<typeof loanDocumentSchema>;
export type LoanExtraction = {
  provider: Provider;
  source_page_count: number;
  principal: SourceField<number>;
  rate: SourceField<number>;
  apr: SourceField<number>;
  emi: SourceField<number>;
  tenure: SourceField<number>;
  first_due: SourceField<string>;
  net: SourceField<number>;
  fees: SourceField<number>;
  schedule: DocumentScheduleRow[];
  warnings: string[];
};
export function documentMoney(value: string): number | null {
  if (
    !/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(
      value.trim(),
    )
  )
    return null;
  const amount = new D(value.replaceAll(",", "")).times(100);
  return amount.isInteger() && amount.gte(0) && amount.lte(1_000_000_000)
    ? amount.toNumber()
    : null;
}
const moneyToken = /\d[\d,]*(?:\.\d{1,2})?/g;
function sourceDate(value: string): string | null {
  const match = value.match(/\b(\d{2})[/-](\d{2})[/-](\d{4})\b/);
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  return calendarDate.safeParse(iso).success ? iso : null;
}
export function extractLoanDocument(pages: DocumentPage[]): LoanExtraction {
  const text = pages.map((p) => p.text).join("\n");
  const provider: Provider | null =
    /kotak/i.test(text) && /credit card/i.test(text)
      ? "kotak"
      : /kisetsu|credit saison|CRED App/i.test(text)
        ? "credit_saison"
        : /L&T|LTF_InterestRate|Larsen.*Toubro/i.test(text)
          ? "lt_finance"
          : null;
  if (!provider)
    throw new Error(
      "This format is not supported yet. Use a CRED/Credit Saison, Kotak card EMI or L&T Finance PDF, or track the loan manually.",
    );
  const blank = <T>(): SourceField<T> => ({ value: null, page: null });
  const out: LoanExtraction = {
    provider,
    source_page_count: pages.length,
    principal: blank(),
    rate: blank(),
    apr: blank(),
    emi: blank(),
    tenure: blank(),
    first_due: blank(),
    net: blank(),
    fees: blank(),
    schedule: [],
    warnings: [],
  };
  const candidates = new Map<string, Set<string>>();
  function set<T>(
    key:
      | "principal"
      | "rate"
      | "apr"
      | "emi"
      | "tenure"
      | "first_due"
      | "net"
      | "fees",
    value: T | null,
    page: number,
  ) {
    if (value === null) return;
    const values = candidates.get(key) ?? new Set<string>();
    values.add(String(value));
    candidates.set(key, values);
    if (values.size > 1) {
      out.warnings.push(
        `Conflicting ${key} values: review the original PDF before confirming.`,
      );
      out[key].value = null;
      out[key].page = null;
      return;
    }
    (out[key] as SourceField<T>).value = value;
    out[key].page = page;
  }
  for (const page of pages) {
    const lines = page.text
      .split("\n")
      .map((l) => l.trim().replace(/\s+/g, " "));
    for (const line of lines) {
      if (line.length > 240) continue;
      const tail = (pattern: RegExp) => {
        const m = pattern.exec(line);
        return m ? line.slice(m.index + m[0].length) : null;
      };
      const amountAfter = (pattern: RegExp) => {
        const s = tail(pattern);
        if (!s || s.includes("%")) return null;
        const tokens = s.match(moneyToken);
        const money = tokens?.filter((t) => /[.,]/.test(t));
        const choices = money?.length ? money : tokens;
        return choices?.length
          ? documentMoney(choices[choices.length - 1])
          : null;
      };
      if (
        /^(?:\d+\s+|\(?i\)?\s*)?(?:sanctioned loan amount|loan amount(?:\s*\((?:in rupees|in f[i]?gures)\)))/i.test(
          line,
        ) &&
        !/Sl no|in words/i.test(line)
      )
        set(
          "principal",
          amountAfter(/(?:sanctioned )?loan amount(?:\s*\(in rupees\))?/i),
          page.number,
        );
      if (/net disbursed amount/i.test(line))
        set("net", amountAfter(/net disbursed amount/i), page.number);
      if (
        /processing fee/i.test(line) &&
        !/penal|foreclosure|including|component|note:/i.test(line)
      )
        set(
          "fees",
          amountAfter(/processing fees?(?:, if any)?(?:\s*\(in rupees\))?/i),
          page.number,
        );
      if (
        /annual(?:ized|ised)? percentage rate|\bAPR\b/i.test(line) &&
        !/defined|methodology|changes|periodicity/i.test(line)
      ) {
        const m = line.match(
          /(?:percentage rate|\bAPR\b).*?(\d+(?:\.\d+)?)\s*%/i,
        );
        if (m) set("apr", Number(m[1]), page.number);
      } else if (
        /interest rate|rate of interest/i.test(line) &&
        !/penal|foreclosure|policy|floating rate.*additional/i.test(line)
      ) {
        const m = line.match(
          /(?:interest rate|rate of interest).*?(\d+(?:\.\d+)?)\s*%/i,
        );
        if (m && Number(m[1]) <= 60) set("rate", Number(m[1]), page.number);
      }
      if (/tenure.*(?:months|days)|loan tenure|tenor/i.test(line)) {
        const s = tail(
          /tenure(?: of the loan)?(?:\s*\(in months(?:\/days)?\))?|tenor/i,
        );
        const m = s?.match(/\b(\d{1,3})\b/);
        if (m && Number(m[1]) <= 120 && Number(m[1]) > 0)
          set("tenure", Number(m[1]), page.number);
      }
      const fixed = line.match(
        /monthly fixed repayments\s+(\d{1,3})\s+([\d,]+(?:\.\d{1,2})?)\s+(\d{2}\/\d{2}\/\d{4})/i,
      );
      if (fixed) {
        set("tenure", Number(fixed[1]), page.number);
        set("emi", documentMoney(fixed[2]), page.number);
        set("first_due", sourceDate(fixed[3]), page.number);
      }
      if (
        /amount of each installment|EMI amount(?:\s*\(in f[i]?gures\))?\s*[:-]|EMI of.*would be billed/i.test(
          line,
        )
      ) {
        const m = line.match(
          /(?:amount of each installment.*?\)|EMI amount(?:\s*\(in f[i]?gures\))?\s*[:-]|EMI of)\s*(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
        );
        if (m) set("emi", documentMoney(m[1]), page.number);
      }
      if (
        /commencement of repay|first (?:EMI|instalment).*date|EMI date\s*[:-]|due date of payment/i.test(
          line,
        )
      )
        set("first_due", sourceDate(line), page.number);
      // A complete numeric five-column row, not numbers in surrounding legal prose.
      const row = line.match(
        /^(\d{1,3})\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)$/,
      );
      if (
        row &&
        /amortization schedule|detailed repayment charges|outstanding principal/i.test(
          page.text,
        )
      ) {
        const numbers = row.slice(2).map(documentMoney);
        if (numbers.every((n) => n !== null)) {
          const parsed = documentScheduleRow.safeParse({
            sequence: Number(row[1]),
            opening_paise:
              provider === "credit_saison"
                ? numbers[0]! + numbers[1]!
                : numbers[0],
            principal_paise: numbers[1],
            interest_paise: numbers[2],
            payment_paise: numbers[3],
            source_page: page.number,
          });
          if (
            parsed.success &&
            parsed.data.sequence === out.schedule.length + 1
          )
            out.schedule.push(parsed.data);
        }
      }
    }
  }
  out.warnings = [...new Set(out.warnings)];
  if (
    out.schedule.some(
      (r, i, a) =>
        Math.abs(r.principal_paise + r.interest_paise - r.payment_paise) > 1 ||
        (i > 0 &&
          Math.abs(
            a[i - 1].opening_paise - a[i - 1].principal_paise - r.opening_paise,
          ) > 1),
    )
  )
    out.warnings.push(
      "The lender table has rounding differences (up to ₹1 per row). Values are retained; a balance calculated from this table will be labelled an estimate.",
    );
  if (!out.schedule.length)
    out.warnings.push(
      "No populated lender repayment table was found. Calculated schedules remain estimates.",
    );
  if (out.schedule.length && out.schedule.length !== out.tenure.value)
    out.warnings.push(
      "The extracted table may be incomplete. Review every row; do not use it as proof of the current balance.",
    );
  if (provider === "kotak")
    out.warnings.push(
      "Card EMI: confirm whether its principal is already included in a credit-card balance. GST/fees may be billed separately.",
    );
  if (provider === "lt_finance")
    out.warnings.push(
      "The agreement's first EMI date may be estimated. Confirm the actual first due date from the lender.",
    );
  out.warnings.push(
    "An agreement shows original terms, not today's outstanding debt or proof that instalments were paid.",
  );
  return out;
}
export function instalmentDate(first: string, offset: number): string {
  const [y, m, d] = first.split("-").map(Number);
  const index = m - 1 + offset;
  const year = y + Math.floor(index / 12);
  const month = ((index % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
/** Only called after the owner explicitly confirms paid-through history. */
export function documentBalance(input: {
  principal: number;
  rate: number;
  emi: number;
  months: number;
  firstDue: string;
  paidThrough: string;
  schedule: DocumentScheduleRow[];
}): {
  balance: number;
  remaining: number;
  basis: "confirmed_schedule" | "estimate";
} {
  paise.min(1).parse(input.principal);
  paise.min(1).parse(input.emi);
  z.number().finite().min(0).max(60).parse(input.rate);
  z.number().int().min(1).max(120).parse(input.months);
  documentScheduleRow.array().max(120).parse(input.schedule);
  if (
    input.schedule.some(
      (r, i) =>
        r.sequence !== i + 1 ||
        (i > 0 &&
          Math.abs(
            input.schedule[i - 1].opening_paise -
              input.schedule[i - 1].principal_paise -
              r.opening_paise,
          ) > 100),
    )
  )
    throw new Error("Review the schedule rows before calculating a balance.");
  calendarDate.parse(input.firstDue);
  calendarDate.parse(input.paidThrough);
  const paid = Array.from({ length: input.months }, (_, i) =>
    instalmentDate(input.firstDue, i),
  ).filter((d) => d <= input.paidThrough).length;
  const full =
    input.schedule.length === input.months &&
    input.schedule.every(
      (r, i, a) =>
        Math.abs(r.principal_paise + r.interest_paise - r.payment_paise) <= 1 &&
        (!i ||
          Math.abs(
            a[i - 1].opening_paise - a[i - 1].principal_paise - r.opening_paise,
          ) <= 1),
    ) &&
    Math.abs(input.schedule[0].opening_paise - input.principal) <= 1 &&
    input.schedule.at(-1)!.opening_paise -
      input.schedule.at(-1)!.principal_paise <=
      1;
  if (full) {
    const balance = paid
      ? input.schedule[paid - 1].opening_paise -
        input.schedule[paid - 1].principal_paise
      : input.principal;
    return {
      balance,
      remaining: balance > 0 ? Math.max(1, input.months - paid) : 0,
      basis: "confirmed_schedule",
    };
  }
  let balance = new D(input.principal);
  for (let i = 0; i < paid; i++) {
    const interest = balance
      .times(new D(input.rate).div(1200))
      .toDecimalPlaces(0);
    if (new D(input.emi).lte(interest) && balance.gt(0))
      throw new Error(
        "The EMI does not cover estimated interest. Enter a lender-confirmed balance.",
      );
    balance = D.max(0, balance.plus(interest).minus(input.emi));
  }
  return {
    balance: balance.toNumber(),
    remaining: balance.gt(0) ? Math.max(1, input.months - paid) : 0,
    basis: "estimate",
  };
}
