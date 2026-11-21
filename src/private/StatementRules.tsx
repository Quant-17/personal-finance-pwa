import { useState } from "react";
import { Button } from "../components/ui/button";
import { formatExactMoney } from "../lib/finance";
import type { Snapshot } from "./domain";
import type { StatementDraft } from "./statements";
import { statementRecipient } from "./statementRecipients";
import { ruleFromRow } from "./statementRules";
import type { StatementRule, RuleInput } from "./statementRules";
export function RememberStatementRow({
  row,
  account,
  pending,
  onSave,
}: {
  row: StatementDraft;
  account: string;
  pending: boolean;
  onSave: (rule: RuleInput) => Promise<void>;
}) {
  const [ruleNote, setRuleNote] = useState("");
  const [exact, setExact] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const recipient = statementRecipient(row.narration ?? row.description);
  if (!recipient)
    return <small>Recipient not reliably identified; classify manually.</small>;
  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await onSave(
        ruleFromRow({ ...row, rule_note: ruleNote }, account, exact),
      );
      setMessage("Rule saved. No transaction was added.");
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Could not save rule. Retry when connected.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <details>
      <summary>Remember {recipient.name}</summary>
      <p>{recipient.detail}</p>
      <p>
        Account and {row.direction ?? "unknown"} direction only. Review
        truncated names carefully. This saves the current classification,
        independently of importing this row.
      </p>
      <label>
        <input
          type="checkbox"
          checked={
            exact ||
            recipient.exclusionOnly ||
            row.kind === "loan_payment" ||
            !!row.subscription_id
          }
          disabled={
            pending ||
            saving ||
            recipient.exclusionOnly ||
            row.kind === "loan_payment" ||
            !!row.subscription_id
          }
          onChange={(e) => setExact(e.target.checked)}
        />{" "}
        Match this amount too (always required for EMI/subscription rules)
      </label>
      <label>
        Rule note (optional)
        <input
          aria-label={`Rule note ${row.source_row}`}
          maxLength={160}
          disabled={pending || saving}
          value={ruleNote}
          onChange={(e) => setRuleNote(e.target.value)}
        />
      </label>
      <Button
        variant="outline"
        disabled={pending || saving}
        onClick={() => void save()}
      >
        Save rule only
      </Button>
      <p role="status">{message}</p>
    </details>
  );
}
export function RememberedStatementRules({
  rules,
  snapshot: s,
  pending,
  onToggle,
  onDelete,
}: {
  rules: StatementRule[];
  snapshot: Snapshot;
  pending: boolean;
  onToggle: (rule: StatementRule) => Promise<void>;
  onDelete: (rule: StatementRule) => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const action = async (run: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await run();
    } catch {
      setMessage("Could not update rules. Retry when connected.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <details>
      <summary>Remembered rules for this account ({rules.length})</summary>
      <p>
        Suggestions are applied when you read the next PDF. They never select or
        import rows. To change a rule, classify a matching row and save it
        again. Disabled rules are ignored.
      </p>
      {rules.map((r) => (
        <div key={r.id} className="card">
          <strong>{r.recipient_name}</strong>
          <p>
            {r.direction} ·{" "}
            {r.amount_paise === null
              ? "Any amount"
              : formatExactMoney(r.amount_paise)}{" "}
            ·{" "}
            {r.kind === "exclude"
              ? "Excluded"
              : r.kind === "loan_payment"
                ? (s.loans.find((l) => l.id === r.loan_id)?.name ??
                  "Unavailable loan")
                : (s.categories.find((c) => c.id === r.category_id)?.name ??
                  "Unavailable category")}
            {r.subscription_id
              ? ` · ${s.subscriptions.find((sub) => sub.id === r.subscription_id)?.name ?? "Unavailable subscription"}`
              : ""}
          </p>
          <p className="break-all">
            <small>{r.recipient_key}</small>
          </p>
          <p>{r.review_note}</p>
          <Button
            variant="outline"
            disabled={pending || busy}
            onClick={() => void action(() => onToggle(r))}
          >
            {r.enabled ? "Disable" : "Enable"} {r.recipient_name}
          </Button>{" "}
          <Button
            variant="outline"
            disabled={pending || busy}
            onClick={() => void action(() => onDelete(r))}
          >
            Forget {r.recipient_name}
          </Button>
        </div>
      ))}
      {!rules.length && (
        <p>
          No rules saved yet. Use “Remember recipient” on a reviewed row, then
          “Save rule only”.
        </p>
      )}
      <p role="status">{message}</p>
    </details>
  );
}
