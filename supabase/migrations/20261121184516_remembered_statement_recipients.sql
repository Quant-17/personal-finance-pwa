-- Private classification metadata only. No statement, recipient or financial data is seeded.
create table public.statement_rules (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 account_id uuid not null,
 recipient_key text not null check(length(recipient_key) between 3 and 240),
 recipient_name text not null check(length(btrim(recipient_name)) between 1 and 120),
 review_note text not null default '' check(length(review_note)<=160),
 direction text not null check(direction in ('debit','credit')),
 kind text not null check(kind in ('income','expense','loan_payment','exclude')),
 category_id uuid,
 category_kind text generated always as (case when kind in ('income','expense') then kind else null end) stored,
 loan_id uuid,
 subscription_id uuid,
 amount_paise bigint check(amount_paise between 1 and 1000000000000),
 enabled boolean not null default true,
 foreign key(account_id,user_id) references public.accounts(id,user_id) on delete cascade,
 foreign key(category_id,user_id,category_kind) references public.categories(id,user_id,kind) on delete cascade,
 foreign key(loan_id,user_id) references public.loans(id,user_id) on delete cascade,
 foreign key(subscription_id,user_id) references public.subscriptions(id,user_id) on delete cascade,
 check ((kind='exclude' and category_id is null and loan_id is null and subscription_id is null)
  or (kind in ('income','expense') and category_id is not null and loan_id is null and (subscription_id is null or kind='expense'))
  or (kind='loan_payment' and loan_id is not null and category_id is null and subscription_id is null and amount_paise is not null)),
 check(kind='exclude' or (kind='income' and direction='credit') or (kind in ('expense','loan_payment') and direction='debit')),
 check(subscription_id is null or amount_paise is not null),
 unique nulls not distinct (account_id,direction,recipient_key,amount_paise)
);
create index statement_rules_owner_idx on public.statement_rules(user_id);
create index statement_rules_category_idx on public.statement_rules(category_id,user_id,category_kind);
create index statement_rules_loan_idx on public.statement_rules(loan_id,user_id);
create index statement_rules_subscription_idx on public.statement_rules(subscription_id,user_id);
alter table public.statement_rules enable row level security;
revoke all on public.statement_rules from public,anon,authenticated;
grant select,insert,update,delete on public.statement_rules to authenticated;
create policy statement_rules_read on public.statement_rules for select to authenticated using(user_id=(select folio_private.current_owner()));
create policy statement_rules_insert on public.statement_rules for insert to authenticated with check(user_id=(select folio_private.current_owner()));
create policy statement_rules_update on public.statement_rules for update to authenticated using(user_id=(select folio_private.current_owner())) with check(user_id=(select folio_private.current_owner()));
create policy statement_rules_delete on public.statement_rules for delete to authenticated using(user_id=(select folio_private.current_owner()));

-- Preserve the old RPC signatures and retry receipts; link a selected subscription atomically.
create or replace function folio_private.statement_rows_valid(p_account uuid,p_rows jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare item jsonb; e jsonb; loan public.loans; owner_id uuid:=folio_private.current_owner(); normalized jsonb; result jsonb:='[]'; seen text[]:='{}';
begin
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 or octet_length(p_rows::text)>1048576 then raise exception 'Review 1–500 rows within 1 MiB.'; end if;
 -- Match manual repayment lock order: all referenced loans, then accounts.
 -- Text comparison avoids unsafe casts before strict validation. Never lock another owner's loans.
 perform 1 from public.loans l where l.user_id=owner_id and exists(
  select 1 from jsonb_array_elements(p_rows) r where r->'entry'->>'kind'='loan_payment' and r->'entry'->>'loan_id'=l.id::text
 ) order by l.id for update;
 perform 1 from public.accounts where user_id=owner_id order by id for update;
 for item in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(item) is distinct from 'object' or (select count(*) from jsonb_object_keys(item))<>2 or not item ?& array['source_row','entry'] or coalesce(item->>'source_row','')!~'^[0-9]{1,2}:[0-9]{1,6}$' or item->>'source_row'=any(seen) then raise exception 'Invalid or repeated source row.'; end if;
  e:=item->'entry';
  if e->>'kind'='loan_payment' then
   if jsonb_typeof(e) is distinct from 'object' or (select count(*) from jsonb_object_keys(e))<>7
    or not e ?& array['kind','amount_paise','occurred_on','description','loan_id','principal_paise','interest_paise']
    or jsonb_typeof(e->'description') is distinct from 'string' or length(btrim(e->>'description')) not between 1 and 240
    or coalesce(e->>'occurred_on','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or coalesce(e->>'loan_id','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    or jsonb_typeof(e->'amount_paise') is distinct from 'number' or coalesce(e->>'amount_paise','')!~'^[0-9]{1,13}$'
    or jsonb_typeof(e->'principal_paise') is distinct from 'number' or coalesce(e->>'principal_paise','')!~'^[0-9]{1,13}$'
    or jsonb_typeof(e->'interest_paise') is distinct from 'number' or coalesce(e->>'interest_paise','')!~'^[0-9]{1,13}$'
   then raise exception 'Review the EMI loan, date, amount and principal/interest split.'; end if;
   if (e->>'amount_paise')::bigint not between 1 and 1000000000000
    or (e->>'principal_paise')::bigint+(e->>'interest_paise')::bigint<>(e->>'amount_paise')::bigint
   then raise exception 'Principal plus interest must equal the statement debit.'; end if;
   select * into loan from public.loans where id=(e->>'loan_id')::uuid and user_id=owner_id;
   if not found then raise exception 'Loan unavailable.' using errcode='42501'; end if;
   if loan.card_account_id is not null then raise exception 'Card-linked EMI plans use card repayment tracking.'; end if;
   if (e->>'occurred_on')::date<loan.start_date then raise exception 'Payment predates the loan tracking balance.'; end if;
   perform folio_private.check_account(p_account,owner_id,(e->>'occurred_on')::date);
   if exists(select 1 from public.accounts where id=p_account and type='credit_card') then raise exception 'Choose the bank account that paid this EMI.'; end if;
   normalized:=e||jsonb_build_object('description',btrim(e->>'description'));
  else
   if e ? 'subscription_id' then
    if e->>'kind'<>'expense' or jsonb_typeof(e->'subscription_id') is distinct from 'string' then raise exception 'Subscription deductions must be expenses.'; end if;
    perform 1 from public.subscriptions where id=(e->>'subscription_id')::uuid and user_id=owner_id and active and (account_id is null or account_id=p_account);
    if not found then raise exception 'Active subscription for this account unavailable.' using errcode='42501'; end if;
   end if;
   normalized:=folio_private.csv_rows(p_account,jsonb_build_array(e-'subscription_id'))->0;
   if e ? 'subscription_id' then normalized:=normalized||jsonb_build_object('subscription_id',e->>'subscription_id'); end if;
  end if;
  result:=result||jsonb_build_array(jsonb_build_object('source_row',item->>'source_row','entry',normalized));
  seen:=array_append(seen,item->>'source_row');
 end loop;
 return result;
end $$;
create or replace function folio_private.import_statement_entries(p_account uuid,p_source_sha256 text,p_rows jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); prior folio_private.statement_requests; digest text; rows jsonb; item jsonb; entry jsonb; inserted integer:=0; skipped integer:=0; result jsonb; snapshot jsonb; transaction_id uuid;
begin
 if p_source_sha256 is null or p_source_sha256!~'^[a-f0-9]{64}$' or p_request_id is null or p_rows is null or octet_length(p_rows::text)>1048576 then raise exception 'Invalid statement import.'; end if;
 digest:=encode(sha256(convert_to(jsonb_build_array(p_account,p_source_sha256,p_rows)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||p_request_id::text,0));
 select * into prior from folio_private.statement_requests where user_id=owner_id and request_id=p_request_id;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request ID already used for a different selection.'; end if;
  return prior.result;
 end if;
 rows:=folio_private.statement_rows_valid(p_account,p_rows);
 for item in select value from jsonb_array_elements(rows) loop
  if folio_private.statement_duplicate(owner_id,p_account,p_source_sha256,item) then skipped:=skipped+1;
  else
   entry:=item->'entry';
   if entry->>'kind'='loan_payment' then
    perform folio_private.record_loan_payment((entry->>'loan_id')::uuid,p_account,(entry->>'principal_paise')::bigint,(entry->>'interest_paise')::bigint,(entry->>'occurred_on')::date,entry->>'description',null);
   else
    transaction_id:=folio_private.record_entry(p_account,(entry->>'category_id')::uuid,entry->>'kind',(entry->>'amount_paise')::bigint,(entry->>'occurred_on')::date,entry->>'description',null,null);
    if entry ? 'subscription_id' then perform folio_private.link_subscription_deduction((entry->>'subscription_id')::uuid,transaction_id); end if;
   end if;
   inserted:=inserted+1;
  end if;
  -- Remember even a ledger match. Reclassifying a statement row cannot repost it later.
  insert into folio_private.statement_rows(user_id,account_id,source_sha256,source_row)
   values(owner_id,p_account,p_source_sha256,item->>'source_row') on conflict do nothing;
 end loop;
 snapshot:=public.workspace_snapshot();
 if exists(select 1 from (
  select (a->>'balance_paise')::numeric amount from jsonb_array_elements(snapshot->'accounts') a
  union all select case when key<>'month' then value::numeric end from jsonb_each_text(snapshot->'summary')
  union all select (b->>'spent_paise')::numeric from jsonb_array_elements(snapshot->'budgets') b
  union all select (c->>'income_paise')::numeric from jsonb_array_elements(snapshot->'cashflow') c
  union all select (c->>'outflow_paise')::numeric from jsonb_array_elements(snapshot->'cashflow') c
 ) totals where abs(amount)>1000000000000) then raise exception 'Statement exceeds supported financial totals.' using errcode='22003'; end if;
 result:=jsonb_build_object('inserted',inserted,'skipped',skipped);
 insert into folio_private.statement_requests values(owner_id,p_request_id,digest,result);
 return result;
end $$;


notify pgrst,'reload schema';
