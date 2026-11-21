-- Manual statement valuations and tracking-only contribution history. No financial seeds.
create table public.investment_holdings (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 80),
 scheme text not null check(scheme in ('nps_tier_1','nps_tier_2','ppf','epf','other')),
 provider text not null default '' check(length(provider)<=80),
 funding_source text not null check(funding_source in ('self','payroll','mixed')),
 locked_until date,
 account_id uuid,
 archived boolean not null default false,
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(id,user_id), unique(user_id,account_id),
 foreign key(account_id,user_id) references public.accounts(id,user_id)
);
create index investment_holdings_account_idx on public.investment_holdings(account_id,user_id) where account_id is not null;
create table public.investment_entries (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 holding_id uuid not null,
 kind text not null check(kind in ('valuation','self','employer','withdrawal')),
 amount_paise bigint not null check(amount_paise between 0 and 1000000000000 and (kind='valuation' or amount_paise>0)),
 occurred_on date not null,
 note text not null default '' check(length(note)<=160),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(holding_id,user_id) references public.investment_holdings(id,user_id) on delete cascade
);
create index investment_entries_owner_date_idx on public.investment_entries(user_id,holding_id,occurred_on desc,created_at desc,id desc);
create index investment_entries_holding_idx on public.investment_entries(holding_id,user_id);
do $$ declare t text; begin
 foreach t in array array['investment_holdings','investment_entries'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy owner_select on public.%I for select to authenticated using(user_id=(select auth.uid()) and ((select auth.jwt())->>''is_anonymous'') is distinct from ''true'')',t);
 end loop;
end $$;

create function public.investment_portfolio() returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); fy date:=make_date(extract(year from folio_private.today())::int-case when extract(month from folio_private.today())<4 then 1 else 0 end,4,1); result jsonb;
begin
 with latest as (
  select distinct on(holding_id) holding_id,id,amount_paise,occurred_on from public.investment_entries where user_id=owner_id and kind='valuation'
   order by holding_id,occurred_on desc,created_at desc,id desc
 ), totals as (
  select holding_id,
   coalesce(sum(amount_paise) filter(where kind='self'),0) as self_paise,
   coalesce(sum(amount_paise) filter(where kind='employer'),0) as employer_paise,
   coalesce(sum(amount_paise) filter(where kind='withdrawal'),0) as withdrawn_paise,
   coalesce(sum(amount_paise) filter(where kind='self' and occurred_on>=fy),0) as fy_self_paise,
   coalesce(sum(amount_paise) filter(where kind='employer' and occurred_on>=fy),0) as fy_employer_paise
  from public.investment_entries where user_id=owner_id group by holding_id
 ) select coalesce(jsonb_agg(to_jsonb(h)||jsonb_build_object('value_paise',v.amount_paise::text,'valued_on',v.occurred_on,'valuation_id',v.id,
   'self_paise',t.self_paise::text,'employer_paise',t.employer_paise::text,'withdrawn_paise',t.withdrawn_paise::text,
   'fy_self_paise',t.fy_self_paise::text,'fy_employer_paise',t.fy_employer_paise::text,
   'activity_after_valuation',(select count(*) from public.investment_entries e where e.user_id=owner_id and e.holding_id=h.id and e.kind<>'valuation' and e.occurred_on>v.occurred_on)) order by h.created_at,h.id),'[]'::jsonb)
  into result from public.investment_holdings h join latest v on v.holding_id=h.id join totals t on t.holding_id=h.id where h.user_id=owner_id;
 return result;
end $$;
revoke all on function public.investment_portfolio() from public,anon;
grant execute on function public.investment_portfolio() to authenticated;

create function folio_private.investment_account_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.type<>'investment' and exists(select 1 from public.investment_holdings where account_id=new.id and user_id=new.user_id) then
  raise exception 'This account is linked to an investment holding; retain its investment type.';
 end if; return new;
end $$;
revoke all on function folio_private.investment_account_guard() from public,anon,authenticated;
create trigger investment_account_guard before update on public.accounts for each row execute function folio_private.investment_account_guard();

create function folio_private.check_investment_totals() returns void language plpgsql set search_path='' as $$
declare portfolio jsonb:=public.investment_portfolio(); totals jsonb; item jsonb; k text;
begin
 for item in select value from jsonb_array_elements(portfolio) loop
  foreach k in array array['self_paise','employer_paise','withdrawn_paise','fy_self_paise','fy_employer_paise'] loop
   if (item->>k)::numeric>1000000000000 then raise exception 'Investment total exceeds the supported range.' using errcode='22003'; end if;
  end loop;
 end loop;
 foreach k in array array['self_paise','employer_paise','withdrawn_paise','fy_self_paise','fy_employer_paise'] loop
  if (select coalesce(sum((v->>k)::numeric),0) from jsonb_array_elements(portfolio) v)>1000000000000 then raise exception 'Portfolio history total exceeds the supported range.' using errcode='22003'; end if;
 end loop;
 if (select coalesce(sum((v->>'value_paise')::numeric),0) from jsonb_array_elements(portfolio) v)>1000000000000 then raise exception 'Portfolio value exceeds the supported range.' using errcode='22003'; end if;
 totals:=public.workspace_snapshot()->'summary';
 if exists(select 1 from jsonb_each(totals) e where case when e.key='month' then false else abs((e.value#>>'{}')::numeric)>1000000000000 end) then raise exception 'Financial total exceeds the supported range.' using errcode='22003'; end if;
end $$;
revoke all on function folio_private.check_investment_totals() from public,anon,authenticated;

create function folio_private.save_investment_holding(p_holding uuid,p_expected_revision integer,p_terms jsonb,p_initial_value_paise bigint,p_valued_on date,p_request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); result uuid; prior uuid; old public.investment_holdings; link uuid;
 payload jsonb:=jsonb_build_array(p_holding,p_expected_revision,p_terms,p_initial_value_paise,p_valued_on);
begin
 if p_request_id is null then raise exception 'A retry-safe request ID is required.'; end if;
 prior:=folio_private.begin_mutation(p_request_id,'save_investment_holding',payload);if prior is not null then return prior; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':investments',0));
 if jsonb_typeof(p_terms) is distinct from 'object' or octet_length(p_terms::text)>2048 then raise exception 'Invalid holding details.'; end if;
 if (select count(*) from jsonb_object_keys(p_terms))<>7 or not p_terms ?& array['name','scheme','provider','funding_source','locked_until','account_id','archived'] then raise exception 'Unexpected holding fields.'; end if;
 if jsonb_typeof(p_terms->'name') is distinct from 'string' or jsonb_typeof(p_terms->'provider') is distinct from 'string' or jsonb_typeof(p_terms->'scheme') is distinct from 'string' or jsonb_typeof(p_terms->'funding_source') is distinct from 'string' or jsonb_typeof(p_terms->'archived') is distinct from 'boolean' then raise exception 'Invalid holding labels.'; end if;
 if p_terms->'locked_until'<>'null'::jsonb then
  if jsonb_typeof(p_terms->'locked_until') is distinct from 'string' or p_terms->>'locked_until' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Use an ISO lock-in date.'; end if;
  perform (p_terms->>'locked_until')::date;
 end if;
 if p_terms->'account_id'<>'null'::jsonb and jsonb_typeof(p_terms->'account_id') is distinct from 'string' then raise exception 'Invalid account link.'; end if;
 link:=(p_terms->>'account_id')::uuid;
 if p_holding is not null then
  select * into old from public.investment_holdings where id=p_holding and user_id=owner_id for update;
  if not found then raise exception 'Holding unavailable.' using errcode='42501'; end if;
  if old.revision is distinct from p_expected_revision then raise exception 'This holding changed elsewhere. Reopen before saving.' using errcode='40001'; end if;
  if p_initial_value_paise is not null or p_valued_on is not null then raise exception 'Record valuation changes through holding history.'; end if;
 else
  if coalesce(p_expected_revision,0)<>0 or p_initial_value_paise is null or p_initial_value_paise not between 0 and 1000000000000 or p_valued_on is null or p_valued_on>folio_private.today() then raise exception 'Enter an initial statement value and settled valuation date.'; end if;
 end if;
 perform 1 from public.accounts where user_id=owner_id order by id for update;
 if link is not null then
  perform 1 from public.accounts where id=link and user_id=owner_id and type='investment' and (archived_at is null or link is not distinct from old.account_id);
  if not found then raise exception 'Choose an owned investment account.' using errcode='42501'; end if;
 end if;
 if p_holding is null then
  insert into public.investment_holdings(user_id,name,scheme,provider,funding_source,locked_until,account_id,archived)
   values(owner_id,btrim(p_terms->>'name'),p_terms->>'scheme',btrim(p_terms->>'provider'),p_terms->>'funding_source',(p_terms->>'locked_until')::date,link,(p_terms->>'archived')::boolean) returning id into result;
  insert into public.investment_entries(user_id,holding_id,kind,amount_paise,occurred_on,note) values(owner_id,result,'valuation',p_initial_value_paise,p_valued_on,'Initial reported value');
 else
  result:=p_holding;
  update public.investment_holdings set name=btrim(p_terms->>'name'),scheme=p_terms->>'scheme',provider=btrim(p_terms->>'provider'),funding_source=p_terms->>'funding_source',locked_until=(p_terms->>'locked_until')::date,account_id=link,archived=(p_terms->>'archived')::boolean,revision=revision+1,updated_at=clock_timestamp() where id=result and user_id=owner_id;
 end if;
 perform folio_private.check_investment_totals();
 perform folio_private.finish_mutation(p_request_id,'save_investment_holding',payload,result);return result;
end $$;
create function public.save_investment_holding(p_holding uuid,p_expected_revision integer,p_terms jsonb,p_initial_value_paise bigint,p_valued_on date,p_request_id uuid) returns uuid
language sql security invoker set search_path='' as $$ select folio_private.save_investment_holding(p_holding,p_expected_revision,p_terms,p_initial_value_paise,p_valued_on,p_request_id) $$;

create function folio_private.record_investment_entry(p_holding uuid,p_expected_revision integer,p_entry uuid,p_kind text,p_amount_paise bigint,p_occurred_on date,p_note text,p_delete boolean,p_request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); h public.investment_holdings; result uuid; prior uuid;
 payload jsonb:=jsonb_build_array(p_holding,p_expected_revision,p_entry,p_kind,p_amount_paise,p_occurred_on,p_note,p_delete);
begin
 if p_request_id is null or p_delete is null then raise exception 'A request ID and operation are required.'; end if;
 prior:=folio_private.begin_mutation(p_request_id,'record_investment_entry',payload);if prior is not null then return prior; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':investments',0));
 select * into h from public.investment_holdings where id=p_holding and user_id=owner_id for update;
 if not found then raise exception 'Holding unavailable.' using errcode='42501'; end if;
 if h.revision is distinct from p_expected_revision then raise exception 'This holding changed elsewhere. Reopen before saving.' using errcode='40001'; end if;
 if p_entry is not null then
  perform 1 from public.investment_entries where id=p_entry and holding_id=p_holding and user_id=owner_id for update;
  if not found then raise exception 'History entry unavailable.' using errcode='42501'; end if;
 end if;
 if p_delete then
  if p_entry is null then raise exception 'Choose a history entry to remove.'; end if;
  delete from public.investment_entries where id=p_entry and holding_id=p_holding and user_id=owner_id;result:=p_entry;
 else
  if p_kind is null or p_kind not in ('valuation','self','employer','withdrawal') or p_amount_paise is null or p_amount_paise not between 0 and 1000000000000 or (p_kind<>'valuation' and p_amount_paise=0) or p_occurred_on is null or p_occurred_on>folio_private.today() or p_note is null or length(p_note)>160 then raise exception 'Use a valid settled date, bounded amount and history type.'; end if;
  if h.archived then raise exception 'Reopen this holding before adding or editing history.'; end if;
  if p_entry is null then
   insert into public.investment_entries(user_id,holding_id,kind,amount_paise,occurred_on,note) values(owner_id,p_holding,p_kind,p_amount_paise,p_occurred_on,p_note) returning id into result;
  else
   result:=p_entry;update public.investment_entries set kind=p_kind,amount_paise=p_amount_paise,occurred_on=p_occurred_on,note=p_note where id=result and holding_id=p_holding and user_id=owner_id;
  end if;
 end if;
 if not exists(select 1 from public.investment_entries where holding_id=p_holding and user_id=owner_id and kind='valuation') then raise exception 'Retain at least one reported valuation for this holding.'; end if;
 update public.investment_holdings set revision=revision+1,updated_at=clock_timestamp() where id=p_holding and user_id=owner_id;
 perform 1 from public.accounts where user_id=owner_id order by id for update;
 perform folio_private.check_investment_totals();
 perform folio_private.finish_mutation(p_request_id,'record_investment_entry',payload,result);return result;
end $$;
create function public.record_investment_entry(p_holding uuid,p_expected_revision integer,p_entry uuid,p_kind text,p_amount_paise bigint,p_occurred_on date,p_note text,p_delete boolean,p_request_id uuid) returns uuid
language sql security invoker set search_path='' as $$ select folio_private.record_investment_entry(p_holding,p_expected_revision,p_entry,p_kind,p_amount_paise,p_occurred_on,p_note,p_delete,p_request_id) $$;
revoke all on function folio_private.save_investment_holding(uuid,integer,jsonb,bigint,date,uuid),public.save_investment_holding(uuid,integer,jsonb,bigint,date,uuid),folio_private.record_investment_entry(uuid,integer,uuid,text,bigint,date,text,boolean,uuid),public.record_investment_entry(uuid,integer,uuid,text,bigint,date,text,boolean,uuid) from public,anon,authenticated;
grant execute on function folio_private.save_investment_holding(uuid,integer,jsonb,bigint,date,uuid),public.save_investment_holding(uuid,integer,jsonb,bigint,date,uuid),folio_private.record_investment_entry(uuid,integer,uuid,text,bigint,date,text,boolean,uuid),public.record_investment_entry(uuid,integer,uuid,text,bigint,date,text,boolean,uuid) to authenticated;

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
  result:=result||jsonb_build_object('investments',public.investment_portfolio());
  result:=jsonb_set(result,'{summary,assets_paise}',to_jsonb(((result->'summary'->>'assets_paise')::numeric+(select coalesce(sum((v->>'value_paise')::numeric),0) from jsonb_array_elements(result->'investments') v where v->>'account_id' is null))::text));
  result:=jsonb_set(result,'{summary,net_worth_paise}',to_jsonb(((result->'summary'->>'net_worth_paise')::numeric+(select coalesce(sum((v->>'value_paise')::numeric),0) from jsonb_array_elements(result->'investments') v where v->>'account_id' is null))::text));
  return result;
end $$;



notify pgrst, 'reload schema';
