-- Cover existing composite-owner foreign keys without changing records, policies or accounting.
create index statement_rows_account_owner_idx on folio_private.statement_rows(account_id,user_id);
create index loan_document_details_loan_owner_idx on public.loan_document_details(loan_id,user_id);
create index statement_rules_account_owner_idx on public.statement_rules(account_id,user_id);
