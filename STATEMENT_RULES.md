# Remembered statement recipients

The PDF review can remember an account-specific recipient and suggest the same category, standalone EMI loan, subscription link or exclusion next month. Nothing is automatically selected or posted. The owner reviews dates, totals and classifications before the existing duplicate check and confirmed import.

## Matching

Recipient extraction uses the statement description/details, before removing reference numbers:

- Kotak UPI: recipient name and bank code; ignore transaction-reference and remark slots.
- SBI UPI: recipient name, bank code and visible payee identifier. Normalise wrapped bank codes; preserve digits inside payee identifiers. Debit and credit rules remain separate. An optional day-of-month condition can further distinguish recurring charges from ordinary purchases.
- Card purchases: structured PCD merchant or a recognised merchant token in a POS purchase.
- NACH: the stable mandate identifier, rather than its changing debit reference.
- Unidentified SBI DIRECT DR: only an exact-amount exclusion rule; the description does not prove its recipient or purpose.

Names and identifiers can be truncated by the bank. No fuzzy matching, amount-only merchant guessing, cross-account matching, or inference of an individual's purpose. Unrecognised layouts remain manual. Conflicting or unavailable rule targets require manual classification. Refunds, reversals, failed/pending payments, self transfers and card-bill repayments cannot receive an automatic ordinary-expense/income classification.

## Save without importing

1. Select the account and read a text-based PDF locally.
2. Review a row's type/category, loan, or optional subscription. Leave transfers and dedicated investment contributions excluded from ordinary income/expenses.
3. Expand **Remember recipient**, inspect its extracted identity, optionally require the same amount and calendar day, and add a review note. Choose **Save rule only**.
4. Next time a PDF is read, rules suggest classifications. Disable or forget rules in **Remembered rules for this account**. To change a target, classify a matching row and save it again. Changing an amount or day condition creates a separate rule; disable/forget an obsolete overlapping rule to avoid conflicts.

Saving a rule does not require the historical row to meet an account/loan opening date, and never imports it. This supports using a template or an already-paid EMI as a teaching example. It also means saving an exclusion does not create a transfer, card payment or investment contribution: use those dedicated workflows for actual accounting. Ambiguous recipients remain unclassified until the owner identifies them.

EMI and subscription rules always match an exact amount. Day conditions match the statement’s settled date exactly; no date tolerance or end-of-month adjustment is assumed. **Principal and interest are never remembered or estimated.** Enter the lender's reviewed split for each new standalone EMI. Older payments already included in tracked loan balances remain excluded. Changing deductions require updating the rule.

Subscriptions can be linked in the review table. Confirming an import creates one normal expense and links its actual date to Monthly plan in the same database transaction. Retry receipts, row/document markers, ownership checks and range guards are preserved. Duplicate detection does not retrofit links onto earlier entries; link an existing expense through Monthly plan. Card-linked EMI plans continue to use their dedicated card-deduction workflow.

## Privacy and operation

The original PDF and password remain on-device. Rules store only recipient identity/name, account, direction, optional exact paise amount and calendar day, reviewed target, optional note and enabled state. No raw statement, statement history or credentials are stored by this feature. Rules are owner-isolated by RLS and composite owner foreign keys, stay in component memory, and are not cached offline. They reload before each PDF read; failed/incomplete reads fall back to manual classification. At most 1,000 rules per account are loaded, with exact-count verification so a truncated set cannot hide a conflict.

No supplied personal statements, names, amounts, dates or mandates are seeded in migrations or synthetic tests. Owner-approved starter rules need private runtime account/category/subscription mapping; supplied template transactions must never be posted as part of setup.

## Verification and rollout

Apply `supabase/migrations/20261121193723_remembered_statement_recipients.sql` before deploying this frontend. Existing import RPC signatures and old five-field income/expense payloads remain supported. A subscription-linked expense adds only `subscription_id`, validated against an active owned subscription and its optional account.

Run lint, typecheck, Vitest, private and demo production builds/browser tests. Replay all migrations on disposable Postgres, run existing SQL accounting/isolation/concurrency suites, and `supabase/tests/statement_rules.sql` (synthetic records, transaction rolled back). Never use `bootstrap.sql` on hosted Supabase.

Rollback frontend to the previous private Worker version if necessary; leave this additive table/compatible RPC extension in place to preserve rule metadata. Public synthetic demo must remain unchanged. This document describes the implementation; consult release records for published status.
