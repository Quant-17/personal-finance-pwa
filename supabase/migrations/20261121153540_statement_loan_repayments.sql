-- Extend confirmed PDF imports using existing principal/interest accounting. No document storage.
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
   normalized:=folio_private.csv_rows(p_account,jsonb_build_array(e))->0;
  end if;
  result:=result||jsonb_build_array(jsonb_build_object('source_row',item->>'source_row','entry',normalized));
  seen:=array_append(seen,item->>'source_row');
 end loop;
 return result;
end $$;
create or replace function folio_private.statement_duplicate(p_owner uuid,p_account uuid,p_source text,item jsonb) returns boolean
language sql volatile set search_path='' as $$
 select exists(select 1 from folio_private.statement_rows where user_id=p_owner and account_id=p_account and source_sha256=p_source and source_row=item->>'source_row')
 or exists(select 1 from public.transactions t where t.user_id=p_owner and t.account_id=p_account and t.kind=item->'entry'->>'kind'
 and t.occurred_on=(item->'entry'->>'occurred_on')::date
 and t.amount_paise=case when item->'entry'->>'kind'='income' then (item->'entry'->>'amount_paise')::bigint else -(item->'entry'->>'amount_paise')::bigint end
 and case when item->'entry'->>'kind'='loan_payment' then exists(
  select 1 from public.loan_payments lp where lp.user_id=p_owner and lp.transaction_id=t.id and lp.loan_id=(item->'entry'->>'loan_id')::uuid
 ) else t.description=item->'entry'->>'description' end)

$$;
create or replace function folio_private.preview_statement_import(p_account uuid,p_source_sha256 text,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); rows jsonb; item jsonb; seen text[]:='{}'; duplicates jsonb:='[]'; repeated boolean;
begin
 if p_source_sha256 is null or p_source_sha256!~'^[a-f0-9]{64}$' then raise exception 'Invalid document fingerprint.'; end if;
 rows:=folio_private.statement_rows_valid(p_account,p_rows);
 for item in select value from jsonb_array_elements(rows) loop
  repeated:=(case when item->'entry'->>'kind'='loan_payment' then (item->'entry')-'description'-'principal_paise'-'interest_paise' else item->'entry' end)::text=any(seen) or folio_private.statement_duplicate(owner_id,p_account,p_source_sha256,item);
  duplicates:=duplicates||jsonb_build_array(repeated); seen:=array_append(seen,(case when item->'entry'->>'kind'='loan_payment' then (item->'entry')-'description'-'principal_paise'-'interest_paise' else item->'entry' end)::text);
 end loop;
 return jsonb_build_object('duplicates',duplicates);
end $$;
create or replace function public.preview_statement_import(p_account uuid,p_source_sha256 text,p_rows jsonb) returns jsonb
language sql security invoker set search_path='' as $$select folio_private.preview_statement_import(p_account,p_source_sha256,p_rows)$$;
create or replace function folio_private.import_statement_entries(p_account uuid,p_source_sha256 text,p_rows jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); prior folio_private.statement_requests; digest text; rows jsonb; item jsonb; entry jsonb; inserted integer:=0; skipped integer:=0; result jsonb; snapshot jsonb;
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
    perform folio_private.record_entry(p_account,(entry->>'category_id')::uuid,entry->>'kind',(entry->>'amount_paise')::bigint,(entry->>'occurred_on')::date,entry->>'description',null,null);
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
