import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "../components/ui/button";
import { formatExactMoney as money } from "../lib/finance";
import {
  displayDate,
  MONEY_LIMIT,
  moneyInput,
  moneyToInput,
  parseTransactions,
} from "./domain";
import type { Entry, Snapshot } from "./domain";
import { check, db } from "./workspace";
const receiptSchema = z.object({
  id: z.string().uuid(),
  message_id: z.string().regex(/^[a-f0-9]{1,40}$/i),
  merchant: z.string(),
  amount_paise: z
    .union([z.number(), z.string()])
    .transform(Number)
    .refine((n) => Number.isSafeInteger(n) && n > 0 && n <= MONEY_LIMIT)
    .nullable(),
  occurred_on: z.string(),
  kind: z.enum(["charge", "refund", "cancellation", "uncertain"]),
  reference: z.string(),
  subscription_hint: z.string().nullable(),
  needs_attention: z.boolean(),
});
type Receipt = z.infer<typeof receiptSchema>;
const connectionSchema = z
  .object({
    status: z.string(),
    mailbox: z.string().nullable(),
    last_synced_at: z.string().nullable(),
    has_more: z.boolean(),
  })
  .nullable();
export function EmailReceipts({
  snapshot,
  onPosted,
  onSubscription,
}: {
  snapshot: Snapshot;
  onPosted: () => void;
  onSubscription: () => void;
}) {
  const [connection, setConnection] =
    useState<z.infer<typeof connectionSchema>>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(() => {
    const result = new URL(location.href).searchParams.get("gmail");
    return !result
      ? ""
      : result === "connected"
        ? "Gmail connected. Sync receipts to begin your review."
        : "Gmail consent did not complete. You can try connecting again.";
  });
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [consent, setConsent] = useState(false);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const mounted = useRef(true);
  const busy = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const refresh = useCallback(() => {
    setSelected(null);
    setRevision((r) => r + 1);
  }, []);
  useEffect(() => {
    const result = new URL(location.href).searchParams.get("gmail");
    if (result) {
      const url = new URL(location.href);
      url.searchParams.delete("gmail");
      history.replaceState(null, "", url);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const [c, r] = await Promise.all([
          db()
            .from("gmail_connections")
            .select("status,mailbox,last_synced_at,has_more")
            .abortSignal(controller.signal)
            .maybeSingle(),
          db()
            .from("gmail_receipts")
            .select(
              "id,message_id,merchant,amount_paise,occurred_on,kind,reference,subscription_hint,needs_attention",
            )
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .order("id")
            .range(page * 20, page * 20 + 20)
            .abortSignal(controller.signal),
        ]);
        check(c);
        check(r);
        const rows = z.array(receiptSchema).parse(r.data);
        if (!controller.signal.aborted) {
          setConnection(connectionSchema.parse(c.data));
          setReceipts(rows.slice(0, 20));
          setMore(rows.length > 20);
        }
      } catch {
        if (!controller.signal.aborted) {
          setReceipts([]);
          setError(
            "Email import is awaiting server setup or could not be loaded. Your manual transactions remain available.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [page, revision]);
  const action = async (name: "connect" | "sync" | "disconnect" | "forget") => {
    if (busy.current) return;
    if (
      name === "forget" &&
      !confirm(
        "Disconnect Gmail and remove imported receipt details? Posted transactions and approved subscriptions will stay in your ledger.",
      )
    )
      return;
    busy.current = true;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await db().functions.invoke("gmail-receipts", {
        body: { action: name },
      });
      check(result);
      if (name === "connect") {
        const target = new URL(
          z.object({ url: z.string().url() }).parse(result.data).url,
        );
        if (
          target.origin !== "https://accounts.google.com" ||
          target.pathname !== "/o/oauth2/v2/auth"
        )
          throw new Error("Invalid consent URL.");
        if (mounted.current) location.assign(target.href);
      } else if (mounted.current) {
        const data = z
          .object({
            status: z.string().optional(),
            has_more: z.boolean().optional(),
          })
          .parse(result.data);
        setNotice(
          name === "disconnect"
            ? "Folio access removed. You can also revoke the grant in your Google Account permissions."
            : name === "forget"
              ? "Gmail disconnected and receipt details removed. Posted financial records were retained."
              : data.status === "busy"
                ? "Sync already running or recently attempted. Retry after a minute."
                : data.status === "ok"
                  ? `Sync complete.${data.has_more ? " More older receipts will follow on the next sync." : " Review the drafts below."}`
                  : "Sync needs attention. Try again or reconnect Gmail.",
        );
        refresh();
      }
    } catch {
      if (mounted.current)
        setError(
          "Gmail is unavailable. Server configuration or Google consent may still be needed. No expense was posted.",
        );
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  };
  return (
    <section className="card private-panel" aria-labelledby="gmail-title">
      <div className="panel-heading">
        <h2 id="gmail-title">Email receipts</h2>
        <span className="small-note">Gmail · review before posting</span>
      </div>
      <p>
        Find Uber, Zomato, Swiggy and Amazon India receipts. First sync covers
        the last 30 days. Rent and other expenses can still be entered manually.
      </p>
      <p className="small-note">
        Google’s read-only permission covers your mailbox; Folio filters to
        these merchants. It cannot send or delete mail. Email text is processed
        on the server without retaining bodies or attachments. No OCR or paid AI
        is used. Not every receipt format is recognized.
      </p>
      {loading && <p role="status">Loading email import…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {connection && (
        <p>
          {connection.mailbox || "Gmail"} ·{" "}
          {connection.status.replaceAll("_", " ")} · Last complete sync{" "}
          {connection.last_synced_at
            ? displayDate(connection.last_synced_at)
            : "not yet"}
          {connection.has_more ? " · more receipts pending" : ""}
        </p>
      )}
      {(!connection ||
        ["disconnected", "connecting", "reconnect_required"].includes(
          connection.status,
        )) && (
        <>
          <label className="csv-confirm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I understand Gmail grants mailbox read access and want Folio to look
            for receipt drafts.
          </label>
          <Button
            disabled={!consent || pending || loading || !!error}
            onClick={() => void action("connect")}
          >
            Connect Gmail
          </Button>
        </>
      )}
      {connection &&
        !["disconnected", "connecting"].includes(connection.status) && (
          <div className="page-actions">
            <Button
              disabled={
                pending || loading || connection.status === "reconnect_required"
              }
              onClick={() => void action("sync")}
            >
              Sync receipts
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => void action("disconnect")}
            >
              Disconnect Gmail
            </Button>
          </div>
        )}
      <p className="small-note">
        Automatic checks require the server scheduler to be configured. Drafts
        never affect balances or budgets until you confirm. Refunds,
        cancellations and ambiguous messages require manual reconciliation.
      </p>
      {receipts.map((r) => (
        <article className="receipt-draft" key={r.id}>
          <div className="panel-heading">
            <strong>
              {r.merchant} ·{" "}
              {r.amount_paise === null
                ? "Amount needs review"
                : money(r.amount_paise)}
            </strong>
            <span>{r.kind}</span>
          </div>
          <p>
            {displayDate(r.occurred_on)} · {r.reference || "No order reference"}
            {r.subscription_hint
              ? ` · Possible ${r.subscription_hint} subscription`
              : ""}
          </p>
          {r.needs_attention && (
            <p className="form-error">
              A conflicting amount, refund or cancellation was found for this
              order. Reconcile it manually in Transactions.
            </p>
          )}
          <a
            href={`https://mail.google.com/mail/u/0/#all/${r.message_id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open source in Gmail
          </a>
          <Button
            variant="outline"
            onClick={() => setSelected(selected === r.id ? null : r.id)}
          >
            {selected === r.id
              ? "Close review"
              : `Review ${r.merchant} receipt`}
          </Button>
          {selected === r.id && (
            <ReceiptReview
              receipt={r}
              snapshot={snapshot}
              onSubscription={onSubscription}
              onDone={() => {
                refresh();
                onPosted();
              }}
            />
          )}
        </article>
      ))}
      {!loading && !error && !receipts.length && (
        <p>No pending receipts on this page.</p>
      )}
      <div className="page-actions">
        <Button
          variant="ghost"
          disabled={!page || loading}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous receipts
        </Button>
        <Button
          variant="ghost"
          disabled={!more || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          Next receipts
        </Button>
        <Button variant="ghost" disabled={loading || pending} onClick={refresh}>
          Refresh inbox
        </Button>
        <Button
          variant="ghost"
          disabled={pending || loading || !!error}
          onClick={() => void action("forget")}
        >
          Remove imported receipt details
        </Button>
      </div>
    </section>
  );
}
function ReceiptReview({
  receipt: r,
  snapshot: s,
  onDone,
  onSubscription,
}: {
  receipt: Receipt;
  snapshot: Snapshot;
  onDone: () => void;
  onSubscription: () => void;
}) {
  const [account, setAccount] = useState(
    s.accounts.find((a) => !a.archived_at && a.type !== "investment")?.id ?? "",
  );
  const [category, setCategory] = useState(
    s.categories.find((c) => c.kind === "expense")?.id ?? "",
  );
  const [amount, setAmount] = useState(
    r.amount_paise ? moneyToInput(r.amount_paise) : "",
  );
  const [date, setDate] = useState(r.occurred_on);
  const [subscription, setSubscription] = useState("");
  const [existing, setExisting] = useState("");
  const [matches, setMatches] = useState<Entry[]>([]);
  const [checked, setChecked] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const reset = () => {
    setChecked(false);
    setConfirmed(false);
    setMatches([]);
    setExisting("");
  };
  const duplicates = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const paise = moneyInput(amount);
      if (!paise) throw new Error("Enter a positive amount.");
      const result = await db()
        .from("transactions")
        .select("*")
        .eq("account_id", account)
        .eq("kind", "expense")
        .eq("amount_paise", -paise)
        .eq("occurred_on", date)
        .limit(20);
      check(result);
      const rows = parseTransactions(result.data);
      if (mounted.current) {
        setMatches(rows);
        setChecked(true);
      }
    } catch {
      if (mounted.current)
        setError(
          "Could not check matches. Review the amount, date and account, then retry.",
        );
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  };
  const review = async (dismiss = false) => {
    if (
      busy.current ||
      (!dismiss &&
        (!checked || !confirmed || (matches.length > 0 && !existing)))
    )
      return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      check(
        await db().rpc(
          "review_gmail_receipt",
          dismiss
            ? { p_receipt: r.id, p_action: "dismiss" }
            : {
                p_receipt: r.id,
                p_action: existing ? "link" : "post",
                p_account: account,
                p_category: category,
                p_amount_paise: moneyInput(amount),
                p_date: date,
                ...(subscription ? { p_subscription: subscription } : {}),
                ...(existing ? { p_existing: existing } : {}),
              },
        ),
      );
      if (mounted.current) onDone();
    } catch {
      if (mounted.current)
        setError(
          "Could not confirm the review. Retry the unchanged receipt safely, or refresh the ledger to reconcile it. Matching expenses must be linked rather than posted again.",
        );
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  };
  return (
    <div className="receipt-review">
      {r.kind === "charge" && !r.needs_attention ? (
        <>
          <div className="editor-grid">
            <label>
              Payment account
              <select
                disabled={pending}
                value={account}
                onChange={(e) => {
                  setAccount(e.target.value);
                  reset();
                }}
              >
                {s.accounts
                  .filter((a) => !a.archived_at && a.type !== "investment")
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Expense category
              <select
                disabled={pending}
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setConfirmed(false);
                }}
              >
                {s.categories
                  .filter((c) => c.kind === "expense")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Settled amount (₹)
              <input
                disabled={pending}
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  reset();
                }}
              />
            </label>
            <label>
              Settled date
              <input
                disabled={pending}
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  reset();
                }}
              />
            </label>
            <label>
              Link subscription (optional)
              <select
                disabled={pending}
                value={subscription}
                onChange={(e) => {
                  setSubscription(e.target.value);
                  setConfirmed(false);
                }}
              >
                <option value="">One-time expense</option>
                {s.subscriptions.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="small-note">
            Email arrival date is a suggestion; verify the actual payment date.
            Linking a subscription labels this single expense and does not
            create another charge or change its renewal date.
          </p>
          {r.subscription_hint && (
            <Button variant="ghost" onClick={onSubscription}>
              Add a subscription to your plan
            </Button>
          )}
          <Button
            variant="outline"
            disabled={pending || !account || !category}
            onClick={() => void duplicates()}
          >
            Check existing expenses
          </Button>
          {checked && (
            <>
              {matches.length > 0 ? (
                <label>
                  Matching expense
                  <select
                    disabled={pending}
                    value={existing}
                    onChange={(e) => {
                      setExisting(e.target.value);
                      setConfirmed(false);
                    }}
                  >
                    <option value="">Choose an existing charge</option>
                    {matches.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.description || "Expense"} · {money(-t.amount_paise)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p>
                  No exact account, date and amount match found. Check for
                  payments recorded under another account or date before
                  posting.
                </p>
              )}
              {matches.length > 0 && (
                <p className="small-note">
                  Linking keeps the existing expense’s category and description.
                  Edit that entry in the ledger if it needs correction.
                </p>
              )}
              <label className="csv-confirm">
                <input
                  type="checkbox"
                  disabled={pending}
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I verified this settled payment, its account, amount and date.
              </label>
              <Button
                disabled={
                  pending || !confirmed || (matches.length > 0 && !existing)
                }
                onClick={() => void review()}
              >
                {existing ? "Link existing expense" : "Confirm expense"}
              </Button>
            </>
          )}
        </>
      ) : (
        <p>
          Review this message in Gmail. Record any required correction manually;
          it will not be posted from this draft.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() => void review(true)}
      >
        Dismiss receipt
      </Button>
    </div>
  );
}
