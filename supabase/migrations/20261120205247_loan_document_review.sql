-- Local-only PDF extraction; only reviewed structured terms enter the database.
alter table public.loans add column reported_emi_paise bigint check (reported_emi_paise between 1 and 1000000000),
  add column card_account_id uuid,
  add foreign key(card_account_id,user_id) references public.accounts(id,user_id);
alter table public.loans drop constraint loans_principal_paise_check;
alter table public.loans add constraint loans_principal_paise_check check(principal_paise between 0 and 1000000000 and (principal_paise>0 or status='closed'));
create index loans_card_account_idx on public.loans(card_account_id,user_id) where card_account_id is not null;
create table public.loan_document_details (
  loan_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
  details jsonb not null,
  revision integer not null default 1 check(revision>0),
  updated_at timestamptz not null default now(),
  foreign key(loan_id,user_id) references public.loans(id,user_id) on delete cascade,
  unique(user_id,source_sha256)
);
alter table public.loan_document_details enable row level security;
revoke all on public.loan_document_details from public,anon,authenticated;
grant select on public.loan_document_details to authenticated;
create policy owner_select on public.loan_document_details for select to authenticated
  using(user_id=(select auth.uid()) and ((select auth.jwt())->>'is_anonymous') is distinct from 'true');

create function folio_private.validate_loan_document(t jsonb) returns void language plpgsql set search_path='' as $$
declare k text; r jsonb; i int:=0; previous_balance bigint; page_count int; d date;
begin
  if jsonb_typeof(t) is distinct from 'object' or octet_length(t::text)>131072 then raise exception 'Invalid document details.'; end if;
  if (select count(*) from jsonb_object_keys(t))<>21 or not t ?& array['name','provider','source_sha256','source_page_count','original_principal_paise','original_months','nominal_rate','disclosure_apr','net_disbursed_paise','fees_paise','reported_emi_paise','current_outstanding_paise','remaining_months','as_of','paid_through','first_due_on','balance_basis','card_account_id','schedule_origin','schedule','source_pages'] then raise exception 'Unexpected document fields.'; end if;
  foreach k in array array['provider','source_sha256','balance_basis','schedule_origin'] loop
    if jsonb_typeof(t->k) is distinct from 'string' then raise exception 'Invalid document labels.'; end if;
  end loop;
  if jsonb_typeof(t->'name') is distinct from 'string' or length(btrim(t->>'name')) not between 1 and 80
    or t->>'provider' not in ('credit_saison','kotak','lt_finance') or t->>'source_sha256' !~ '^[a-f0-9]{64}$'
    or t->>'balance_basis' not in ('manual','statement','confirmed_schedule','estimate')
    or t->>'schedule_origin' not in ('lender','manual','none') then raise exception 'Invalid reviewed terms.'; end if;
  foreach k in array array['original_principal_paise','net_disbursed_paise','fees_paise','reported_emi_paise','current_outstanding_paise','original_months','remaining_months','source_page_count'] loop
    if k in ('net_disbursed_paise','fees_paise') and t->k='null'::jsonb then continue; end if;
    if jsonb_typeof(t->k) is distinct from 'number' or t->>k !~ '^\d+$' or (t->>k)::numeric not between 0 and 1000000000 then raise exception 'Use bounded integer paise and month/page counts.'; end if;
  end loop;
  page_count:=(t->>'source_page_count')::int;
  if page_count not between 1 and 60 or (t->>'original_months')::int not between 1 and 120 or (t->>'remaining_months')::int not between 0 and 120
    or (t->>'original_principal_paise')::bigint<1 or (t->>'reported_emi_paise')::bigint<1
    or ((t->>'current_outstanding_paise')::bigint>0 and (t->>'remaining_months')::int<1) then raise exception 'Invalid principal, EMI or tenure.'; end if;
  if jsonb_typeof(t->'nominal_rate') is distinct from 'number' or (t->>'nominal_rate')::numeric not between 0 and 60
    or (t->>'nominal_rate')::numeric<>round((t->>'nominal_rate')::numeric,4) then raise exception 'Use an annual nominal rate from 0–60 with at most four decimals.'; end if;
  if t->'disclosure_apr'<>'null'::jsonb and (jsonb_typeof(t->'disclosure_apr') is distinct from 'number' or (t->>'disclosure_apr')::numeric not between 0 and 1000) then raise exception 'Invalid disclosed APR.'; end if;
  foreach k in array array['as_of','paid_through','first_due_on'] loop
    if k<>'as_of' and t->k='null'::jsonb then continue; end if;
    if jsonb_typeof(t->k) is distinct from 'string' or t->>k !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Use ISO calendar dates.'; end if;
    d:=(t->>k)::date;
    if k='as_of' and d>folio_private.today() or k='paid_through' and d>(t->>'as_of')::date then raise exception 'Use a settled balance date and paid-through date no later than it.'; end if;
  end loop;
  if t->'card_account_id'<>'null'::jsonb then
    if jsonb_typeof(t->'card_account_id') is distinct from 'string' then raise exception 'Invalid card account.'; end if;
    perform (t->>'card_account_id')::uuid;
  end if;
  if jsonb_typeof(t->'source_pages') is distinct from 'object' or (select count(*) from jsonb_object_keys(t->'source_pages'))<>6 or not (t->'source_pages') ?& array['principal','rate','apr','emi','tenure','first_due'] then raise exception 'Invalid source pages.'; end if;
  for r in select value from jsonb_each(t->'source_pages') loop
    if r<>'null'::jsonb and (jsonb_typeof(r) is distinct from 'number' or r::text !~ '^\d+$' or r::text::numeric not between 1 and page_count) then raise exception 'Invalid source page.'; end if;
  end loop;
  if jsonb_typeof(t->'schedule') is distinct from 'array' then raise exception 'Invalid repayment schedule.'; end if;
  if jsonb_array_length(t->'schedule')>120 or ((t->>'schedule_origin'='none') <> (jsonb_array_length(t->'schedule')=0)) then raise exception 'Schedule rows and source must agree.'; end if;
  for r in select value from jsonb_array_elements(t->'schedule') loop
    i:=i+1;
    if jsonb_typeof(r) is distinct from 'object' or (select count(*) from jsonb_object_keys(r))<>6 or not r ?& array['sequence','opening_paise','principal_paise','interest_paise','payment_paise','source_page'] then raise exception 'Invalid schedule fields.'; end if;
    foreach k in array array['sequence','opening_paise','principal_paise','interest_paise','payment_paise','source_page'] loop
      if k='source_page' and r->k='null'::jsonb then continue; end if;
      if jsonb_typeof(r->k) is distinct from 'number' or r->>k !~ '^\d+$' or (r->>k)::numeric not between 0 and 1000000000 then raise exception 'Invalid schedule amount.'; end if;
    end loop;
    if (r->>'payment_paise')::bigint<1 or (r->>'sequence')::int<>i or (r->>'source_page')::int not between 1 and page_count
      or abs((r->>'principal_paise')::bigint+(r->>'interest_paise')::bigint-(r->>'payment_paise')::bigint)>100
      or (r->>'principal_paise')::bigint>(r->>'opening_paise')::bigint
      or (previous_balance is not null and abs(previous_balance-(r->>'opening_paise')::bigint)>100) then raise exception 'Schedule rows must reconcile in order.'; end if;
    previous_balance:=(r->>'opening_paise')::bigint-(r->>'principal_paise')::bigint;
  end loop;
end $$;

-- Reject linked-card loan repayments: bank-to-card transfer already accounts for cash.
create function folio_private.loan_card_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_table_name='loans' then
    if new.card_account_id is not null then
      perform 1 from public.accounts where id=new.card_account_id and user_id=new.user_id and type='credit_card' for update;
      if not found then raise exception 'Choose an owned credit-card account.' using errcode='42501'; end if;
      if exists(select 1 from public.loan_payments where loan_id=new.id and user_id=new.user_id) then raise exception 'Cannot link a loan with posted repayments to a card.'; end if;
    end if;
  elsif tg_table_name='accounts' then
    if new.type<>'credit_card' and exists(select 1 from public.loans where card_account_id=new.id and user_id=new.user_id) then raise exception 'This account has linked EMI plans; retain its credit-card type.'; end if;
  elsif exists(select 1 from public.loans where id=new.loan_id and user_id=new.user_id and card_account_id is not null) then
    raise exception 'Pay the card with a transfer, then update this plan balance. Do not post a second loan payment.';
  end if;
  return new;
end $$;
create trigger loan_card_guard before insert or update on public.loans for each row execute function folio_private.loan_card_guard();
create trigger account_card_guard before update on public.accounts for each row execute function folio_private.loan_card_guard();
create trigger payment_card_guard before insert or update on public.loan_payments for each row execute function folio_private.loan_card_guard();

create function folio_private.loan_document_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or (case when tg_op='DELETE' then old.user_id else new.user_id end)<>folio_private.current_owner() then raise exception 'Owner required.' using errcode='42501'; end if;
  if tg_table_name='loans' then
    update public.loan_document_details set revision=revision+1,updated_at=now() where loan_id=new.id and user_id=new.user_id;
  elsif tg_op='DELETE' then
    update public.loan_document_details set revision=revision+1,updated_at=now() where loan_id=old.loan_id and user_id=old.user_id;
  else
    update public.loan_document_details set revision=revision+1,updated_at=now() where loan_id=new.loan_id and user_id=new.user_id;
  end if;
  return null;
end $$;
revoke all on function folio_private.loan_document_revision() from public,anon,authenticated;
create trigger loan_document_revision after update on public.loans for each row execute function folio_private.loan_document_revision();
create trigger payment_document_revision after insert or update or delete on public.loan_payments for each row execute function folio_private.loan_document_revision();

create function folio_private.save_loan_document(p_loan uuid,p_expected_revision integer,p_terms jsonb,p_request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); result uuid; prior uuid; old public.loans; rev int;
  paid bigint; last_paid date; tracking_principal bigint; payload jsonb:=jsonb_build_array(p_loan,p_expected_revision,p_terms); totals jsonb;
begin
  if p_request_id is null then raise exception 'A retry-safe request ID is required.'; end if;
  prior:=folio_private.begin_mutation(p_request_id,'save_loan_document',payload);
  if prior is not null then return prior; end if;
  perform folio_private.validate_loan_document(p_terms);
  if p_loan is not null then
    select * into old from public.loans where id=p_loan and user_id=owner_id for update;
    if not found then raise exception 'Loan unavailable.' using errcode='42501'; end if;
    select revision into rev from public.loan_document_details where loan_id=p_loan and user_id=owner_id;
    if coalesce(rev,0)<>coalesce(p_expected_revision,0) then raise exception 'This loan was updated elsewhere. Reopen it before saving.' using errcode='40001'; end if;
  elsif coalesce(p_expected_revision,0)<>0 then raise exception 'New loans have no prior revision.'; end if;
  -- Same order as loan-payment RPC: loan first, then accounts in UUID order.
  perform 1 from public.accounts where user_id=owner_id order by id for update;
  if p_terms->'card_account_id'<>'null'::jsonb then
    perform 1 from public.accounts where id=(p_terms->>'card_account_id')::uuid and user_id=owner_id and type='credit_card' and archived_at is null;
    if not found then raise exception 'Choose an active owned credit-card account.' using errcode='42501'; end if;
  end if;
  select coalesce(sum(principal_paise),0),max(paid_on) into paid,last_paid from public.loan_payments where loan_id=p_loan and user_id=owner_id;
  if last_paid>(p_terms->>'as_of')::date then raise exception 'Balance date cannot precede posted repayments.'; end if;
  tracking_principal:=paid+(p_terms->>'current_outstanding_paise')::bigint;
  if tracking_principal>1000000000 then raise exception 'Tracking principal exceeds the supported loan limit.' using errcode='22003'; end if;
  if p_loan is null then
    insert into public.loans(user_id,name,principal_paise,apr,tenure_months,start_date,status,reported_emi_paise,card_account_id)
    values(owner_id,btrim(p_terms->>'name'),tracking_principal,(p_terms->>'nominal_rate')::numeric,greatest(1,(p_terms->>'remaining_months')::int),(p_terms->>'as_of')::date,
      case when (p_terms->>'current_outstanding_paise')::bigint=0 then 'closed' else 'active' end,(p_terms->>'reported_emi_paise')::bigint,(p_terms->>'card_account_id')::uuid) returning id into result;
  else
    result:=p_loan;
    update public.loans set name=btrim(p_terms->>'name'),principal_paise=tracking_principal,apr=(p_terms->>'nominal_rate')::numeric,
      tenure_months=greatest(1,(p_terms->>'remaining_months')::int),start_date=case when last_paid is null then (p_terms->>'as_of')::date else old.start_date end,
      status=case when (p_terms->>'current_outstanding_paise')::bigint=0 then 'closed' else 'active' end,
      reported_emi_paise=(p_terms->>'reported_emi_paise')::bigint,card_account_id=(p_terms->>'card_account_id')::uuid where id=result and user_id=owner_id;
  end if;
  insert into public.loan_document_details(loan_id,user_id,source_sha256,details) values(result,owner_id,p_terms->>'source_sha256',p_terms)
  on conflict(loan_id) do update set source_sha256=excluded.source_sha256,details=excluded.details,revision=public.loan_document_details.revision+1,updated_at=now();
  totals:=public.workspace_snapshot()->'summary';
  if exists(select 1 from jsonb_each(totals) e where case when e.key='month' then false else abs((e.value#>>'{}')::numeric)>1000000000000 end) then raise exception 'Financial total exceeds the supported range.' using errcode='22003'; end if;
  perform folio_private.finish_mutation(p_request_id,'save_loan_document',payload,result);
  return result;
end $$;
create function public.save_loan_document(p_loan uuid,p_expected_revision integer,p_terms jsonb,p_request_id uuid) returns uuid
language sql security invoker set search_path='' as $$ select folio_private.save_loan_document(p_loan,p_expected_revision,p_terms,p_request_id) $$;
revoke all on function folio_private.validate_loan_document(jsonb),folio_private.loan_card_guard(),folio_private.save_loan_document(uuid,integer,jsonb,uuid),public.save_loan_document(uuid,integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function folio_private.save_loan_document(uuid,integer,jsonb,uuid),public.save_loan_document(uuid,integer,jsonb,uuid) to authenticated;

create or replace function public.workspace_snapshot() returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); month_start date:=date_trunc('month',folio_private.today())::date; result jsonb;
begin
  with balances as (
    select a.*,a.opening_balance_paise+(select coalesce(sum(t.amount_paise),0) from public.transactions t where t.account_id=a.id and t.user_id=owner_id) as balance_paise
      from public.accounts a where a.user_id=owner_id
  ), loan_state as (
    select l.*,exists(select 1 from public.loan_document_details d where d.loan_id=l.id and d.user_id=owner_id) as has_document,l.principal_paise-(select coalesce(sum(p.principal_paise),0) from public.loan_payments p where p.loan_id=l.id and p.user_id=owner_id) as outstanding_paise
      from public.loans l where l.user_id=owner_id
  )
  select jsonb_build_object(
    'profile',(select to_jsonb(p) from public.profiles p where p.id=owner_id),
    'accounts',coalesce((select jsonb_agg(to_jsonb(b)-'balance_paise'||jsonb_build_object('balance_paise',b.balance_paise::text) order by b.created_at) from balances b),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.kind,c.name) from public.categories c where c.user_id=owner_id),'[]'::jsonb),
    'loans',coalesce((select jsonb_agg(to_jsonb(l)-'outstanding_paise'||jsonb_build_object('outstanding_paise',l.outstanding_paise::text) order by l.created_at) from loan_state l),'[]'::jsonb),
    'subscriptions',coalesce((select jsonb_agg(to_jsonb(s) order by s.next_due_on) from public.subscriptions s where s.user_id=owner_id),'[]'::jsonb),
    'budgets',coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object('spent_paise',(-(select coalesce(sum(t.amount_paise),0) from public.transactions t where t.user_id=owner_id and t.category_id=b.category_id and t.kind='expense' and t.occurred_on>=b.month and t.occurred_on<(b.month+interval '1 month')))::text)) from public.budgets b where b.user_id=owner_id and b.month=month_start),'[]'::jsonb),
    'goals',coalesce((select jsonb_agg(to_jsonb(g)||jsonb_build_object('allocated_paise',(select coalesce(sum(a.amount_paise),0)::text from public.goal_allocations a where a.goal_id=g.id and a.user_id=owner_id))) from public.savings_goals g where g.user_id=owner_id),'[]'::jsonb),
    'allocations',coalesce((select jsonb_agg(to_jsonb(a)) from public.goal_allocations a where a.user_id=owner_id),'[]'::jsonb),
    'summary',jsonb_build_object(
      'month',month_start::text,
      'income_paise',(select coalesce(sum(amount_paise),0)::text from public.transactions where user_id=owner_id and kind='income' and occurred_on>=month_start),
      'expense_paise',(select (-coalesce(sum(amount_paise),0))::text from public.transactions where user_id=owner_id and kind='expense' and occurred_on>=month_start),
      'loan_payments_paise',(select (-coalesce(sum(amount_paise),0))::text from public.transactions where user_id=owner_id and kind='loan_payment' and occurred_on>=month_start),
      'liquid_cash_paise',((select coalesce(sum(balance_paise),0) from balances where type in ('bank','savings','cash') and archived_at is null)-(select coalesce(sum(g.amount_paise),0) from public.goal_allocations g join balances b on b.id=g.account_id where g.user_id=owner_id and b.type in ('bank','savings','cash') and b.archived_at is null))::text,
      'assets_paise',(select coalesce(sum(greatest(balance_paise,0)),0)::text from balances),
      'net_worth_paise',((select coalesce(sum(balance_paise),0) from balances)-(select coalesce(sum(outstanding_paise),0) from loan_state where card_account_id is null))::text,
      'existing_emi_paise',(select coalesce(sum(coalesce(reported_emi_paise,emi_paise)),0)::text from loan_state where status='active' and outstanding_paise>0)
    ),
    'cashflow',(select jsonb_agg(jsonb_build_object('month',m::date::text,
      'income_paise',(select coalesce(sum(t.amount_paise),0)::text from public.transactions t where t.user_id=owner_id and t.kind='income' and t.occurred_on>=m::date and t.occurred_on<(m+interval '1 month')::date),
      'outflow_paise',(select (-coalesce(sum(t.amount_paise),0))::text from public.transactions t where t.user_id=owner_id and t.kind in ('expense','loan_payment') and t.occurred_on>=m::date and t.occurred_on<(m+interval '1 month')::date)
      ) order by m) from generate_series(month_start-interval '5 months',month_start,interval '1 month') m)
  ) into result;
  return result;
end $$;


notify pgrst, 'reload schema';
