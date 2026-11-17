import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { X } from "lucide-react";
import { Button } from "../components/ui/button";
import { db, check } from "./workspace";
import { indiaDate, indiaMonth, moneyInput, moneyToInput } from "./domain";
import type { Entry, Snapshot } from "./domain";
export type EditorKind =
  | "account"
  | "entry"
  | "transfer"
  | "loan"
  | "payment"
  | "subscription"
  | "budget"
  | "goal"
  | "allocation"
  | "category"
  | "plan";
export type EditIntent = {
  kind: EditorKind;
  entry?: Entry;
  record?: { id: string; values: Record<string, string> };
};
type Field = {
  name: string;
  label: string;
  type?: string;
  options?: [string, string][];
  value?: string;
  optional?: boolean;
  hint?: string;
};
const titles: Record<EditorKind, string> = {
  account: "Add an account",
  entry: "Record a transaction",
  transfer: "Move money",
  loan: "Track an existing loan",
  payment: "Record a loan payment",
  subscription: "Add a subscription",
  budget: "Set a category budget",
  goal: "Create a savings goal",
  allocation: "Earmark savings",
  category: "Create a category",
  plan: "Your monthly plan",
};
export function Editor({
  intent,
  snapshot: s,
  onClose,
  onSaved,
}: {
  intent: EditIntent;
  snapshot: Snapshot;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { kind, entry, record } = intent;
  const accounts: [string, string][] = s.accounts
    .filter((a) => !a.archived_at || kind === "allocation")
    .map((a) => [
      a.id,
      a.name + (a.archived_at ? " (archived; release only)" : ""),
    ]);
  const categoryOptions: [string, string][] = s.categories.map((c) => [
    c.id,
    c.name + " · " + c.kind,
  ]);
  const fields: Field[] =
    kind === "account"
      ? [
          { name: "name", label: "Account name" },
          {
            name: "type",
            label: "Account type",
            options: [
              "bank",
              "savings",
              "credit_card",
              "cash",
              "investment",
            ].map((v) => [v, v.replace("_", " ")]),
          },
          {
            name: "amount",
            label: "Opening balance (₹)",
            value: "0",
            hint: "Use a negative balance for money owed on a credit card.",
          },
          {
            name: "date",
            label: "Opening date",
            type: "date",
            value: indiaDate(),
          },
        ]
      : kind === "entry"
        ? [
            {
              name: "account",
              label: "Account",
              options: accounts,
              value: entry?.account_id,
            },
            {
              name: "kind",
              label: "Transaction type",
              options: [
                ["expense", "Expense"],
                ["income", "Income"],
              ],
              value: entry?.kind,
            },
            {
              name: "category",
              label: "Category (match transaction type)",
              options: categoryOptions,
              value: entry?.category_id ?? undefined,
            },
            {
              name: "amount",
              label: "Amount (₹)",
              value: entry ? moneyToInput(Math.abs(entry.amount_paise)) : "",
            },
            {
              name: "date",
              label: "Date",
              type: "date",
              value: entry?.occurred_on ?? indiaDate(),
            },
            {
              name: "description",
              label: "Description",
              optional: true,
              value: entry?.description,
            },
          ]
        : kind === "transfer"
          ? [
              { name: "account", label: "From account", options: accounts },
              { name: "to", label: "To account", options: accounts },
              { name: "amount", label: "Amount (₹)" },
              { name: "date", label: "Date", type: "date", value: indiaDate() },
              { name: "description", label: "Description", optional: true },
            ]
          : kind === "loan"
            ? [
                { name: "name", label: "Loan name" },
                { name: "amount", label: "Outstanding principal to track (₹)" },
                {
                  name: "apr",
                  label: "Annual interest rate (%)",
                  type: "number",
                  value: "12",
                },
                {
                  name: "tenure",
                  label: "Remaining months",
                  type: "number",
                  value: "12",
                },
                {
                  name: "date",
                  label: "Tracking start date",
                  type: "date",
                  value: indiaDate(),
                },
              ]
            : kind === "payment"
              ? [
                  {
                    name: "loan",
                    label: "Loan",
                    options: s.loans
                      .filter((l) => l.status === "active")
                      .map((l) => [l.id, l.name]),
                  },
                  { name: "account", label: "Paid from", options: accounts },
                  { name: "principal", label: "Principal repaid (₹)" },
                  { name: "interest", label: "Interest paid (₹)", value: "0" },
                  {
                    name: "date",
                    label: "Payment date",
                    type: "date",
                    value: indiaDate(),
                  },
                  { name: "description", label: "Description", optional: true },
                ]
              : kind === "subscription"
                ? [
                    { name: "name", label: "Subscription name" },
                    { name: "amount", label: "Charge (₹)" },
                    {
                      name: "cadence",
                      label: "Repeats",
                      options: [
                        ["monthly", "Monthly"],
                        ["yearly", "Yearly"],
                        ["weekly", "Weekly"],
                      ],
                    },
                    {
                      name: "date",
                      label: "Next due date",
                      type: "date",
                      value: indiaDate(),
                    },
                  ]
                : kind === "budget"
                  ? [
                      {
                        name: "category",
                        label: "Expense category",
                        options: s.categories
                          .filter((c) => c.kind === "expense")
                          .map((c) => [c.id, c.name]),
                      },
                      { name: "amount", label: "This month’s limit (₹)" },
                    ]
                  : kind === "goal"
                    ? [
                        { name: "name", label: "What are you saving for?" },
                        { name: "amount", label: "Target (₹)" },
                        {
                          name: "date",
                          label: "Target date",
                          type: "date",
                          optional: true,
                        },
                      ]
                    : kind === "allocation"
                      ? [
                          {
                            name: "goal",
                            label: "Savings goal",
                            options: s.goals.map((g) => [g.id, g.name]),
                          },
                          {
                            name: "account",
                            label: "Source account",
                            options: accounts.filter(
                              ([id]) =>
                                s.accounts.find((a) => a.id === id)?.type !==
                                  "credit_card" &&
                                s.accounts.find((a) => a.id === id)?.type !==
                                  "investment",
                            ),
                          },
                          {
                            name: "amount",
                            label: "New total earmarked from this account (₹)",
                            hint: "Replaces this goal/account allocation. Enter 0 to release it.",
                          },
                        ]
                      : kind === "category"
                        ? [
                            { name: "name", label: "Category name" },
                            {
                              name: "kind",
                              label: "Category type",
                              options: [
                                ["expense", "Expense"],
                                ["income", "Income"],
                              ],
                            },
                          ]
                        : [
                            {
                              name: "name",
                              label: "Display name",
                              value: s.profile.display_name,
                              optional: true,
                            },
                            {
                              name: "income",
                              label: "Planned monthly income (₹)",
                              value: moneyToInput(
                                s.profile.monthly_income_paise,
                              ),
                            },
                            {
                              name: "living",
                              label: "Planned living expenses (₹)",
                              value: moneyToInput(
                                s.profile.monthly_living_budget_paise,
                              ),
                              hint: "Include subscriptions; exclude loan EMIs, which are added separately.",
                            },
                            {
                              name: "reserve",
                              label: "Emergency reserve target (₹)",
                              value: moneyToInput(
                                s.profile.emergency_reserve_paise,
                              ),
                            },
                          ];
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((f) => [
        f.name,
        record?.values[f.name] ?? f.value ?? f.options?.[0]?.[0] ?? "",
      ]),
    ),
  );
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const request = useRef(crypto.randomUUID());
  const submitting = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      const v = values;
      const database = db();
      const amount = () => moneyInput(v.amount, kind === "account");
      if (kind === "account") {
        const values = {
          name: v.name.trim(),
          type: v.type,
          opening_balance_paise: amount(),
          opening_date: v.date,
        };
        check(
          await (record
            ? db().from("accounts").update(values).eq("id", record.id)
            : db()
                .from("accounts")
                .insert({ id: request.current, ...values })),
        );
      }
      if (kind === "entry")
        check(
          await database.rpc("record_entry", {
            p_account: entry?.account_id ?? v.account,
            p_category: v.category,
            p_kind: v.kind,
            p_amount_paise: amount(),
            p_occurred_on: v.date,
            p_description: v.description,
            ...(entry ? { p_entry: entry.id } : {}),
            p_request_id: request.current,
          }),
        );
      if (kind === "transfer")
        check(
          await database.rpc("record_transfer", {
            p_from: v.account,
            p_to: v.to,
            p_amount_paise: amount(),
            p_occurred_on: v.date,
            p_description: v.description,
            p_request_id: request.current,
          }),
        );
      if (kind === "loan") {
        const values = {
          name: v.name.trim(),
          principal_paise: amount(),
          apr: Number(v.apr),
          tenure_months: Number(v.tenure),
          start_date: v.date,
        };
        check(
          await (record
            ? db().from("loans").update(values).eq("id", record.id)
            : db()
                .from("loans")
                .insert({ id: request.current, ...values })),
        );
      }
      if (kind === "payment")
        check(
          await database.rpc("record_loan_payment", {
            p_loan: v.loan,
            p_account: v.account,
            p_principal_paise: moneyInput(v.principal),
            p_interest_paise: moneyInput(v.interest),
            p_occurred_on: v.date,
            p_description: v.description,
            p_request_id: request.current,
          }),
        );
      if (kind === "subscription") {
        const values = {
          name: v.name.trim(),
          amount_paise: amount(),
          cadence: v.cadence,
          next_due_on: v.date,
        };
        check(
          await (record
            ? db().from("subscriptions").update(values).eq("id", record.id)
            : db()
                .from("subscriptions")
                .insert({ id: request.current, ...values })),
        );
      }
      if (kind === "budget")
        check(
          await database
            .from("budgets")
            .upsert(
              {
                category_id: v.category,
                month: indiaMonth(),
                limit_paise: amount(),
              },
              { onConflict: "user_id,category_id,month" },
            ),
        );
      if (kind === "goal") {
        const values = {
          name: v.name.trim(),
          target_paise: amount(),
          target_on: v.date || null,
        };
        check(
          await (record
            ? db().from("savings_goals").update(values).eq("id", record.id)
            : db()
                .from("savings_goals")
                .insert({ id: request.current, ...values })),
        );
      }
      if (kind === "allocation")
        check(
          await database.rpc("set_goal_allocation", {
            p_goal: v.goal,
            p_account: v.account,
            p_amount_paise: amount(),
            p_request_id: request.current,
          }),
        );
      if (kind === "category") {
        const values = { name: v.name.trim(), kind: v.kind };
        check(
          await (record
            ? db().from("categories").update(values).eq("id", record.id)
            : db()
                .from("categories")
                .insert({ id: request.current, ...values })),
        );
      }
      if (kind === "plan")
        check(
          await database
            .from("profiles")
            .update({
              display_name: v.name.trim(),
              monthly_income_paise: moneyInput(v.income),
              monthly_living_budget_paise: moneyInput(v.living),
              emergency_reserve_paise: moneyInput(v.reserve),
            })
            .eq("id", s.profile.id),
        );
      onSaved();
      onClose();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not save. Retry with the same values if the connection was interrupted.",
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="finance-dialog"
      onCancel={(event) => {
        if (pending) event.preventDefault();
        else onClose();
      }}
      aria-labelledby="editor-title"
    >
      <div className="dialog-heading">
        <h2 id="editor-title">
          {entry ? "Edit transaction" : record ? "Edit " + kind : titles[kind]}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          disabled={pending}
          onClick={onClose}
          aria-label="Close editor"
        >
          <X size={20} />
        </Button>
      </div>
      {kind === "loan" && (
        <p className="small-note">
          Tracks an existing liability without posting loan proceeds.
          Credit-card balances belong in accounts. EMI is an estimate; record
          actual principal and interest from your lender.
        </p>
      )}
      {kind === "subscription" && (
        <p className="small-note">
          A forecast only. Record each settled charge separately in
          Transactions.
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        {fields.map((field) => (
          <label key={field.name}>
            {field.label}
            {field.options ? (
              <select
                required
                disabled={pending || (!!entry && field.name === "account")}
                value={values[field.name]}
                onChange={(e) => {
                  setValues({ ...values, [field.name]: e.target.value });
                  request.current = crypto.randomUUID();
                }}
              >
                {field.options.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                required={!field.optional}
                disabled={pending}
                type={field.type ?? "text"}
                inputMode={
                  [
                    "amount",
                    "principal",
                    "interest",
                    "income",
                    "living",
                    "reserve",
                  ].includes(field.name)
                    ? "decimal"
                    : undefined
                }
                step={field.name === "apr" ? "0.0001" : "1"}
                min={field.type === "number" ? "0" : undefined}
                maxLength={field.name === "description" ? 240 : 80}
                value={values[field.name]}
                onChange={(e) => {
                  setValues({ ...values, [field.name]: e.target.value });
                  request.current = crypto.randomUUID();
                }}
              />
            )}
            {field.hint && <span className="small-note">{field.hint}</span>}
          </label>
        ))}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
    </dialog>
  );
}
