-- Folio Phase 2. All financial amounts are integer paise; no real records are seeded.
create schema folio_private;
revoke all on schema folio_private from public, anon;
grant usage on schema folio_private to authenticated;
alter default privileges in schema folio_private revoke execute on functions from public;

create function folio_private.today() returns date language sql stable set search_path = ''
as $$ select (now() at time zone 'Asia/Kolkata')::date $$;
create function folio_private.current_owner() returns uuid language plpgsql stable set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null or coalesce(auth.jwt()->>'is_anonymous','false') = 'true' then
    raise exception 'Sign in with a verified account.' using errcode='42501';
  end if;
  return owner_id;
end $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (length(display_name) <= 80),
  currency text not null default 'INR' check (currency='INR'),
  timezone text not null default 'Asia/Kolkata' check (timezone='Asia/Kolkata'),
  monthly_income_paise bigint not null default 0 check (monthly_income_paise between 0 and 1000000000000),
  monthly_living_budget_paise bigint not null default 0 check (monthly_living_budget_paise between 0 and 1000000000000),
  emergency_reserve_paise bigint not null default 0 check (emergency_reserve_paise between 0 and 1000000000000),
  created_at timestamptz not null default now()
);
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  type text not null check (type in ('bank','savings','credit_card','cash','investment')),
  opening_balance_paise bigint not null default 0 check (opening_balance_paise between -1000000000000 and 1000000000000),
  opening_date date not null default folio_private.today(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique(id,user_id)
);
create index accounts_owner_idx on public.accounts(user_id);
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  kind text not null check (kind in ('income','expense')),
  unique(id,user_id,kind), unique(user_id,kind,name)
);
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null,
  category_id uuid,
  kind text not null check (kind in ('income','expense','transfer','loan_payment')),
  category_kind text generated always as (case when kind in ('income','expense') then kind else null end) stored,
  amount_paise bigint not null check (amount_paise <> 0 and amount_paise between -1000000000000 and 1000000000000),
  occurred_on date not null,
  description text not null default '' check (length(description)<=240),
  transfer_id uuid,
  created_at timestamptz not null default now(),
  unique(id,user_id),
  foreign key(account_id,user_id) references public.accounts(id,user_id) on delete cascade,
  foreign key(category_id,user_id,category_kind) references public.categories(id,user_id,kind),
  check ((kind='income' and amount_paise>0 and category_id is not null and transfer_id is null)
      or (kind='expense' and amount_paise<0 and category_id is not null and transfer_id is null)
      or (kind='transfer' and category_id is null and transfer_id is not null)
      or (kind='loan_payment' and amount_paise<0 and category_id is null and transfer_id is null))
);
create index transactions_owner_date_idx on public.transactions(user_id,occurred_on desc,created_at desc);
create index transactions_account_idx on public.transactions(account_id,user_id);
create index transactions_category_idx on public.transactions(category_id,user_id,category_kind);
create index transactions_transfer_idx on public.transactions(user_id,transfer_id) where transfer_id is not null;
create table public.loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  principal_paise bigint not null check (principal_paise between 1 and 1000000000),
  apr numeric(7,4) not null check (apr between 0 and 60),
  tenure_months integer not null check (tenure_months between 1 and 120),
  start_date date not null default folio_private.today(),
  status text not null default 'active' check (status in ('active','closed')),
  emi_paise bigint generated always as (round(case when apr=0 then principal_paise::numeric/tenure_months
    else principal_paise*(apr/1200)*power(1+apr/1200,tenure_months)/(power(1+apr/1200,tenure_months)-1) end)::bigint) stored,
  created_at timestamptz not null default now(),
  unique(id,user_id)
);
create index loans_owner_idx on public.loans(user_id);
create table public.loan_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  loan_id uuid not null,
  transaction_id uuid not null,
  principal_paise bigint not null check (principal_paise>=0),
  interest_paise bigint not null check (interest_paise>=0),
  paid_on date not null,
  check (principal_paise+interest_paise between 1 and 1000000000000),
  foreign key(loan_id,user_id) references public.loans(id,user_id),
  foreign key(transaction_id,user_id) references public.transactions(id,user_id) on delete cascade,
  unique(transaction_id,user_id)
);
create index loan_payments_owner_idx on public.loan_payments(user_id);
create index loan_payments_loan_idx on public.loan_payments(loan_id,user_id);
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid,
  name text not null check (length(btrim(name)) between 1 and 80),
  amount_paise bigint not null check (amount_paise between 1 and 1000000000000),
  cadence text not null check (cadence in ('monthly','yearly','weekly')),
  next_due_on date not null,
  active boolean not null default true,
  foreign key(account_id,user_id) references public.accounts(id,user_id),
  unique(id,user_id)
);
create index subscriptions_owner_due_idx on public.subscriptions(user_id,next_due_on);
create index subscriptions_account_idx on public.subscriptions(account_id,user_id);
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null,
  category_kind text generated always as ('expense'::text) stored,
  month date not null check (extract(day from month)=1),
  limit_paise bigint not null check (limit_paise between 0 and 1000000000000),
  foreign key(category_id,user_id,category_kind) references public.categories(id,user_id,kind),
  unique(user_id,category_id,month)
);
create index budgets_category_idx on public.budgets(category_id,user_id,category_kind);
create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  target_paise bigint not null check (target_paise between 1 and 1000000000000),
  target_on date,
  unique(id,user_id)
);
create index savings_goals_owner_idx on public.savings_goals(user_id);
create table public.goal_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id uuid not null,
  account_id uuid not null,
  amount_paise bigint not null check (amount_paise between 1 and 1000000000000),
  foreign key(goal_id,user_id) references public.savings_goals(id,user_id) on delete cascade,
  foreign key(account_id,user_id) references public.accounts(id,user_id),
  unique(user_id,goal_id,account_id)
);
create index goal_allocations_goal_idx on public.goal_allocations(goal_id,user_id);
create index goal_allocations_account_idx on public.goal_allocations(account_id,user_id);

-- RLS is enabled before granting API access. Protected ledger rows are SELECT-only.
do $$ declare t text; owner_column text; predicate text; begin
  foreach t in array array['profiles','accounts','categories','transactions','loans','loan_payments','subscriptions','budgets','savings_goals','goal_allocations'] loop
    owner_column := case when t='profiles' then 'id' else 'user_id' end;
    predicate := format('(select auth.uid()) = %I and (select auth.jwt()->>''is_anonymous'') is distinct from ''true''',owner_column);
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy owner_select on public.%I for select to authenticated using (%s)',t,predicate);
    if t not in ('transactions','loan_payments','goal_allocations') then
      execute format('grant insert, update on public.%I to authenticated',t);
      execute format('create policy owner_insert on public.%I for insert to authenticated with check (%s)',t,predicate);
      execute format('create policy owner_update on public.%I for update to authenticated using (%s) with check (%s)',t,predicate,predicate);
      if t in ('categories','subscriptions','budgets','savings_goals') then
        execute format('grant delete on public.%I to authenticated',t);
        execute format('create policy owner_delete on public.%I for delete to authenticated using (%s)',t,predicate);
      end if;
    end if;
  end loop;
end $$;

create function folio_private.validate_record() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_table_name='accounts' then
    if new.opening_date > folio_private.today() then raise exception 'Opening date cannot be in the future.'; end if;
    if exists(select 1 from public.transactions t where t.account_id=new.id and t.user_id=new.user_id and t.occurred_on<new.opening_date) then
      raise exception 'Opening date must precede existing transactions.';
    end if;
  elsif tg_table_name='loans' then
    if new.start_date > folio_private.today() then raise exception 'Loan start date cannot be in the future.'; end if;
    if new.principal_paise < (select coalesce(sum(p.principal_paise),0) from public.loan_payments p where p.loan_id=new.id and p.user_id=new.user_id) then
      raise exception 'Principal cannot be lower than recorded repayments.';
    end if;
  elsif tg_table_name='savings_goals' then
    if new.target_paise < (select coalesce(sum(a.amount_paise),0) from public.goal_allocations a where a.goal_id=new.id and a.user_id=new.user_id) then
      raise exception 'Target cannot be lower than existing allocations.';
    end if;
  end if;
  return new;
end $$;
create trigger accounts_validate before insert or update on public.accounts for each row execute function folio_private.validate_record();
create trigger loans_validate before insert or update on public.loans for each row execute function folio_private.validate_record();
create trigger goals_validate before insert or update on public.savings_goals for each row execute function folio_private.validate_record();

create function public.initialize_workspace() returns void language plpgsql security invoker set search_path='' as $$
declare owner_id uuid := folio_private.current_owner();
begin
  insert into public.profiles(id) values(owner_id) on conflict(id) do nothing;
  insert into public.categories(user_id,kind,name) values
    (owner_id,'income','Salary'),(owner_id,'income','Other income'),
    (owner_id,'expense','Home & utilities'),(owner_id,'expense','Food & groceries'),
    (owner_id,'expense','Shopping'),(owner_id,'expense','Travel'),(owner_id,'expense','Subscriptions'),(owner_id,'expense','Other expense')
    on conflict(user_id,kind,name) do nothing;
end $$;

create function folio_private.check_account(account uuid, owner_id uuid, day date) returns void
language plpgsql set search_path='' as $$
begin
  if day is null or day > folio_private.today() then raise exception 'Use a valid settled date, not a future date.'; end if;
  perform 1 from public.accounts a where a.id=account and a.user_id=owner_id and a.archived_at is null and a.opening_date<=day for update;
  if not found then raise exception 'Account unavailable or date precedes its opening.' using errcode='42501'; end if;
end $$;

-- Privileged functions live in an unexposed schema. Each checks auth.uid() and all referenced ownership.
create function folio_private.record_entry(p_account uuid,p_category uuid,p_kind text,p_amount_paise bigint,p_occurred_on date,p_description text,p_entry uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); entry_id uuid; previous public.transactions;
begin
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
  return entry_id;
end $$;
create function public.record_entry(p_account uuid,p_category uuid,p_kind text,p_amount_paise bigint,p_occurred_on date,p_description text,p_entry uuid default null)
returns uuid language sql security invoker set search_path='' as $$ select folio_private.record_entry(p_account,p_category,p_kind,p_amount_paise,p_occurred_on,p_description,p_entry) $$;

create function folio_private.record_transfer(p_from uuid,p_to uuid,p_amount_paise bigint,p_occurred_on date,p_description text) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); group_id uuid:=gen_random_uuid(); account uuid;
begin
  if p_from is null or p_to is null or p_from=p_to or p_amount_paise is null or p_amount_paise not between 1 and 1000000000000 then raise exception 'Choose two different accounts and a positive amount.'; end if;
  for account in select unnest(array[p_from,p_to]) order by 1 loop perform folio_private.check_account(account,owner_id,p_occurred_on); end loop;
  insert into public.transactions(user_id,account_id,kind,amount_paise,occurred_on,description,transfer_id) values
    (owner_id,p_from,'transfer',-p_amount_paise,p_occurred_on,coalesce(p_description,''),group_id),
    (owner_id,p_to,'transfer',p_amount_paise,p_occurred_on,coalesce(p_description,''),group_id);
  return group_id;
end $$;
create function public.record_transfer(p_from uuid,p_to uuid,p_amount_paise bigint,p_occurred_on date,p_description text) returns uuid
language sql security invoker set search_path='' as $$ select folio_private.record_transfer(p_from,p_to,p_amount_paise,p_occurred_on,p_description) $$;

create function folio_private.record_loan_payment(p_loan uuid,p_account uuid,p_principal_paise bigint,p_interest_paise bigint,p_occurred_on date,p_description text)
returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); loan public.loans; remaining numeric; entry_id uuid;
begin
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
  return entry_id;
end $$;
create function public.record_loan_payment(p_loan uuid,p_account uuid,p_principal_paise bigint,p_interest_paise bigint,p_occurred_on date,p_description text)
returns uuid language sql security invoker set search_path='' as $$ select folio_private.record_loan_payment(p_loan,p_account,p_principal_paise,p_interest_paise,p_occurred_on,p_description) $$;

create function folio_private.set_goal_allocation(p_goal uuid,p_account uuid,p_amount_paise bigint) returns void
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); goal public.savings_goals; balance numeric; reserved numeric; toward_goal numeric;
begin
  if p_amount_paise is null or p_amount_paise not between 0 and 1000000000000 then raise exception 'Invalid allocation.'; end if;
  select * into goal from public.savings_goals where id=p_goal and user_id=owner_id for update;
  if not found then raise exception 'Goal unavailable.' using errcode='42501'; end if;
  if p_amount_paise=0 then
    perform 1 from public.accounts where id=p_account and user_id=owner_id for update;
    if not found then raise exception 'Account unavailable.' using errcode='42501'; end if;
    delete from public.goal_allocations where user_id=owner_id and goal_id=p_goal and account_id=p_account;
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
end $$;
create function public.set_goal_allocation(p_goal uuid,p_account uuid,p_amount_paise bigint) returns void
language sql security invoker set search_path='' as $$ select folio_private.set_goal_allocation(p_goal,p_account,p_amount_paise) $$;

create function folio_private.delete_entry(p_entry uuid) returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); entry public.transactions; loan uuid; account uuid;
begin
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
end $$;
create function public.delete_entry(p_entry uuid) returns void language sql security invoker set search_path='' as $$ select folio_private.delete_entry(p_entry) $$;

create function public.workspace_snapshot() returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); month_start date:=date_trunc('month',folio_private.today())::date; result jsonb;
begin
  with balances as (
    select a.*,a.opening_balance_paise+(select coalesce(sum(t.amount_paise),0) from public.transactions t where t.account_id=a.id and t.user_id=owner_id) as balance_paise
      from public.accounts a where a.user_id=owner_id
  ), loan_state as (
    select l.*,l.principal_paise-(select coalesce(sum(p.principal_paise),0) from public.loan_payments p where p.loan_id=l.id and p.user_id=owner_id) as outstanding_paise
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
      'net_worth_paise',((select coalesce(sum(balance_paise),0) from balances)-(select coalesce(sum(outstanding_paise),0) from loan_state))::text,
      'existing_emi_paise',(select coalesce(sum(emi_paise),0)::text from loan_state where status='active' and outstanding_paise>0)
    ),
    'cashflow',(select jsonb_agg(jsonb_build_object('month',m::date::text,
      'income_paise',(select coalesce(sum(t.amount_paise),0)::text from public.transactions t where t.user_id=owner_id and t.kind='income' and t.occurred_on>=m::date and t.occurred_on<(m+interval '1 month')::date),
      'outflow_paise',(select (-coalesce(sum(t.amount_paise),0))::text from public.transactions t where t.user_id=owner_id and t.kind in ('expense','loan_payment') and t.occurred_on>=m::date and t.occurred_on<(m+interval '1 month')::date)
      ) order by m) from generate_series(month_start-interval '5 months',month_start,interval '1 month') m)
  ) into result;
  return result;
end $$;

-- Explicit function ACLs: only authenticated callers can initialize or invoke financial RPCs.
do $$ declare fn record; begin
  for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='folio_private' loop
    execute format('revoke all on function %s from public, anon, authenticated',fn.signature);
    execute format('grant execute on function %s to authenticated',fn.signature);
  end loop;
  for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('initialize_workspace','record_entry','record_transfer','record_loan_payment','set_goal_allocation','delete_entry','workspace_snapshot') loop
    execute format('revoke all on function %s from public, anon',fn.signature);
    execute format('grant execute on function %s to authenticated',fn.signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
