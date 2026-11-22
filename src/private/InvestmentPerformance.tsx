import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "../components/ui/button";
import { formatExactMoney as money } from "../lib/finance";
import { db, check } from "./workspace";
import { investmentReturns } from "./investmentReturns";
import { moneyValue } from "./workflowSchemas";
const history = z.array(
  z.object({
    id: z.uuid(),
    kind: z.enum(["valuation", "self", "employer", "withdrawal"]),
    amount_paise: moneyValue,
    occurred_on: z.string(),
    created_at: z.string(),
  }),
);
export function InvestmentPerformance({
  holding,
}: {
  holding: { id: string; name: string };
}) {
  const [entries, setEntries] = useState<z.infer<typeof history> | null>(null),
    [opening, setOpening] = useState(true),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    void (async () => {
      try {
        const r = await db()
          .rpc("investment_return_history", { p_holding: holding.id })
          .abortSignal(c.signal);
        check(r);
        const data = history.parse(r.data);
        if (!c.signal.aborted) setEntries(data);
      } catch {
        if (!c.signal.aborted)
          setError(
            "Could not load complete return history. Retry when connected.",
          );
      }
    })();
    return () => c.abort();
  }, [holding.id]);
  let result: ReturnType<typeof investmentReturns> | null = null,
    message = error;
  if (entries && confirmed)
    try {
      result = investmentReturns(entries, opening);
    } catch (e) {
      message = e instanceof Error ? e.message : "Review the dated cash flows.";
    }
  return (
    <section className="investment-history">
      <h4>{holding.name} · Investment returns</h4>
      <p>
        Uses dated reported values, your contributions, employer contributions
        and withdrawals. Employer money counts as invested capital, not market
        growth. No live prices or assumed statutory interest are used.
      </p>
      <label>
        <input
          type="checkbox"
          checked={opening}
          onChange={(e) => {
            setOpening(e.target.checked);
            setConfirmed(false);
          }}
        />{" "}
        Start at the earliest recorded statement value (treat it as the opening
        capital)
      </label>
      <p>
        Statement values are treated as end-of-day snapshots. Opening-date flows
        are already included in that opening value; later flows through the
        final valuation date are counted.
      </p>
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />{" "}
        I entered every relevant contribution and withdrawal for this period.
      </label>
      {result && (
        <>
          <p>
            {result.start} → {result.end}
          </p>
          <div className="plan-breakdown">
            {[
              ["Opening value", result.opening],
              ["Your contributions", result.self],
              ["Employer contributions", result.employer],
              ["Withdrawals", result.withdrawn],
              ["Closing value", result.closing],
              ["Recorded growth / loss", result.gain],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt>{label}</dt>
                <dd>{money(Number(value))}</dd>
              </div>
            ))}
          </div>
          <p>
            <strong>
              Annualised XIRR:{" "}
              {result.xirr === null
                ? "Not available"
                : new Intl.NumberFormat("en-IN", {
                    style: "percent",
                    maximumFractionDigits: 2,
                  }).format(result.xirr)}
            </strong>
          </p>
          {result.reason && <p>{result.reason}</p>}
          {result.ignoredAfter > 0 && (
            <p className="form-error">
              {result.ignoredAfter} cash-flow record(s) follow the closing
              valuation and are excluded. Add an updated statement value.
            </p>
          )}
          <p>
            XIRR uses actual days / 365. Non-conventional cash flows that can
            have multiple rates are left unreported; the growth/loss amount is
            still shown.
          </p>
        </>
      )}
      {!entries && !message && <p>Loading complete history…</p>}
      {message && <p role="status">{message}</p>}
      <Button variant="ghost" onClick={() => setConfirmed(false)}>
        Reset return review
      </Button>
    </section>
  );
}
