import type { Snapshot } from "./domain";
import { indiaDate } from "./domain";
import type { LoanDocumentTerms } from "./loanDocuments";
import { recurringDate } from "./recurring";
import { loanSchedule } from "./schedule";
export function loanProgress(
  loan: Snapshot["loans"][number],
  document: LoanDocumentTerms | null,
  today = indiaDate(),
) {
  const original = document?.original_principal_paise ?? loan.principal_paise;
  const months = document?.original_months ?? loan.tenure_months;
  const first = loan.progress_first_due_on ?? document?.first_due_on ?? null;
  const through = loan.payments_reported_through ?? null;
  const paid =
    first && through
      ? Array.from({ length: months }, (_, i) =>
          recurringDate(first, i),
        ).filter((d) => d <= through && d <= today).length
      : null;
  const reviewed =
    !!document &&
    document.schedule.length === months &&
    document.schedule_origin !== "none";
  const estimate = loanSchedule(
    original,
    document?.nominal_rate ?? loan.apr,
    months,
  );
  const schedule = Array.from({ length: months }, (_, i) => {
    const row = reviewed ? document!.schedule[i] : null,
      e = estimate[i];
    return {
      period: i + 1,
      date: first ? recurringDate(first, i) : null,
      principal_paise: row?.principal_paise ?? e.principalPaise,
      interest_paise: row?.interest_paise ?? e.interestPaise,
      balance_paise: row
        ? row.opening_paise - row.principal_paise
        : e.balancePaise,
    };
  });
  return {
    original,
    months,
    first,
    through,
    paid,
    remaining: paid === null ? null : months - paid,
    principal_reduction:
      loan.outstanding_paise <= original
        ? original - loan.outstanding_paise
        : null,
    basis: document ? "Original principal" : "Tracking opening principal",
    reviewed,
    schedule,
    payoff: first ? recurringDate(first, months - 1) : null,
  };
}
