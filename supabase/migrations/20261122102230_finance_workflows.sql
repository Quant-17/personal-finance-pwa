-- Owner-requested finance workflows. No personal data or financial history is seeded.
create table public.audit_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 table_name text not null, entity_id uuid not null, action text not null check(action in ('INSERT','UPDATE','DELETE','RESTORE')),
 before_data jsonb, after_data jsonb, occurred_at timestamptz not null default clock_timestamp(),
 provenance text not null default 'live' check(provenance in ('live','archive')), reason text not null default '' check(length(reason)<=240)
);
create index audit_events_owner_date_idx on public.audit_events(user_id,occurred_at desc,id);
create index audit_events_entity_idx on public.audit_events(user_id,table_name,entity_id);
alter table public.audit_events enable row level security;
revoke all on public.audit_events from public,anon,authenticated;
grant select on public.audit_events to authenticated;
create policy audit_owner on public.audit_events for select to authenticated using(user_id=(select folio_private.current_owner()));
create function folio_private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare previous jsonb; following jsonb; record jsonb; owner_id uuid; entity uuid;
begin
 if current_setting('folio.restoring',true)='yes' then return null;end if;
 if tg_op<>'INSERT' then previous:=to_jsonb(old);end if;
 if tg_op<>'DELETE' then following:=to_jsonb(new);end if;
 if previous is not distinct from following then return null;end if;
 record:=coalesce(following,previous);owner_id:=coalesce(record->>'user_id',record->>'id')::uuid;
 -- During an Auth cascade the parent no longer exists. Deletion must not recreate child history.
 if not exists(select 1 from auth.users where id=owner_id) then return null;end if;
 entity:=coalesce(record->>'id',record->>'loan_id',record->>'user_id')::uuid;
 insert into public.audit_events(user_id,table_name,entity_id,action,before_data,after_data,reason)
 values(owner_id,tg_table_name,entity,tg_op,previous,following,left(coalesce(current_setting('folio.audit_reason',true),''),240));
 return null;
end $$;

create table public.account_reconciliations (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 account_id uuid not null,month date not null check(extract(day from month)=1),
 statement_opening_paise bigint not null check(abs(statement_opening_paise)<=1000000000000),
 statement_closing_paise bigint not null check(abs(statement_closing_paise)<=1000000000000),
 ledger_hash text not null,reviewed_at timestamptz not null default now(),
 foreign key(account_id,user_id) references public.accounts(id,user_id) on delete cascade,
 unique(user_id,account_id,month)
);
create index account_reconciliations_account_owner_idx on public.account_reconciliations(account_id,user_id);
create table public.month_reviews (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 month date not null check(extract(day from month)=1),report_hash text not null,report jsonb not null,reviewed_at timestamptz not null default now(),unique(user_id,month)
);
-- Read-only metadata; confirmed mutations go through owner-checked functions.
do $$declare t text;begin
 foreach t in array array['account_reconciliations','month_reviews'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy owner_read on public.%I for select to authenticated using(user_id=(select folio_private.current_owner()))',t);
 end loop;
end$$;
create function folio_private.valid_month(p_month date) returns void language plpgsql stable set search_path='' as $$begin
 if p_month is null or extract(day from p_month)<>1 or p_month<date '1900-01-01' or p_month>folio_private.today() then raise exception 'Choose a valid current or past month.';end if;
end$$;
create function public.account_statement_report(p_account uuid,p_month date) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); a public.accounts; opening numeric; closing numeric; credits numeric; debits numeric; fingerprint text; saved public.account_reconciliations; finish date:= (p_month+interval '1 month')::date; row_count integer;
begin
 perform folio_private.valid_month(p_month);
 select * into a from public.accounts where id=p_account and user_id=owner_id;
 if not found then raise exception 'Account unavailable.' using errcode='42501';end if;
 select a.opening_balance_paise+coalesce(sum(amount_paise)filter(where occurred_on<p_month),0),
  a.opening_balance_paise+coalesce(sum(amount_paise),0),coalesce(sum(amount_paise)filter(where occurred_on>=p_month and amount_paise>0),0),
  coalesce(-sum(amount_paise)filter(where occurred_on>=p_month and amount_paise<0),0),count(*)filter(where occurred_on>=p_month)
 into opening,closing,credits,debits,row_count from public.transactions where user_id=owner_id and account_id=p_account and occurred_on<finish;
 if greatest(abs(opening),abs(closing),credits,debits)>1000000000000 then raise exception 'Account period totals exceed the supported range.' using errcode='22003';end if;
 select encode(sha256(convert_to(jsonb_build_array(a.opening_date,a.opening_balance_paise,
  coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.transactions t where t.user_id=owner_id and t.account_id=p_account and t.occurred_on<finish),'[]'))::text,'UTF8')),'hex') into fingerprint;
 select * into saved from public.account_reconciliations where user_id=owner_id and account_id=p_account and month=p_month;
 return jsonb_build_object('account_id',p_account,'month',p_month,'baseline_covers_month',a.opening_date<=p_month,'complete_month',finish<=folio_private.today(),
 'opening_paise',opening::text,'closing_paise',closing::text,'credits_paise',credits::text,'debits_paise',debits::text,'row_count',row_count,'ledger_hash',fingerprint,
 'review',case when saved.id is null then null else to_jsonb(saved)||jsonb_build_object('current',saved.ledger_hash=fingerprint)end);
end$$;
create function folio_private.reconcile_account(p_account uuid,p_month date,p_opening bigint,p_closing bigint,p_expected_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); report jsonb; result uuid;
begin
 perform 1 from public.accounts where id=p_account and user_id=owner_id for update;
 report:=public.account_statement_report(p_account,p_month);
 if p_opening is null or p_closing is null or greatest(abs(p_opening::numeric),abs(p_closing::numeric))>1000000000000 then raise exception 'Enter bounded signed statement balances.';end if;
 if not(report->>'baseline_covers_month')::boolean then raise exception 'Reconcile the opening-date/balance baseline first; it has not been backdated.';end if;
 if not(report->>'complete_month')::boolean then raise exception 'Review a completed statement month.';end if;
 if p_expected_hash is distinct from report->>'ledger_hash' then raise exception 'Ledger changed. Reload and compare the statement again.';end if;
 if p_opening<>(report->>'opening_paise')::bigint or p_closing<>(report->>'closing_paise')::bigint then raise exception 'Statement and ledger balances differ. Resolve missing/duplicate entries first.';end if;
 perform set_config('folio.audit_reason','Owner compared opening, closing and period activity with the statement.',true);
 insert into public.account_reconciliations(user_id,account_id,month,statement_opening_paise,statement_closing_paise,ledger_hash)
 values(owner_id,p_account,p_month,p_opening,p_closing,p_expected_hash) on conflict(user_id,account_id,month) do update set statement_opening_paise=excluded.statement_opening_paise,statement_closing_paise=excluded.statement_closing_paise,ledger_hash=excluded.ledger_hash,reviewed_at=now() returning id into result;
 return result;
end$$;
create function public.reconcile_account(p_account uuid,p_month date,p_opening bigint,p_closing bigint,p_expected_hash text) returns uuid
language sql security invoker set search_path='' as $$select folio_private.reconcile_account(p_account,p_month,p_opening,p_closing,p_expected_hash)$$;
create function public.monthly_review_report(p_month date) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); finish date:=(p_month+interval '1 month')::date; result jsonb; hash text; saved public.month_reviews;
begin
 perform folio_private.valid_month(p_month);
 select jsonb_build_object('month',p_month,'complete_month',finish<=folio_private.today(),
 'income_paise',coalesce(sum(amount_paise)filter(where kind='income'),0)::text,
 'expenses_paise',coalesce(-sum(amount_paise)filter(where kind='expense'),0)::text,
 'loan_cash_paise',coalesce(-sum(amount_paise)filter(where kind='loan_payment'),0)::text,
 'principal_paise',coalesce((select sum(principal_paise)from public.loan_payments where user_id=owner_id and paid_on>=p_month and paid_on<finish),0)::text,
 'interest_paise',coalesce((select sum(interest_paise)from public.loan_payments where user_id=owner_id and paid_on>=p_month and paid_on<finish),0)::text,
 'self_invested_paise',coalesce((select sum(amount_paise)from public.investment_entries where user_id=owner_id and kind='self' and occurred_on>=p_month and occurred_on<finish),0)::text,
 'employer_invested_paise',coalesce((select sum(amount_paise)from public.investment_entries where user_id=owner_id and kind='employer' and occurred_on>=p_month and occurred_on<finish),0)::text,
 'withdrawn_paise',coalesce((select sum(amount_paise)from public.investment_entries where user_id=owner_id and kind='withdrawal' and occurred_on>=p_month and occurred_on<finish),0)::text,
 'subscription_paid_paise',coalesce(-sum(amount_paise)filter(where subscription_id is not null),0)::text,
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'spent_paise',coalesce((select -sum(t.amount_paise)from public.transactions t where t.user_id=owner_id and t.kind='expense' and t.category_id=c.id and t.occurred_on>=p_month and t.occurred_on<finish),0)::text,'budget_paise',(select b.limit_paise::text from public.budgets b where b.user_id=owner_id and b.category_id=c.id and b.month=p_month))order by c.name)from public.categories c where c.user_id=owner_id and c.kind='expense'),'[]'),
 'accounts',coalesce((select jsonb_agg(public.account_statement_report(a.id,p_month)order by a.id)from public.accounts a where a.user_id=owner_id and a.type in('bank','savings','credit_card','cash')and a.opening_date<finish and (a.archived_at is null or exists(select 1 from public.transactions t where t.user_id=owner_id and t.account_id=a.id and t.occurred_on>=p_month and t.occurred_on<finish))),'[]'))
 into result from public.transactions where user_id=owner_id and occurred_on>=p_month and occurred_on<finish;
 -- Include row detail, budgets and dated investment activity so offsetting edits also invalidate a review.
 select encode(sha256(convert_to(jsonb_build_array(result,
 (select coalesce(jsonb_agg(to_jsonb(t)order by id),'[]')from public.transactions t where user_id=owner_id and occurred_on>=p_month and occurred_on<finish),
 (select coalesce(jsonb_agg(to_jsonb(lp)order by id),'[]')from public.loan_payments lp where user_id=owner_id and paid_on>=p_month and paid_on<finish),
 (select coalesce(jsonb_agg(to_jsonb(e)order by id),'[]')from public.investment_entries e where user_id=owner_id and occurred_on>=p_month and occurred_on<finish))::text,'UTF8')),'hex')into hash;
 select * into saved from public.month_reviews where user_id=owner_id and month=p_month;
 return result||jsonb_build_object('report_hash',hash,'review',case when saved.id is null then null else jsonb_build_object('reviewed_at',saved.reviewed_at,'current',saved.report_hash=hash,'saved_report',saved.report)end);
end$$;
create function folio_private.review_month(p_month date,p_expected_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); report jsonb; result uuid;
begin
 -- Prevent simultaneous new entries while taking the reviewed snapshot.
 perform 1 from public.loans where user_id=owner_id order by id for update;
 perform 1 from public.accounts where user_id=owner_id order by id for update;
 report:=public.monthly_review_report(p_month);
 if not(report->>'complete_month')::boolean then raise exception 'Choose a completed month.';end if;
 if p_expected_hash is distinct from report->>'report_hash' then raise exception 'Report changed. Reload before marking reviewed.';end if;
 if exists(select 1 from jsonb_array_elements(report->'accounts')a where not(a->>'baseline_covers_month')::boolean or a->'review' is null or a->'review'='null'::jsonb or not coalesce((a->'review'->>'current')::boolean,false)) then raise exception 'Reconcile every listed account before marking the month reviewed.';end if;
 insert into public.month_reviews(user_id,month,report_hash,report) values(owner_id,p_month,p_expected_hash,report-'review')on conflict(user_id,month)do update set report_hash=excluded.report_hash,report=excluded.report,reviewed_at=now()returning id into result;
 return result;
end$$;
create function public.review_month(p_month date,p_expected_hash text)returns uuid language sql security invoker set search_path='' as $$select folio_private.review_month(p_month,p_expected_hash)$$;

create table folio_private.transfer_sources (
 user_id uuid not null references auth.users(id)on delete cascade,account_id uuid not null,
 source_sha256 text not null check(source_sha256~'^[a-f0-9]{64}$'),source_row text not null check(source_row~'^[0-9]{1,2}:[0-9]{1,6}$'),transfer_id uuid not null,
 primary key(user_id,account_id,source_sha256,source_row),foreign key(account_id,user_id)references public.accounts(id,user_id)on delete cascade
);
create index transfer_sources_account_owner_idx on folio_private.transfer_sources(account_id,user_id);
alter table folio_private.transfer_sources enable row level security;
revoke all on folio_private.transfer_sources from public,anon,authenticated;
create function folio_private.transfer_spec(p_spec jsonb)returns jsonb language plpgsql set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); side text; source jsonb; account uuid;
begin
 if jsonb_typeof(p_spec)is distinct from'object' or (select count(*)from jsonb_object_keys(p_spec))<>9 or not p_spec ?&array['from_account','to_account','amount_paise','debit_on','credit_on','description','debit_source','credit_source','existing_transfer'] then raise exception 'Review the transfer fields.';end if;
 if jsonb_typeof(p_spec->'amount_paise')is distinct from'number' or coalesce(p_spec->>'amount_paise','')!~'^[0-9]{1,13}$' or (p_spec->>'amount_paise')::numeric not between 1 and 1000000000000 then raise exception 'Enter bounded integer paise.';end if;
 if jsonb_typeof(p_spec->'description')is distinct from'string' or length(btrim(p_spec->>'description'))not between 1 and 240 then raise exception 'Enter a reviewed transfer description.';end if;
 if p_spec->>'from_account'=p_spec->>'to_account' then raise exception 'Choose two different owned accounts.';end if;
 for account in select v::uuid from unnest(array[p_spec->>'from_account',p_spec->>'to_account'])v order by 1 loop
  perform 1 from public.accounts where id=account and user_id=owner_id and archived_at is null for update;
  if not found then raise exception 'Owned active account unavailable.' using errcode='42501';end if;
 end loop;
 foreach side in array array['debit','credit'] loop
  if coalesce(p_spec->>(side||'_on'),'')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Review both settled dates.';end if;
  perform folio_private.check_account((p_spec->>case when side='debit'then'from_account'else'to_account'end)::uuid,owner_id,(p_spec->>(side||'_on'))::date);
  source:=p_spec->(side||'_source');
  if jsonb_typeof(source)is distinct from'object' or(select count(*)from jsonb_object_keys(source))<>2 or not source ?&array['sha','row']or coalesce(source->>'sha','')!~'^[a-f0-9]{64}$'or coalesce(source->>'row','')!~'^[0-9]{1,2}:[0-9]{1,6}$'then raise exception 'Review both source rows.';end if;
 end loop;
 if abs((p_spec->>'debit_on')::date-(p_spec->>'credit_on')::date)>3 then raise exception 'Settled dates differ by more than three days. Reconcile manually.';end if;
 return p_spec;
end$$;
create function folio_private.preview_transfer_match(p_spec jsonb)returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); spec jsonb; linked uuid[]; matches jsonb; side text; account uuid; source jsonb;
begin
 spec:=folio_private.transfer_spec(p_spec);
 foreach side in array array['debit','credit'] loop
  account:=(spec->>case when side='debit'then'from_account'else'to_account'end)::uuid;source:=spec->(side||'_source');
  if exists(select 1 from folio_private.statement_rows where user_id=owner_id and account_id=account and source_sha256=source->>'sha'and source_row=source->>'row')
  and not exists(select 1 from folio_private.transfer_sources where user_id=owner_id and account_id=account and source_sha256=source->>'sha'and source_row=source->>'row') then raise exception 'A source row was already imported through a different workflow. Reconcile it first.';end if;
 end loop;
 select array_agg(distinct transfer_id)into linked from folio_private.transfer_sources where user_id=owner_id and(
 (account_id=(spec->>'from_account')::uuid and source_sha256=spec->'debit_source'->>'sha'and source_row=spec->'debit_source'->>'row')or
 (account_id=(spec->>'to_account')::uuid and source_sha256=spec->'credit_source'->>'sha'and source_row=spec->'credit_source'->>'row'));
 select coalesce(jsonb_agg(d.transfer_id order by d.transfer_id),'[]')into matches from public.transactions d join public.transactions c on c.user_id=d.user_id and c.transfer_id=d.transfer_id and c.id<>d.id
 where d.user_id=owner_id and d.kind='transfer'and c.kind='transfer'and d.account_id=(spec->>'from_account')::uuid and c.account_id=(spec->>'to_account')::uuid
 and d.amount_paise=-(spec->>'amount_paise')::bigint and c.amount_paise=(spec->>'amount_paise')::bigint and d.occurred_on=(spec->>'debit_on')::date and c.occurred_on=(spec->>'credit_on')::date;
 if linked is not null and(array_length(linked,1)<>1 or not matches ? linked[1]::text)then raise exception 'Source markers refer to a changed/deleted transfer. Review its history; no repost was made.';end if;
 return jsonb_build_object('matches',matches,'already_linked',linked is not null);
end$$;
create function public.preview_transfer_match(p_spec jsonb)returns jsonb language sql security invoker set search_path='' as $$select folio_private.preview_transfer_match(p_spec)$$;
create function folio_private.confirm_transfer_match(p_spec jsonb,p_request_id uuid)returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); spec jsonb; preview jsonb; result uuid; prior uuid; side text; account uuid; source jsonb; totals jsonb;
begin
 if p_request_id is null then raise exception 'Request ID required.';end if;
 prior:=folio_private.begin_mutation(p_request_id,'statement_transfer',p_spec);if prior is not null then return prior;end if;
 spec:=folio_private.transfer_spec(p_spec);preview:=folio_private.preview_transfer_match(spec);
 if spec->>'existing_transfer'is not null then
  result:=(spec->>'existing_transfer')::uuid;
  if not(preview->'matches' ? result::text)then raise exception 'The selected existing transfer does not match both statement legs.';end if;
 else
  if jsonb_array_length(preview->'matches')>0 then raise exception 'An existing transfer matches. Link it instead of posting again.';end if;
  result:=gen_random_uuid();
  insert into public.transactions(user_id,account_id,kind,amount_paise,occurred_on,description,transfer_id)values
   (owner_id,(spec->>'from_account')::uuid,'transfer',-(spec->>'amount_paise')::bigint,(spec->>'debit_on')::date,btrim(spec->>'description'),result),
   (owner_id,(spec->>'to_account')::uuid,'transfer',(spec->>'amount_paise')::bigint,(spec->>'credit_on')::date,btrim(spec->>'description'),result);
 end if;
 foreach side in array array['debit','credit']loop
  account:=(spec->>case when side='debit'then'from_account'else'to_account'end)::uuid;source:=spec->(side||'_source');
  insert into folio_private.statement_rows(user_id,account_id,source_sha256,source_row)values(owner_id,account,source->>'sha',source->>'row')on conflict do nothing;
  insert into folio_private.transfer_sources values(owner_id,account,source->>'sha',source->>'row',result)on conflict do nothing;
 end loop;
 totals:=public.workspace_snapshot();
 if exists(select 1 from jsonb_array_elements(totals->'accounts')a where abs((a->>'balance_paise')::numeric)>1000000000000)then raise exception 'Transfer exceeds supported account totals.'using errcode='22003';end if;
 perform folio_private.finish_mutation(p_request_id,'statement_transfer',spec,result);return result;
end$$;
create function public.confirm_transfer_match(p_spec jsonb,p_request_id uuid)returns uuid language sql security invoker set search_path='' as $$select folio_private.confirm_transfer_match(p_spec,p_request_id)$$;

create table public.planning_settings (
 user_id uuid primary key references auth.users(id)on delete cascade,
 salary_day integer check(salary_day between 1 and 31),salary_account_id uuid,spending_account_id uuid,loan_funding jsonb not null default '{}',
 foreign key(salary_account_id,user_id)references public.accounts(id,user_id),foreign key(spending_account_id,user_id)references public.accounts(id,user_id)
);
create index planning_salary_owner_idx on public.planning_settings(salary_account_id,user_id);
create index planning_spending_owner_idx on public.planning_settings(spending_account_id,user_id);
create table public.planned_cash_events (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid()references auth.users(id)on delete cascade,
 name text not null check(length(btrim(name))between 1 and 80),kind text not null check(kind in('income','expense','transfer')),
 account_id uuid not null,to_account_id uuid,amount_paise bigint not null check(amount_paise between 1 and 1000000000000),
 due_on date not null,cadence text not null check(cadence in('once','monthly','yearly')),within_budget boolean not null default true,active boolean not null default true,
 foreign key(account_id,user_id)references public.accounts(id,user_id),foreign key(to_account_id,user_id)references public.accounts(id,user_id),
 check((kind='transfer'and to_account_id is not null and to_account_id<>account_id)or(kind<>'transfer'and to_account_id is null))
);
create index planned_events_owner_date_idx on public.planned_cash_events(user_id,due_on);
create index planned_events_account_owner_idx on public.planned_cash_events(account_id,user_id);
create index planned_events_to_owner_idx on public.planned_cash_events(to_account_id,user_id);
create table public.debt_terms (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid()references auth.users(id)on delete cascade,
 loan_id uuid,account_id uuid,prepayment_percent numeric not null default 0 check(prepayment_percent between 0 and 120),
 closure_fee_paise bigint not null default 0 check(closure_fee_paise between 0 and 1000000000000),tax_percent numeric not null default 0 check(tax_percent between 0 and 30),
 promo_apr numeric check(promo_apr between 0 and 120),promo_until date,
 check((loan_id is null)<>(account_id is null)),check((promo_apr is null)=(promo_until is null)),
 foreign key(loan_id,user_id)references public.loans(id,user_id)on delete cascade,foreign key(account_id,user_id)references public.accounts(id,user_id)on delete cascade,
 unique(user_id,loan_id),unique(user_id,account_id)
);
create index debt_terms_loan_owner_idx on public.debt_terms(loan_id,user_id);
create index debt_terms_account_owner_idx on public.debt_terms(account_id,user_id);
do $$declare t text;begin
 foreach t in array array['planning_settings','planned_cash_events','debt_terms']loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy owner_read on public.%I for select to authenticated using(user_id=(select folio_private.current_owner()))',t);
 end loop;
end$$;
create function folio_private.save_planning(p_settings jsonb)returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); account uuid; item record;
begin
 if jsonb_typeof(p_settings)is distinct from'object'or(select count(*)from jsonb_object_keys(p_settings))<>4 or not p_settings ?&array['salary_day','salary_account_id','spending_account_id','loan_funding']then raise exception 'Review the forecast settings.';end if;
 if jsonb_typeof(p_settings->'loan_funding')is distinct from'object'or(select count(*)from jsonb_object_keys(p_settings->'loan_funding'))>100 then raise exception 'Review funding accounts.';end if;
 for account in select unnest(array[(p_settings->>'salary_account_id')::uuid,(p_settings->>'spending_account_id')::uuid])loop
  if account is not null and not exists(select 1 from public.accounts where id=account and user_id=owner_id and archived_at is null and type in('bank','savings','cash'))then raise exception 'Choose an active owned cash/bank account.'using errcode='42501';end if;
 end loop;
 for item in select * from jsonb_each_text(p_settings->'loan_funding')loop
  if not exists(select 1 from public.loans where id=item.key::uuid and user_id=owner_id and card_account_id is null)or not exists(select 1 from public.accounts where id=item.value::uuid and user_id=owner_id and archived_at is null and type in('bank','savings','cash'))then raise exception 'Loan funding must use owned loans and cash accounts.'using errcode='42501';end if;
 end loop;
 insert into public.planning_settings(user_id,salary_day,salary_account_id,spending_account_id,loan_funding)values(owner_id,(p_settings->>'salary_day')::integer,(p_settings->>'salary_account_id')::uuid,(p_settings->>'spending_account_id')::uuid,p_settings->'loan_funding')on conflict(user_id)do update set salary_day=excluded.salary_day,salary_account_id=excluded.salary_account_id,spending_account_id=excluded.spending_account_id,loan_funding=excluded.loan_funding;
end$$;
create function public.save_planning(p_settings jsonb)returns void language sql security invoker set search_path='' as $$select folio_private.save_planning(p_settings)$$;
create function folio_private.save_planned_event(p_id uuid,p_event jsonb,p_delete boolean)returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); result uuid; account uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':planned-events',0));
 if p_id is null and not p_delete and(select count(*)from public.planned_cash_events where user_id=owner_id)>=100 then raise exception 'Use at most 100 planned events.';end if;
 if not p_delete and not exists(select 1 from public.accounts where id=(p_event->>'account_id')::uuid and user_id=owner_id and archived_at is null and type in('bank','savings','cash'))then raise exception 'Choose an owned cash account.'using errcode='42501';end if;
 if p_id is not null and not exists(select 1 from public.planned_cash_events where id=p_id and user_id=owner_id)then raise exception 'Planned event unavailable.'using errcode='42501';end if;
 if p_delete then delete from public.planned_cash_events where id=p_id and user_id=owner_id;return p_id;end if;
 if jsonb_typeof(p_event)is distinct from'object'or(select count(*)from jsonb_object_keys(p_event))<>9 or not p_event ?&array['name','kind','account_id','to_account_id','amount_paise','due_on','cadence','within_budget','active']then raise exception 'Review the planned event.';end if;
 if p_event->>'due_on'!~'^\d{4}-\d{2}-\d{2}$'or(p_event->>'due_on')::date<date '1900-01-01'then raise exception 'Review the planned date.';end if;
 if jsonb_typeof(p_event->'amount_paise')is distinct from'number'or p_event->>'amount_paise'!~'^[0-9]{1,13}$'then raise exception 'Use integer paise.';end if;
 for account in select unnest(array[(p_event->>'account_id')::uuid,(p_event->>'to_account_id')::uuid])loop
  if account is not null and not exists(select 1 from public.accounts where id=account and user_id=owner_id and archived_at is null)then raise exception 'Owned active account required.'using errcode='42501';end if;
 end loop;
 insert into public.planned_cash_events(id,user_id,name,kind,account_id,to_account_id,amount_paise,due_on,cadence,within_budget,active)
 values(coalesce(p_id,gen_random_uuid()),owner_id,p_event->>'name',p_event->>'kind',(p_event->>'account_id')::uuid,(p_event->>'to_account_id')::uuid,(p_event->>'amount_paise')::bigint,(p_event->>'due_on')::date,p_event->>'cadence',(p_event->>'within_budget')::boolean,(p_event->>'active')::boolean)
 on conflict(id)do update set name=excluded.name,kind=excluded.kind,account_id=excluded.account_id,to_account_id=excluded.to_account_id,amount_paise=excluded.amount_paise,due_on=excluded.due_on,cadence=excluded.cadence,within_budget=excluded.within_budget,active=excluded.active returning id into result;
 return result;
end$$;
create function public.save_planned_event(p_id uuid,p_event jsonb,p_delete boolean default false)returns uuid language sql security invoker set search_path='' as $$select folio_private.save_planned_event(p_id,p_event,p_delete)$$;
create function folio_private.save_debt_terms(p_loan uuid,p_account uuid,p_terms jsonb)returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner();result uuid;
begin
 if (p_loan is null)=(p_account is null)then raise exception 'Choose one debt source.';end if;
 if p_loan is not null and not exists(select 1 from public.loans where id=p_loan and user_id=owner_id)or p_account is not null and not exists(select 1 from public.accounts where id=p_account and user_id=owner_id)then raise exception 'Owned debt source unavailable.'using errcode='42501';end if;
 if jsonb_typeof(p_terms)is distinct from'object'or(select count(*)from jsonb_object_keys(p_terms))<>5 or not p_terms ?&array['prepayment_percent','closure_fee_paise','tax_percent','promo_apr','promo_until']then raise exception 'Review the lender assumptions.';end if;
 select id into result from public.debt_terms where user_id=owner_id and loan_id is not distinct from p_loan and account_id is not distinct from p_account;
 insert into public.debt_terms(id,user_id,loan_id,account_id,prepayment_percent,closure_fee_paise,tax_percent,promo_apr,promo_until)
 values(coalesce(result,gen_random_uuid()),owner_id,p_loan,p_account,(p_terms->>'prepayment_percent')::numeric,(p_terms->>'closure_fee_paise')::bigint,(p_terms->>'tax_percent')::numeric,(p_terms->>'promo_apr')::numeric,(p_terms->>'promo_until')::date)
 on conflict(id)do update set prepayment_percent=excluded.prepayment_percent,closure_fee_paise=excluded.closure_fee_paise,tax_percent=excluded.tax_percent,promo_apr=excluded.promo_apr,promo_until=excluded.promo_until returning id into result;return result;
end$$;
create function public.save_debt_terms(p_loan uuid,p_account uuid,p_terms jsonb)returns uuid language sql security invoker set search_path='' as $$select folio_private.save_debt_terms(p_loan,p_account,p_terms)$$;
create function public.forecast_context()returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('as_of',folio_private.today(),'non_subscription_spent_paise',coalesce((select -sum(amount_paise)from public.transactions where user_id=folio_private.current_owner()and kind='expense'and subscription_id is null and occurred_on>=date_trunc('month',folio_private.today())::date and occurred_on<=folio_private.today()),0)::text)
$$;
create function public.investment_return_history(p_holding uuid)returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner();result jsonb;
begin
 if not exists(select 1 from public.investment_holdings where id=p_holding and user_id=owner_id)then raise exception 'Holding unavailable.'using errcode='42501';end if;
 if(select count(*)from public.investment_entries where user_id=owner_id and holding_id=p_holding)>10000 then raise exception 'Performance calculation supports up to 10,000 history rows.';end if;
 select coalesce(jsonb_agg(folio_private.portable_json(to_jsonb(e))order by occurred_on,created_at,id),'[]')into result from public.investment_entries e where user_id=owner_id and holding_id=p_holding;return result;
end$$;

create table folio_private.restore_runs(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id)on delete cascade,archive_hash text not null,result jsonb not null,created_at timestamptz not null default now());
alter table folio_private.restore_runs enable row level security;
revoke all on folio_private.restore_runs from public,anon,authenticated;
create function folio_private.archive_tables()returns text[]language sql immutable set search_path=''as $$select array['profiles','accounts','categories','transactions','loans','loan_payments','subscriptions','budgets','savings_goals','goal_allocations','loan_document_details','saved_simulations','investment_holdings','investment_entries','statement_rules','account_reconciliations','month_reviews','planning_settings','planned_cash_events','debt_terms','audit_events']::text[]$$;
create function folio_private.archive_check(p_archive jsonb)returns jsonb language plpgsql set search_path=''as $$
declare t text;item jsonb;owner_text text;allowed text[];total integer:=0;version integer;
begin
 if jsonb_typeof(p_archive)is distinct from'object'or octet_length(p_archive::text)>20971520 or p_archive->>'format'is distinct from'folio-financial-export'or p_archive->>'currency'is distinct from'INR'or p_archive->>'timezone'is distinct from'Asia/Kolkata'or coalesce(p_archive->>'schema_version','')not in('1','2')or coalesce(p_archive->>'owner_id','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'then raise exception 'Unsupported or oversized financial archive.';end if;
 version:=(p_archive->>'schema_version')::integer;
 if(select count(*)from jsonb_object_keys(p_archive))<>(case when version=1 then 7 else 8 end)or not p_archive ?&array['format','schema_version','owner_id','exported_at','currency','timezone','data']then raise exception 'Unexpected archive envelope fields.';end if;
 owner_text:=p_archive->>'owner_id';allowed:=folio_private.archive_tables();
 if version=1 then allowed:=allowed[1:15];end if;
 if jsonb_typeof(p_archive->'data')is distinct from'object'or(select count(*)from jsonb_object_keys(p_archive->'data'))<>array_length(allowed,1)or not(p_archive->'data')?&allowed then raise exception 'Archive tables are missing or unexpected.';end if;
 foreach t in array allowed loop
  if jsonb_typeof(p_archive->'data'->t)is distinct from'array'then raise exception 'Archive table must be an array: %',t;end if;
  total:=total+jsonb_array_length(p_archive->'data'->t);
  for item in select value from jsonb_array_elements(p_archive->'data'->t)loop
   if jsonb_typeof(item)is distinct from'object'or coalesce(item->>case when t='profiles'then'id'else'user_id'end,'')<>owner_text then raise exception 'Archive contains inconsistent ownership.';end if;
   if exists(select 1 from pg_attribute a where a.attrelid=('public.'||t)::regclass and a.atttypid='date'::regtype and item->>a.attname is not null and item->>a.attname !~'^\d{4}-\d{2}-\d{2}$')then raise exception 'Use canonical ISO dates in the archive.';end if;
   if exists(select 1 from jsonb_object_keys(item)k where not exists(select 1 from pg_attribute a where a.attrelid=('public.'||t)::regclass and a.attname=k and a.attnum>0 and not a.attisdropped))then raise exception 'Unexpected fields in %.',t;end if;
  end loop;
 end loop;
 if total>20000 or jsonb_array_length(p_archive->'data'->'profiles')<>1 then raise exception 'Restore supports one profile and at most 20,000 financial/history rows.';end if;
 if version=2 then
  if jsonb_typeof(p_archive->'source_markers')is distinct from'object'or(select count(*)from jsonb_object_keys(p_archive->'source_markers'))<>2 or not(p_archive->'source_markers')?&array['statement_rows','transfer_sources']then raise exception 'Source markers are missing.';end if;
  foreach t in array array['statement_rows','transfer_sources']loop
   if jsonb_typeof(p_archive->'source_markers'->t)is distinct from'array'or jsonb_array_length(p_archive->'source_markers'->t)>20000 then raise exception 'Source markers exceed the supported limit.';end if;
   for item in select value from jsonb_array_elements(p_archive->'source_markers'->t)loop
    if jsonb_typeof(item)is distinct from'object'or item->>'user_id'is distinct from owner_text or not item ?&array['user_id','account_id','source_sha256','source_row']or (select count(*)from jsonb_object_keys(item))<>(case when t='statement_rows'then 4 else 5 end) or coalesce(item->>'source_sha256','')!~'^[a-f0-9]{64}$'or coalesce(item->>'source_row','')!~'^[0-9]{1,2}:[0-9]{1,6}$'or(t='transfer_sources'and not item ?'transfer_id')then raise exception 'Invalid source marker.';end if;
   end loop;
  end loop;
 end if;
 return jsonb_build_object('rows',total,'schema_version',version,'archive_hash',encode(sha256(convert_to(p_archive::text,'UTF8')),'hex'),'legacy_source_warning',version=1);
end$$;
create function folio_private.workspace_empty()returns boolean language plpgsql stable set search_path=''as $$
declare t text;found_data boolean;owner_id uuid:=folio_private.current_owner();
begin
 if exists(select 1 from folio_private.restore_runs where user_id=owner_id)then return false;end if;
 foreach t in array folio_private.archive_tables()loop
  if t in('profiles','categories','audit_events','planning_settings')then continue;end if;
  execute format('select exists(select 1 from public.%I where user_id=$1)',t)into found_data using owner_id;
  if found_data then return false;end if;
 end loop;
 return true;
end$$;
create function folio_private.restore_id(p_table text,p_old text)returns uuid language plpgsql set search_path=''as $$declare result uuid;begin
 if p_old is null then return null;end if;
 select new_id into result from pg_temp.folio_restore_ids where table_name=p_table and old_id=p_old::uuid;
 if result is null then raise exception 'Missing archive reference for %.',p_table;end if;return result;
end$$;
-- Decode portable money strings only after checking their exact integer form.
create function folio_private.archive_money(p_value jsonb)returns jsonb language plpgsql immutable set search_path=''as $$
declare result jsonb;item record;begin
 if jsonb_typeof(p_value)='object'then
  result:='{}';for item in select * from jsonb_each(p_value)loop
   if item.key like '%\_paise'escape'\'and jsonb_typeof(item.value)='string'then
    if item.value#>>'{}' !~ '^-?[0-9]{1,13}$'then raise exception 'Invalid portable money string.';end if;
    result:=result||jsonb_build_object(item.key,(item.value#>>'{}')::numeric);
   else result:=result||jsonb_build_object(item.key,folio_private.archive_money(item.value));end if;
  end loop;return result;
 elsif jsonb_typeof(p_value)='array'then select coalesce(jsonb_agg(folio_private.archive_money(value)order by ord),'[]')into result from jsonb_array_elements(p_value)with ordinality e(value,ord);return result;
 else return p_value;end if;
end$$;
create function folio_private.apply_archive(p_archive jsonb)returns jsonb language plpgsql set search_path=''as $$
declare owner_id uuid:=folio_private.current_owner();t text;item jsonb;row_json jsonb;old_id uuid;new_id uuid;col text;ref text;cols text;projection text;result jsonb;previous_restore text:=coalesce(current_setting('folio.restoring',true),'');cutoff date;fingerprint jsonb;bad boolean;
begin
 result:=folio_private.archive_check(p_archive);
 -- The Auth row blocks concurrent FK inserts until emptiness and restore commit atomically.
 perform 1 from auth.users where id=owner_id for update;
 if not found then raise exception 'Signed-in account unavailable.'using errcode='42501';end if;
 perform 1 from public.profiles where id=owner_id for update;
 perform 1 from public.categories where user_id=owner_id order by id for update;
 if not folio_private.workspace_empty()then raise exception 'Restore requires an empty financial workspace. Existing records were not replaced.';end if;
 create temporary table folio_restore_ids(table_name text,old_id uuid,new_id uuid,primary key(table_name,old_id))on commit drop;
 foreach t in array folio_private.archive_tables()loop
  for item in select value from jsonb_array_elements(coalesce(p_archive->'data'->t,'[]'))loop
   old_id:=coalesce(item->>'id',case when t='loan_document_details'then item->>'loan_id'else item->>'user_id'end)::uuid;
   if old_id is null then raise exception 'Archive row identifier missing: %',t;end if;
   insert into pg_temp.folio_restore_ids values(t,old_id,case when t in('profiles','planning_settings')then owner_id when t='loan_document_details'then folio_private.restore_id('loans',old_id::text)else gen_random_uuid()end);
  end loop;
 end loop;
 for item in select value from jsonb_array_elements(p_archive->'data'->'transactions')loop
  if item->>'transfer_id'is not null then insert into pg_temp.folio_restore_ids values('_transfers',(item->>'transfer_id')::uuid,gen_random_uuid())on conflict do nothing;end if;
 end loop;
 for item in select value from jsonb_array_elements(coalesce(p_archive->'source_markers'->'transfer_sources','[]'))loop
  insert into pg_temp.folio_restore_ids values('_transfers',(item->>'transfer_id')::uuid,gen_random_uuid())on conflict do nothing;
 end loop;
 perform set_config('folio.restoring','yes',true);
 delete from public.categories where user_id=owner_id;
 delete from public.planning_settings where user_id=owner_id;
 -- Preserve immutable pre-restore history; default workspace setup events may remain.
 foreach t in array array['profiles','accounts','categories','loans','subscriptions','savings_goals','investment_holdings','transactions','loan_payments','budgets','goal_allocations','loan_document_details','saved_simulations','investment_entries','statement_rules','account_reconciliations','month_reviews','planning_settings','planned_cash_events','debt_terms','audit_events']loop
  for item in select value from jsonb_array_elements(coalesce(p_archive->'data'->t,'[]'))loop
   row_json:=item;old_id:=coalesce(item->>'id',case when t='loan_document_details'then item->>'loan_id'else item->>'user_id'end)::uuid;
   new_id:=folio_private.restore_id(t,old_id::text);
   if t='profiles'then row_json:=row_json||jsonb_build_object('id',owner_id);cutoff:=(row_json->>'tracking_start_date')::date;row_json:=row_json||jsonb_build_object('tracking_start_date',null);
   else row_json:=row_json||jsonb_build_object('user_id',owner_id);if row_json ?'id'then row_json:=row_json||jsonb_build_object('id',new_id);end if;end if;
   if t<>'audit_events'then
    foreach col in array array['account_id','card_account_id','to_account_id','salary_account_id','spending_account_id','category_id','loan_id','holding_id','goal_id','transaction_id','subscription_id','card_emi_loan_id','transfer_id']loop
     if row_json->>col is null then continue;end if;
     ref:=case when col in('account_id','card_account_id','to_account_id','salary_account_id','spending_account_id')then'accounts'when col='category_id'then'categories'when col in('loan_id','card_emi_loan_id')then'loans'when col='holding_id'then'investment_holdings'when col='goal_id'then'savings_goals'when col='transaction_id'then'transactions'when col='subscription_id'then'subscriptions'else'_transfers'end;
     row_json:=row_json||jsonb_build_object(col,folio_private.restore_id(ref,row_json->>col));
    end loop;
    if t='planning_settings'then select coalesce(jsonb_object_agg(folio_private.restore_id('loans',e.key)::text,folio_private.restore_id('accounts',e.value)),'{}')into fingerprint from jsonb_each_text(row_json->'loan_funding')e;row_json:=row_json||jsonb_build_object('loan_funding',fingerprint);end if;
    if t='loan_document_details'then
     row_json:=jsonb_set(row_json,'{details}',folio_private.archive_money(row_json->'details'));
     if row_json->'details'->>'card_account_id'is not null then row_json:=jsonb_set(row_json,'{details,card_account_id}',to_jsonb(folio_private.restore_id('accounts',row_json->'details'->>'card_account_id')));end if;
     perform folio_private.validate_loan_document(row_json->'details');
    end if;
    if t='account_reconciliations'then row_json:=row_json||jsonb_build_object('ledger_hash','archive:'||(row_json->>'ledger_hash'));end if;
    if t='month_reviews'then row_json:=row_json||jsonb_build_object('report_hash','archive:'||(row_json->>'report_hash'));end if;
   else
    if item->>'table_name'<>all(folio_private.archive_tables())or item->>'table_name'='audit_events'then raise exception 'Unrecognised archived audit entity.';end if;
    select m.new_id into new_id from pg_temp.folio_restore_ids m where m.table_name=item->>'table_name'and m.old_id=(item->>'entity_id')::uuid;
    row_json:=row_json||jsonb_build_object('entity_id',coalesce(new_id,gen_random_uuid()),'provenance','archive');
   end if;
   if t='profiles'then delete from public.profiles where id=owner_id;end if;
   select string_agg(format('%I',a.attname),','order by a.attnum),string_agg(format('r.%I',a.attname),','order by a.attnum)into cols,projection from pg_attribute a where a.attrelid=('public.'||t)::regclass and a.attnum>0 and not a.attisdropped and a.attgenerated=''and row_json ?a.attname;
   execute format('insert into public.%I(%s)select %s from jsonb_populate_record(null::public.%I,$1)r',t,cols,projection,t)using row_json;
  end loop;
 end loop;
 -- Dates, ownership and accounting relations must remain valid even for a hand-edited archive.
 if exists(select 1 from public.accounts where user_id=owner_id and opening_date>folio_private.today())or exists(select 1 from public.transactions t join public.accounts a on a.id=t.account_id and a.user_id=t.user_id where t.user_id=owner_id and(t.occurred_on>folio_private.today()or t.occurred_on<a.opening_date))then raise exception 'Archive contains invalid account/transaction dates.';end if;
 if exists(select 1 from public.transactions where user_id=owner_id and kind='transfer'group by transfer_id having count(*)<>2 or sum(amount_paise)<>0 or count(distinct account_id)<>2 or count(*)filter(where amount_paise>0)<>1)then raise exception 'Archive transfer legs do not balance.';end if;
 if exists(select 1 from public.transactions t left join public.loan_payments p on p.transaction_id=t.id and p.user_id=t.user_id where t.user_id=owner_id and((t.kind='loan_payment'and p.id is null)or(p.id is not null and(t.kind<>'loan_payment'or -t.amount_paise<>p.principal_paise+p.interest_paise or t.occurred_on<>p.paid_on))))then raise exception 'Archive loan-payment accounting is inconsistent.';end if;
 if exists(select 1 from public.loan_payments p join public.loans l on l.id=p.loan_id and l.user_id=p.user_id where p.user_id=owner_id and(p.paid_on<l.start_date or l.card_account_id is not null))or exists(select 1 from public.loans l where l.user_id=owner_id and l.principal_paise<(select coalesce(sum(p.principal_paise),0)from public.loan_payments p where p.user_id=owner_id and p.loan_id=l.id))then raise exception 'Archive repayments exceed or predate the loan balance.';end if;
 if exists(select 1 from public.loans where user_id=owner_id and start_date>folio_private.today())then raise exception 'Archive loan baseline is in the future.';end if;
 if(select count(*)from public.planned_cash_events where user_id=owner_id)>100 then raise exception 'Restore supports at most 100 planned events.';end if;
 if exists(select 1 from public.investment_holdings h where h.user_id=owner_id and not exists(select 1 from public.investment_entries e where e.user_id=owner_id and e.holding_id=h.id and e.kind='valuation'))then raise exception 'Retain at least one valuation per restored holding.';end if;
 if exists(select 1 from public.investment_entries where user_id=owner_id and occurred_on>folio_private.today())then raise exception 'Archive investment dates are in the future.';end if;
 if exists(select 1 from public.transactions t join public.loans l on l.id=t.card_emi_loan_id and l.user_id=t.user_id where t.user_id=owner_id and l.card_account_id is distinct from t.account_id)then raise exception 'Archive card EMI account mismatch.';end if;
 if exists(select 1 from public.planning_settings p,jsonb_each_text(p.loan_funding)e where p.user_id=owner_id and(not exists(select 1 from public.loans where user_id=owner_id and id=e.key::uuid)or not exists(select 1 from public.accounts where user_id=owner_id and id=e.value::uuid)))then raise exception 'Invalid forecast funding references.';end if;
 update public.profiles set tracking_start_date=cutoff where id=owner_id;
 for item in select value from jsonb_array_elements(coalesce(p_archive->'source_markers'->'statement_rows','[]'))loop
  insert into folio_private.statement_rows values(owner_id,folio_private.restore_id('accounts',item->>'account_id'),item->>'source_sha256',item->>'source_row');
 end loop;
 for item in select value from jsonb_array_elements(coalesce(p_archive->'source_markers'->'transfer_sources','[]'))loop
  insert into folio_private.transfer_sources values(owner_id,folio_private.restore_id('accounts',item->>'account_id'),item->>'source_sha256',item->>'source_row',folio_private.restore_id('_transfers',item->>'transfer_id'));
 end loop;
 fingerprint:=public.workspace_snapshot();
 if exists(select 1 from jsonb_array_elements(fingerprint->'accounts')a where abs((a->>'balance_paise')::numeric)>1000000000000)or exists(select 1 from jsonb_each_text(fingerprint->'summary')e where key<>'month'and abs(value::numeric)>1000000000000)then raise exception 'Restored financial totals exceed supported limits.';end if;
 perform set_config('folio.restoring',previous_restore,true);
 return result||jsonb_build_object('restored',true,'review_required',true);
end$$;
create function folio_private.preview_financial_restore(p_archive jsonb)returns jsonb language plpgsql security definer set search_path=''as $$
declare result jsonb;begin
 perform folio_private.current_owner();result:=folio_private.archive_check(p_archive);
 if not folio_private.workspace_empty()then return result||jsonb_build_object('can_restore',false,'reason','Existing financial records are present. Restore only into a separate empty workspace.');end if;
 begin result:=folio_private.apply_archive(p_archive);raise exception using errcode='P0R01';exception when sqlstate 'P0R01'then null;end;
 return result||jsonb_build_object('can_restore',true,'restored',false);
end$$;
create function public.preview_financial_restore(p_archive jsonb)returns jsonb language sql security invoker set search_path=''as $$select folio_private.preview_financial_restore(p_archive)$$;
create function folio_private.confirm_financial_restore(p_archive jsonb,p_expected_hash text,p_confirmation text,p_request_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare owner_id uuid:=folio_private.current_owner();result jsonb;run_id uuid;previous uuid;check_result jsonb;
begin
 if p_confirmation is distinct from'RESTORE INTO EMPTY WORKSPACE'or p_request_id is null then raise exception 'Confirm restore into an empty workspace.';end if;
 check_result:=folio_private.archive_check(p_archive);
 if p_expected_hash is distinct from check_result->>'archive_hash'then raise exception 'Archive changed after preview. Preview it again.';end if;
 previous:=folio_private.begin_mutation(p_request_id,'restore_financial_archive',jsonb_build_array(p_expected_hash,p_confirmation));
 if previous is not null then select r.result into result from folio_private.restore_runs r where r.id=previous and r.user_id=owner_id;return result;end if;
 result:=folio_private.apply_archive(p_archive);
 insert into folio_private.restore_runs(user_id,archive_hash,result)values(owner_id,p_expected_hash,result)returning id into run_id;
 insert into public.audit_events(user_id,table_name,entity_id,action,after_data,reason)values(owner_id,'profiles',owner_id,'RESTORE',result,'Owner confirmed a validated archive into an empty workspace. Imported audit entries are unverified archive history.');
 perform folio_private.finish_mutation(p_request_id,'restore_financial_archive',jsonb_build_array(p_expected_hash,p_confirmation),run_id);return result;
end$$;
create function public.confirm_financial_restore(p_archive jsonb,p_expected_hash text,p_confirmation text,p_request_id uuid)returns jsonb language sql security invoker set search_path=''as $$select folio_private.confirm_financial_restore(p_archive,p_expected_hash,p_confirmation,p_request_id)$$;

create function folio_private.export_source_markers()returns jsonb language sql stable security definer set search_path=''as $$
 select jsonb_build_object('statement_rows',coalesce((select jsonb_agg(to_jsonb(r)-'created_at')from folio_private.statement_rows r where user_id=folio_private.current_owner()),'[]'),'transfer_sources',coalesce((select jsonb_agg(to_jsonb(r))from folio_private.transfer_sources r where user_id=folio_private.current_owner()),'[]'))
$$;
create or replace function folio_private.export_financial_data()returns jsonb language plpgsql stable security invoker set search_path=''as $$
declare owner_id uuid:=folio_private.current_owner();t text;rows jsonb;data jsonb:='{}';result jsonb;
begin
 foreach t in array folio_private.archive_tables()loop
  execute format('select coalesce(jsonb_agg(folio_private.portable_json(to_jsonb(r))order by to_jsonb(r)::text),''[]'')from public.%I r where %I=$1',t,case when t='profiles'then'id'else'user_id'end)into rows using owner_id;data:=data||jsonb_build_object(t,rows);
 end loop;
 result:=jsonb_build_object('format','folio-financial-export','schema_version',2,'owner_id',owner_id,'exported_at',now(),'currency','INR','timezone','Asia/Kolkata','data',data,'source_markers',folio_private.export_source_markers());
 if octet_length(result::text)>20971520 then raise exception 'Export exceeds 20 MiB.';end if;return result;
end$$;
-- Every future financial edit is recorded. Existing history is not fabricated retroactively.
do $$declare t text;begin
 foreach t in array folio_private.archive_tables()loop
  if t='audit_events'then continue;end if;
  execute format('create trigger financial_audit after insert or update or delete on public.%I for each row execute function folio_private.audit_change()',t);
 end loop;
end$$;
do $$declare fn record;begin
 for fn in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','folio_private')and p.proname=any(array['archive_money','audit_change','valid_month','account_statement_report','reconcile_account','monthly_review_report','review_month','transfer_spec','preview_transfer_match','confirm_transfer_match','save_planning','save_planned_event','save_debt_terms','forecast_context','investment_return_history','archive_tables','archive_check','workspace_empty','restore_id','apply_archive','preview_financial_restore','confirm_financial_restore','export_source_markers'])loop
  execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
  if fn.proname not in('archive_money','audit_change','transfer_spec','archive_check','workspace_empty','restore_id','apply_archive')then execute format('grant execute on function %s to authenticated',fn.signature);end if;
 end loop;
end$$;
notify pgrst,'reload schema';
