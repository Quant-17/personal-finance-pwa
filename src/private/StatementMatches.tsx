import { useState } from "react";
import { Button } from "../components/ui/button";
import { db, check } from "./workspace";
import { formatExactMoney as money } from "../lib/finance";
export function StatementMatches({
  account,
  date,
  amount,
}: {
  account: string;
  date: string;
  amount: number;
}) {
  const [items, setItems] = useState<
    | {
        id: string;
        description: string;
        amount_paise: number;
        occurred_on: string;
      }[]
    | null
  >(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function compare() {
    setBusy(true);
    setError("");
    try {
      const r = await db()
        .from("transactions")
        .select("id,description,amount_paise,occurred_on")
        .eq("account_id", account)
        .eq("occurred_on", date)
        .eq("amount_paise", amount)
        .order("id")
        .limit(11);
      check(r);
      setItems(r.data ?? []);
    } catch {
      setError("Could not check the ledger. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        disabled={busy}
        onClick={() => void compare()}
      >
        Compare with ledger
      </Button>
      {items && (
        <p>
          {items.length
            ? "Possible matches · compare before selecting this row"
            : "No ledger entry with this account, date and amount."}
        </p>
      )}
      {items && items.length > 10 && (
        <p>Showing the first 10 matches. Open Transactions to see more.</p>
      )}
      {items?.slice(0, 10).map((i) => (
        <p key={i.id}>
          {i.occurred_on} · {i.description} · {money(i.amount_paise)}
        </p>
      ))}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
