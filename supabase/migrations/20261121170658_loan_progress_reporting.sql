-- Progress metadata only: no ledger entries, balances, principal or terms are altered.
alter table public.loans add column progress_first_due_on date;
alter table public.loans add column payments_reported_through date;
create function folio_private.loan_progress_date_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.payments_reported_through>folio_private.today() then raise exception 'Report payments only through today or an earlier date.'; end if;
 return new;
end $$;
create trigger loan_progress_date_guard before insert or update of payments_reported_through on public.loans for each row execute function folio_private.loan_progress_date_guard();
revoke all on function folio_private.loan_progress_date_guard() from public,anon,authenticated;
-- workspace_snapshot already includes owned l.*; existing table RLS/grants protect the new fields.
notify pgrst,'reload schema';
