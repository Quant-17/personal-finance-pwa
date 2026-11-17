-- Add retry-safe RPCs. Only known function signatures are replaced; ledger rows are retained.

-- Private receipts make retries idempotent without retaining financial payloads.
create table folio_private.mutation_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  operation text not null,
  payload_hash text not null,
  result_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
alter table folio_private.mutation_receipts enable row level security;
revoke all on folio_private.mutation_receipts from public,anon,authenticated;
create function folio_private.begin_mutation(request uuid, op text, payload jsonb) returns uuid
language plpgsql set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); receipt folio_private.mutation_receipts;
begin
 if request is null then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||request::text,0));
 select * into receipt from folio_private.mutation_receipts where user_id=owner_id and request_id=request;
 if found then
   if receipt.operation<>op or receipt.payload_hash<>encode(sha256(convert_to(payload::text,'UTF8')),'hex') then
     raise exception 'This request ID was already used for different data. Check your ledger before reposting.';
   end if;
   return receipt.result_id;
 end if;
 return null;
end $$;
create function folio_private.finish_mutation(request uuid, op text, payload jsonb, result uuid) returns void
language plpgsql set search_path='' as $$
begin
 if request is not null then
   insert into folio_private.mutation_receipts(user_id,request_id,operation,payload_hash,result_id)
   values(folio_private.current_owner(),request,op,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),result);
 end if;
end $$;


drop function public.record_entry(uuid,uuid,text,bigint,date,text,uuid);

drop function folio_private.record_entry(uuid,uuid,text,bigint,date,text,uuid);

create function folio_private.record_entry(p_account uuid,p_category uuid,p_kind text,p_amount_paise bigint,p_occurred_on date,p_description text,p_entry uuid default null,p_request_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); entry_id uuid; previous public.transactions;
  request_payload jsonb:=jsonb_build_array(p_account,p_category,p_kind,p_amount_paise,p_occurred_on,p_description,p_entry); prior_result uuid;
begin
  prior_result:=folio_private.begin_mutation(p_request_id,'record_entry',request_payload);
  if prior_result is not null then return prior_result; end if;
  if p_kind not in ('income','expense') or p_kind is null or p_amount_paise is null or p_amount_paise not between 1 and 1000000000000 then raise exception 'Invalid transaction kind or amount.'; end if;
  perform folio_private.check_account(p_account,owner_id,p_occurred_on);
  perform 1 from public.categories where id=p_category and user_id=owner_id and kind=p_kind;
  if not found then raise exception 'Category unavailable or does not match transaction kind.' using errcode='42501'; end if;
  if p_entry is not null then
    select * into previous from public.transactions where id=p_entry and user_id=owner_id for update;
    if not found or previous.kind not in ('income','expense') or previous.account_id<>p_account then
      raise exception 'Entry unavailable; change account by deleting and reposting the entry.' using errcode='42501';
    end if;
    update public.transactions set category_id=p_category,kind=p_kind,amount_paise=case when p_kind='income' then p_amount_paise else -p_amount_paise end,
      occurred_on=p_occurred_on,description=coalesce(p_description,'') where id=p_entry and user_id=owner_id returning id into entry_id;
  else
    insert into public.transactions(user_id,account_id,category_id,kind,amount_paise,occurred_on,description)
    values(owner_id,p_account,p_category,p_kind,case when p_kind='income' then p_amount_paise else -p_amount_paise end,p_occurred_on,coalesce(p_description,'')) returning id into entry_id;
  end if;
  perform folio_private.finish_mutation(p_request_id,'record_entry',request_payload,entry_id);
  return entry_id;
end $$;

create function public.record_entry(p_account uuid,p_category uuid,p_kind text,p_amount_paise bigint,p_occurred_on date,p_description text,p_entry uuid default null,p_request_id uuid default null)
returns uuid language sql security invoker set search_path='' as $$ select folio_private.record_entry(p_account,p_category,p_kind,p_amount_paise,p_occurred_on,p_description,p_entry,p_request_id) $$;

drop function public.record_transfer(uuid,uuid,bigint,date,text);

drop function folio_private.record_transfer(uuid,uuid,bigint,date,text);

create function folio_private.record_transfer(p_from uuid,p_to uuid,p_amount_paise bigint,p_occurred_on date,p_description text,p_request_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); group_id uuid:=gen_random_uuid(); account uuid;
  request_payload jsonb:=jsonb_build_array(p_from,p_to,p_amount_paise,p_occurred_on,p_description); prior_result uuid;
begin
  prior_result:=folio_private.begin_mutation(p_request_id,'record_transfer',request_payload);
  if prior_result is not null then return prior_result; end if;
  if p_from is null or p_to is null or p_from=p_to or p_amount_paise is null or p_amount_paise not between 1 and 1000000000000 then raise exception 'Choose two different accounts and a positive amount.'; end if;
  for account in select unnest(array[p_from,p_to]) order by 1 loop perform folio_private.check_account(account,owner_id,p_occurred_on); end loop;
  insert into public.transactions(user_id,account_id,kind,amount_paise,occurred_on,description,transfer_id) values
    (owner_id,p_from,'transfer',-p_amount_paise,p_occurred_on,coalesce(p_description,''),group_id),
    (owner_id,p_to,'transfer',p_amount_paise,p_occurred_on,coalesce(p_description,''),group_id);
  perform folio_private.finish_mutation(p_request_id,'record_transfer',request_payload,group_id);
  return group_id;
end $$;

create function public.record_transfer(p_from uuid,p_to uuid,p_amount_paise bigint,p_occurred_on date,p_description text,p_request_id uuid default null) returns uuid
language sql security invoker set search_path='' as $$ select folio_private.record_transfer(p_from,p_to,p_amount_paise,p_occurred_on,p_description,p_request_id) $$;

drop function public.record_loan_payment(uuid,uuid,bigint,bigint,date,text);

drop function folio_private.record_loan_payment(uuid,uuid,bigint,bigint,date,text);

create function folio_private.record_loan_payment(p_loan uuid,p_account uuid,p_principal_paise bigint,p_interest_paise bigint,p_occurred_on date,p_description text,p_request_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); loan public.loans; remaining numeric; entry_id uuid;
  request_payload jsonb:=jsonb_build_array(p_loan,p_account,p_principal_paise,p_interest_paise,p_occurred_on,p_description); prior_result uuid;
begin
  prior_result:=folio_private.begin_mutation(p_request_id,'record_loan_payment',request_payload);
  if prior_result is not null then return prior_result; end if;
  if p_principal_paise is null or p_interest_paise is null or p_principal_paise<0 or p_interest_paise<0 or p_principal_paise+p_interest_paise not between 1 and 1000000000000 then raise exception 'Invalid principal or interest.'; end if;
  select * into loan from public.loans where id=p_loan and user_id=owner_id and status='active' for update;
  if not found then raise exception 'Loan unavailable.' using errcode='42501'; end if;
  if p_occurred_on<loan.start_date then raise exception 'Payment cannot precede the loan start date.'; end if;
  remaining:=loan.principal_paise-(select coalesce(sum(p.principal_paise),0) from public.loan_payments p where p.loan_id=p_loan and p.user_id=owner_id);
  if remaining<=0 or p_principal_paise>remaining then raise exception 'Principal repayment exceeds the outstanding balance.'; end if;
  perform folio_private.check_account(p_account,owner_id,p_occurred_on);
  insert into public.transactions(user_id,account_id,kind,amount_paise,occurred_on,description)
    values(owner_id,p_account,'loan_payment',-(p_principal_paise+p_interest_paise),p_occurred_on,coalesce(p_description,'')) returning id into entry_id;
  insert into public.loan_payments(user_id,loan_id,transaction_id,principal_paise,interest_paise,paid_on)
    values(owner_id,p_loan,entry_id,p_principal_paise,p_interest_paise,p_occurred_on);
  perform folio_private.finish_mutation(p_request_id,'record_loan_payment',request_payload,entry_id);
  return entry_id;
end $$;

create function public.record_loan_payment(p_loan uuid,p_account uuid,p_principal_paise bigint,p_interest_paise bigint,p_occurred_on date,p_description text,p_request_id uuid default null)
returns uuid language sql security invoker set search_path='' as $$ select folio_private.record_loan_payment(p_loan,p_account,p_principal_paise,p_interest_paise,p_occurred_on,p_description,p_request_id) $$;

drop function public.set_goal_allocation(uuid,uuid,bigint);

drop function folio_private.set_goal_allocation(uuid,uuid,bigint);

create function folio_private.set_goal_allocation(p_goal uuid,p_account uuid,p_amount_paise bigint,p_request_id uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); goal public.savings_goals; balance numeric; reserved numeric; toward_goal numeric;
  request_payload jsonb:=jsonb_build_array(p_goal,p_account,p_amount_paise); prior_result uuid;
begin
  prior_result:=folio_private.begin_mutation(p_request_id,'set_goal_allocation',request_payload);
  if prior_result is not null then return; end if;
  if p_amount_paise is null or p_amount_paise not between 0 and 1000000000000 then raise exception 'Invalid allocation.'; end if;
  select * into goal from public.savings_goals where id=p_goal and user_id=owner_id for update;
  if not found then raise exception 'Goal unavailable.' using errcode='42501'; end if;
  if p_amount_paise=0 then
    perform 1 from public.accounts where id=p_account and user_id=owner_id for update;
    if not found then raise exception 'Account unavailable.' using errcode='42501'; end if;
    delete from public.goal_allocations where user_id=owner_id and goal_id=p_goal and account_id=p_account;
    perform folio_private.finish_mutation(p_request_id,'set_goal_allocation',request_payload,p_goal);
    return;
  end if;
  perform folio_private.check_account(p_account,owner_id,folio_private.today());
  select a.opening_balance_paise+(select coalesce(sum(t.amount_paise),0) from public.transactions t where t.account_id=a.id and t.user_id=owner_id)
    into balance from public.accounts a where a.id=p_account and a.user_id=owner_id;
  select coalesce(sum(amount_paise),0) into reserved from public.goal_allocations where user_id=owner_id and account_id=p_account and goal_id<>p_goal;
  select coalesce(sum(amount_paise),0) into toward_goal from public.goal_allocations where user_id=owner_id and goal_id=p_goal and account_id<>p_account;
  if p_amount_paise>0 and (p_amount_paise>balance-reserved or p_amount_paise>goal.target_paise-toward_goal) then raise exception 'Allocation exceeds available funds or the goal target.'; end if;
  if p_amount_paise=0 then delete from public.goal_allocations where user_id=owner_id and goal_id=p_goal and account_id=p_account;
  else insert into public.goal_allocations(user_id,goal_id,account_id,amount_paise) values(owner_id,p_goal,p_account,p_amount_paise)
    on conflict(user_id,goal_id,account_id) do update set amount_paise=excluded.amount_paise;
  end if;
  perform folio_private.finish_mutation(p_request_id,'set_goal_allocation',request_payload,p_goal);
end $$;

create function public.set_goal_allocation(p_goal uuid,p_account uuid,p_amount_paise bigint,p_request_id uuid default null) returns void
language sql security invoker set search_path='' as $$ select folio_private.set_goal_allocation(p_goal,p_account,p_amount_paise,p_request_id) $$;

drop function public.delete_entry(uuid);

drop function folio_private.delete_entry(uuid);

create function folio_private.delete_entry(p_entry uuid,p_request_id uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); entry public.transactions; loan uuid; account uuid;
  request_payload jsonb:=jsonb_build_array(p_entry); prior_result uuid;
begin
  prior_result:=folio_private.begin_mutation(p_request_id,'delete_entry',request_payload);
  if prior_result is not null then return; end if;
  select * into entry from public.transactions where id=p_entry and user_id=owner_id;
  if not found then raise exception 'Entry unavailable.' using errcode='42501'; end if;
  if entry.kind='loan_payment' then
    select loan_id into loan from public.loan_payments where transaction_id=p_entry and user_id=owner_id;
    perform 1 from public.loans where id=loan and user_id=owner_id for update;
  end if;
  if entry.kind='transfer' then
    for account in select account_id from public.transactions where user_id=owner_id and transfer_id=entry.transfer_id order by account_id loop
      perform 1 from public.accounts where id=account and user_id=owner_id for update;
    end loop;
    delete from public.transactions where user_id=owner_id and transfer_id=entry.transfer_id;
  else
    perform 1 from public.accounts where id=entry.account_id and user_id=owner_id for update;
    delete from public.transactions where id=p_entry and user_id=owner_id;
  end if;
  perform folio_private.finish_mutation(p_request_id,'delete_entry',request_payload,p_entry);
end $$;

create function public.delete_entry(p_entry uuid,p_request_id uuid default null) returns void language sql security invoker set search_path='' as $$ select folio_private.delete_entry(p_entry,p_request_id) $$;

-- Explicit function ACLs: only authenticated callers can initialize or invoke financial RPCs.
do $$ declare fn record; begin
  for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='folio_private' loop
    execute format('revoke all on function %s from public, anon, authenticated',fn.signature);
    if fn.signature::text !~ '(begin_mutation|finish_mutation)' then
      execute format('grant execute on function %s to authenticated',fn.signature);
    end if;
  end loop;
  for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('initialize_workspace','record_entry','record_transfer','record_loan_payment','set_goal_allocation','delete_entry','workspace_snapshot') loop
    execute format('revoke all on function %s from public, anon',fn.signature);
    execute format('grant execute on function %s to authenticated',fn.signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
