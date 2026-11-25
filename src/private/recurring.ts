import type { Snapshot } from "./domain";
export type DueItem = {
  key: string;
  id: string;
  kind: "loan" | "subscription";
  name: string;
  due_on: string;
  window_opens_on?: string;
  amount_paise: number;
  card: boolean;
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
export function recurringDate(anchor: string, months: number) {
  const [y, m, d] = anchor.split("-").map(Number);
  const month = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
  ).getUTCDate();
  month.setUTCDate(Math.min(d, last));
  return iso(month);
}
export function deductionsInMonth(s: Snapshot, month: string): DueItem[] {
  if (!/^\d{4}-\d{2}$/.test(month)) return [];
  const start = month + "-01",
    end = recurringDate(start, 1),
    cutoff = s.profile.tracking_start_date ?? "0001-01-01";
  const result: DueItem[] = [];
  const add = (
    id: string,
    name: string,
    kind: DueItem["kind"],
    anchor: string | null | undefined,
    cadence: string,
    amount: number,
    card = false,
    windowStart?: number | null,
  ) => {
    if (!anchor) return;
    let dates: string[] = [];
    if (cadence === "weekly") {
      const a = new Date(anchor + "T00:00:00Z"),
        b = new Date(start + "T00:00:00Z");
      const offset = Math.max(
        0,
        Math.ceil((b.valueOf() - a.valueOf()) / 604800000),
      );
      for (let i = offset; i < offset + 6; i++) {
        const date = iso(new Date(a.valueOf() + i * 604800000));
        if (date >= end) break;
        dates.push(date);
      }
    } else {
      const offset =
        (Number(month.slice(0, 4)) - Number(anchor.slice(0, 4))) * 12 +
        Number(month.slice(5)) -
        Number(anchor.slice(5, 7));
      if (offset >= 0 && (cadence !== "yearly" || offset % 12 === 0))
        dates = [recurringDate(anchor, offset)];
    }
    dates
      .filter((d) => d >= start && d < end && d >= cutoff)
      .forEach((due_on) =>
        result.push({
          key: kind + id + due_on,
          id,
          name,
          kind,
          due_on,
          ...(windowStart && cadence === "monthly" ? {
            window_opens_on: due_on.slice(0, 8) +
              String(Math.min(windowStart, Number(due_on.slice(8)))).padStart(2, "0"),
          } : {}),
          amount_paise: amount,
          card,
        }),
      );
  };
  s.subscriptions
    .filter((x) => x.active)
    .forEach((x) =>
      add(
        x.id,
        x.name,
        "subscription",
        x.next_due_on,
        x.cadence,
        x.amount_paise,
        false,
        x.payment_window_start,
      ),
    );
  s.loans
    .filter((x) => x.status === "active" && x.outstanding_paise > 0)
    .forEach((x) =>
      add(
        x.id,
        x.name,
        "loan",
        x.deduction_anchor_on,
        "monthly",
        x.reported_emi_paise ?? x.emi_paise,
        !!x.card_account_id,
      ),
    );
  return result.sort(
    (a, b) => a.due_on.localeCompare(b.due_on) || a.name.localeCompare(b.name),
  );
}
