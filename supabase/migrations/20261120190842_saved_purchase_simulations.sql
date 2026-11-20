-- Immutable private comparisons; no ledger references or financial mutations.
create table public.saved_simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  price_paise bigint not null check (price_paise between 1 and 1000000000),
  apr numeric not null check (apr between 0 and 60),
  tenure_months integer not null check (tenure_months between 1 and 120),
  delay_months integer not null check (delay_months in (3,6,12,24)),
  payment_method text not null check (payment_method in ('cash','emi','delay','skip')),
  income_paise bigint not null check (income_paise between 0 and 1000000000000),
  expenses_paise bigint not null check (expenses_paise between 0 and 1000000000000),
  existing_emi_paise bigint not null check (existing_emi_paise between 0 and 1000000000000),
  liquid_cash_paise bigint not null check (liquid_cash_paise between -1000000000000 and 1000000000000),
  reserve_paise bigint not null check (reserve_paise between 0 and 1000000000000),
  calculation_version integer not null default 1 check (calculation_version = 1),
  created_at timestamptz not null default now()
);
create index saved_simulations_owner_created on public.saved_simulations(user_id,created_at desc,id);
alter table public.saved_simulations enable row level security;
revoke all on public.saved_simulations from public,anon,authenticated;
grant select,insert,delete on public.saved_simulations to authenticated;
create policy owner_select on public.saved_simulations for select to authenticated
  using ((select auth.uid()) = user_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
create policy owner_insert on public.saved_simulations for insert to authenticated
  with check ((select auth.uid()) = user_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
create policy owner_delete on public.saved_simulations for delete to authenticated
  using ((select auth.uid()) = user_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
comment on table public.saved_simulations is 'Immutable v1 purchase inputs and financial assumptions. Not a transaction or a loan.';
notify pgrst, 'reload schema';
