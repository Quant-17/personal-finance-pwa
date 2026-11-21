# Loan payment progress

Loans & subscriptions adds an interactive principal-progress ring, repayment-balance curve, instalment inspector and accessible schedule table. The loan selector includes each EMI amount to distinguish similarly named loans.

Principal reduction uses the original principal from the saved reviewed document and the current tracked outstanding. Without original terms, the basis is explicitly the tracking opening principal. Outstanding above the original amount does not produce a negative/false repayment percentage. Saved balances may be manual or estimated; the graph labels the saved balance basis and review date and does not claim bank verification.

The curve uses a complete reviewed lender/manual schedule when available; otherwise it is labelled as a reducing-balance estimate using original principal, nominal rate and original tenure. It is not a historical actual-payment curve. The dashed reference is current tracked outstanding. Fees, flat-rate structures and changes in terms require review. The original scheduled final EMI date is indicative, not a promise of payoff.

New nullable loan metadata `progress_first_due_on` and `payments_reported_through` support the owner’s confirmation that due EMIs were paid on time. The count includes only due dates on/before the reported-through date and today, capped by original tenure. It does not advance automatically beyond that confirmation date or mark future EMIs paid. Recorded ledger repayments remain separate. Short-month dates clamp without drifting later months. An original first EMI date is distinct from the upcoming recurring deduction anchor and the accounting tracking baseline.

The owner supplied corrected first dates and an on-time report through 21 November 2026. Those are configured against existing owned records during release; no personal loan names, dates or figures are seeded into migrations/tests. Missing dates remain editable. Saving a report never posts repayments or changes principal, balances, APR or term. Existing ownership/RLS and loan-document revision guards remain; a database trigger rejects reported-through dates in the future. No new RPC grants or private-response caching.

The owner also clarified that the first monthly upload will occur on 1 December for November transactions. Live reporting starts 1 November; existing 21 November account/loan baselines still require reconciliation before posting earlier payments. The progress confirmation does not resolve or bypass those baselines.

Validation includes lint/typecheck, pure calculation tests, existing ledger/security tests, new progress metadata ownership/future-date/unchanged-balance checks, responsive browser interaction tests and production builds. No actual owner ledger records are imported as part of release. Release verification identifiers will be recorded after publication.
