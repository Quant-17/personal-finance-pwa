# December tracking, deduction dates and financial insights

One update adds a transaction tracking start, a saved deduction calendar and interactive private charts. The owner requested private publication in the same release. No broader Stage 4 scope or paid services.

## Start tracking on 1 December 2026

Existing workspaces receive a transaction tracking start of **1 December 2026**. This is a reporting cutover, not an account reset. All prior transactions, opening balances, investments and loan repayments remain in the database and continue contributing to current balances and outstanding principal. Before your first December import, reconcile balances and loan outstanding with your statements.

Overview, category budgets, cash-flow charts, spending mix and deduction history use the cutoff. The transaction ledger starts there by default; **Show earlier records for reference** reveals retained history without adding it to the reports. PostgreSQL rejects new transaction dates before the cutoff, including manual, transfer, repayment and imported rows. Existing records are retained; settled dates still cannot be in the future. On 21 November, a 1 December start therefore shows no new settled tracking activity yet. Planned schedules can be saved now.

Change **Transaction tracking starts** in Monthly plan → Edit monthly plan. New workspaces choose their date explicitly; a suggested 1 December date is presented in that form. Changing a cutoff does not recalculate or delete historical balances.

## Expected dates and actual dates

Monthly plan and Loans & subscriptions contain a deduction calendar. Subscription `next_due_on` is its persistent schedule anchor; cadence determines weekly, monthly or yearly occurrences. Loans persist a separate `deduction_anchor_on`, falling back to an already-reviewed document’s first due date when no override is saved. Dates are editable. Short months clamp to their final day without changing the original day for later months. Paused subscriptions and closed/repaid loans are excluded.

The owner supplied four EMI deduction days for December onward. Those dates are configured against the existing owned records during release, not seeded into source or test fixtures. Unscheduled items request a date rather than guessing one. Loan projections are indicative while tracking remains active; they do not promise a lender-confirmed payoff date or post repayments automatically.

Actual standalone EMI dates and principal/interest come from `loan_payments` and their settled transaction, including reviewed PDF imports. For subscriptions, either **Record subscription deduction** once, or **Link an already-recorded subscription or card EMI expense** after a statement import. Linking changes metadata only and does not debit an account. PDF duplicate checks conservatively flag an existing linked recurring charge with the same account/date/amount even when bank narration differs; genuinely separate equal charges require manual review. Unlinking retains the expense. A matching manual subscription charge prompts existing-expense reconciliation rather than silently posting twice. The expense picker loads up to 200 unlinked expenses in the chosen month; use the ledger if your month exceeds that limit.

A card-linked EMI can link only to a settled expense on that plan’s linked card. It records the actual date without creating a second loan repayment or reducing the manually tracked card-plan principal. Card bill transfers remain separate. Deleting a subscription preserves its expenses and clears only their subscription links. Dates passed in the calendar mean “verify actual history”, not an invented missed-payment assertion.

## Interactive charts

Overview has Cash flow, Spending mix and Asset mix views. Select 3/6/12 months, toggle income/outflow, inspect a month, or select a category/asset for exact INR amounts and shares. Cash-flow data has an accessible table; selectable legends and controls work with keyboard and touch. Chart animation is disabled, honoring reduced motion. The layout supports mobile and dark appearance.

Charts use database aggregates, not the first page of the ledger. Cash flow includes settled expenses and standalone loan repayments, excluding transfers; net cash flow is not account balance. Spending mix uses expense categories, excluding standalone EMIs. Asset mix includes positive account balances and investments not already linked to an account, avoiding duplicate assets; it excludes debt, which remains in Net worth. No synthetic personal history or forecasts are plotted as actuals. Category/cash-flow analysis covers up to 12 months from the tracking cutoff. Empty states explain why there is no data before tracking begins.

## Security and release

Forward migration: `december_tracking_deductions`. Public mutation wrappers use invoker security; privileged operations remain private with empty search paths, verified ownership, existing account/loan lock order and revoked anonymous execution. New composite foreign keys preserve ownership and indexed deduction history. No private responses enter the PWA cache. Original PDFs/passwords remain local. Owner dates are configured without reading credentials or posting money.

Run lint, typecheck, Vitest, release tests, private/demo browser suites, production builds, sorted migration replay and database accounting/isolation tests. New tests cover cutoff accounting, preserved history, subscription retry/linking/ownership, card-plan restrictions, actual EMI dates, recurrence boundaries and chart/calendar interactions. Hosted acceptance uses disposable synthetic records inside a rollback transaction; never run bootstrap.sql on Supabase.

Prepared v0.3.6-rc.1. Local lint/typecheck, 134 Vitest + 2 release tests, the 27-test private browser suite, sorted PostgreSQL migration replay, accounting/security suites and four concurrency harnesses passed. New SQL coverage includes 29 tracking/deduction assertions. Existing PDF bundle-size warnings remain non-blocking. The final migration and merged-source deployment will receive hosted rollback and exact asset verification. Release identifiers will be recorded after publication.
