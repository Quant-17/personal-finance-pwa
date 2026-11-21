-- Owner-requested reporting cutover. Preserve all existing balances and financial history.
-- Existing workspaces start on 1 Dec 2026; new workspaces explicitly choose their start in Monthly plan.
alter table public.profiles add column tracking_start_date date default date '2026-12-01';
alter table public.profiles alter column tracking_start_date drop default;
alter table public.loans add column deduction_anchor_on date;
-- Existing reviewed document dates are reused in the snapshot, without updating loan balances/revisions.
alter table public.transactions add column subscription_id uuid;
alter table public.transactions add constraint transactions_subscription_owner_fkey
 foreign key(subscription_id,user_id) references public.subscriptions(id,user_id) on delete set null (subscription_id);
alter table public.transactions add constraint subscription_expense_only check(subscription_id is null or kind='expense');
create index transactions_subscription_history_idx on public.transactions(subscription_id,user_id,occurred_on) where subscription_id is not null;

create function folio_private.tracking_guard() returns trigger language plpgsql set search_path='' as $$
declare cutoff date;
begin
 select tracking_start_date into cutoff from public.profiles where id=new.user_id;
 if cutoff is not null and new.occurred_on<cutoff and (tg_op='INSERT' or new.occurred_on is distinct from old.occurred_on) then
  raise exception 'Transaction date precedes your tracking start (%). Existing balances and history are preserved.',cutoff;
 end if;
 return new;
end $$;
create trigger transactions_tracking_guard before insert or update on public.transactions for each row execute function folio_private.tracking_guard();

create function folio_private.link_subscription_deduction(p_subscription uuid,p_transaction uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); t public.transactions; cutoff date;
begin
 select * into t from public.transactions where id=p_transaction and user_id=owner_id;
 if not found then raise exception 'Transaction unavailable.' using errcode='42501'; end if;
 -- Account before ledger row, matching record_entry/delete_entry. Locking does not post money.
 perform 1 from public.accounts where id=t.account_id and user_id=owner_id for update;
 select * into t from public.transactions where id=p_transaction and user_id=owner_id for update;
 if not found or t.kind<>'expense' then raise exception 'Choose an owned settled expense.' using errcode='42501'; end if;
 select tracking_start_date into cutoff from public.profiles where id=owner_id;
 if t.card_emi_loan_id is not null then raise exception 'Expense is linked to a card EMI; unlink it first.'; end if;
 if p_subscription is not null then
  if t.occurred_on<cutoff then raise exception 'Deduction predates transaction tracking.'; end if;
  perform 1 from public.subscriptions where id=p_subscription and user_id=owner_id;
  if not found then raise exception 'Subscription unavailable.' using errcode='42501'; end if;
  if t.subscription_id is not null and t.subscription_id<>p_subscription then raise exception 'Expense is linked elsewhere. Unlink before changing it.'; end if;
 end if;
 update public.transactions set subscription_id=p_subscription where id=t.id and user_id=owner_id;
 return t.id;
end $$;
create function public.link_subscription_deduction(p_subscription uuid,p_transaction uuid) returns uuid
language sql security invoker set search_path='' as $$select folio_private.link_subscription_deduction(p_subscription,p_transaction)$$;

create function folio_private.record_subscription_charge(p_subscription uuid,p_account uuid,p_category uuid,p_amount_paise bigint,p_occurred_on date,p_request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); prior uuid; result uuid; sub public.subscriptions; totals jsonb;
 payload jsonb:=jsonb_build_array(p_subscription,p_account,p_category,p_amount_paise,p_occurred_on);
begin
 if p_request_id is null then raise exception 'Request ID required.'; end if;
 prior:=folio_private.begin_mutation(p_request_id,'record_subscription_charge',payload);if prior is not null then return prior; end if;
 select * into sub from public.subscriptions where id=p_subscription and user_id=owner_id and active;
 if not found then raise exception 'Active subscription unavailable.' using errcode='42501'; end if;
 perform folio_private.check_account(p_account,owner_id,p_occurred_on);
 if exists(select 1 from public.transactions where user_id=owner_id and account_id=p_account and kind='expense' and occurred_on=p_occurred_on and amount_paise=-p_amount_paise) then raise exception 'A matching expense already exists. Link the recorded expense instead of posting again.'; end if;
 result:=folio_private.record_entry(p_account,p_category,'expense',p_amount_paise,p_occurred_on,sub.name,null,null);
 perform folio_private.link_subscription_deduction(p_subscription,result);
 totals:=public.workspace_snapshot();
 if exists(select 1 from (
  select (a->>'balance_paise')::numeric amount from jsonb_array_elements(totals->'accounts') a
  union all select value::numeric from jsonb_each_text(totals->'summary') where key<>'month'
  union all select (c->>'amount_paise')::numeric from jsonb_array_elements(totals->'category_spending') c
  union all select (c->>'income_paise')::numeric from jsonb_array_elements(totals->'cashflow') c
  union all select (c->>'outflow_paise')::numeric from jsonb_array_elements(totals->'cashflow') c
  union all select (b->>'spent_paise')::numeric from jsonb_array_elements(totals->'budgets') b
 ) bounds where abs(amount)>1000000000000) then raise exception 'Financial total exceeds the supported range.' using errcode='22003'; end if;
 perform folio_private.finish_mutation(p_request_id,'record_subscription_charge',payload,result);
 return result;
end $$;
create function public.record_subscription_charge(p_subscription uuid,p_account uuid,p_category uuid,p_amount_paise bigint,p_occurred_on date,p_request_id uuid) returns uuid
language sql security invoker set search_path='' as $$select folio_private.record_subscription_charge(p_subscription,p_account,p_category,p_amount_paise,p_occurred_on,p_request_id)$$;
revoke all on function folio_private.tracking_guard(),folio_private.link_subscription_deduction(uuid,uuid),public.link_subscription_deduction(uuid,uuid),folio_private.record_subscription_charge(uuid,uuid,uuid,bigint,date,uuid),public.record_subscription_charge(uuid,uuid,uuid,bigint,date,uuid) from public,anon,authenticated;
grant execute on function folio_private.link_subscription_deduction(uuid,uuid),public.link_subscription_deduction(uuid,uuid),folio_private.record_subscription_charge(uuid,uuid,uuid,bigint,date,uuid),public.record_subscription_charge(uuid,uuid,uuid,bigint,date,uuid) to authenticated;

-- A card EMI is an existing card expense, never a second bank-to-loan repayment.
alter table public.transactions add column card_emi_loan_id uuid;
alter table public.transactions add constraint transactions_card_emi_owner_fkey foreign key(card_emi_loan_id,user_id) references public.loans(id,user_id);
alter table public.transactions add constraint card_emi_expense_only check(card_emi_loan_id is null or (kind='expense' and subscription_id is null));
create index transactions_card_emi_history_idx on public.transactions(card_emi_loan_id,user_id,occurred_on) where card_emi_loan_id is not null;
create function folio_private.link_card_emi_deduction(p_loan uuid,p_transaction uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); t public.transactions; loan public.loans; cutoff date;
begin
 -- Loan then account then transaction, matching repayment/deletion lock order.
 if p_loan is not null then
  select * into loan from public.loans where id=p_loan and user_id=owner_id for update;
  if not found or loan.card_account_id is null then raise exception 'Owned card EMI plan required.' using errcode='42501'; end if;
 end if;
 select * into t from public.transactions where id=p_transaction and user_id=owner_id;
 if not found then raise exception 'Transaction unavailable.' using errcode='42501'; end if;
 perform 1 from public.accounts where id=t.account_id and user_id=owner_id for update;
 select * into t from public.transactions where id=p_transaction and user_id=owner_id for update;
 if not found or t.kind<>'expense' or t.subscription_id is not null then raise exception 'Choose an unlinked owned card expense.' using errcode='42501'; end if;
 select tracking_start_date into cutoff from public.profiles where id=owner_id;
 if p_loan is not null then
  if t.occurred_on<cutoff then raise exception 'Deduction predates transaction tracking.'; end if;
  if loan.card_account_id<>t.account_id then raise exception 'Choose an expense on this EMI plan’s linked card.'; end if;
  if t.card_emi_loan_id is not null and t.card_emi_loan_id<>p_loan then raise exception 'Expense already linked; unlink first.'; end if;
 end if;
 update public.transactions set card_emi_loan_id=p_loan where id=t.id and user_id=owner_id;
 return t.id;
end $$;
create function public.link_card_emi_deduction(p_loan uuid,p_transaction uuid) returns uuid
language sql security invoker set search_path='' as $$select folio_private.link_card_emi_deduction(p_loan,p_transaction)$$;
revoke all on function folio_private.link_card_emi_deduction(uuid,uuid),public.link_card_emi_deduction(uuid,uuid) from public,anon,authenticated;
grant execute on function folio_private.link_card_emi_deduction(uuid,uuid),public.link_card_emi_deduction(uuid,uuid) to authenticated;

create or replace function public.workspace_snapshot() returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); month_start date:=date_trunc('month',folio_private.today())::date; result jsonb; cutoff date;
begin
  select tracking_start_date into cutoff from public.profiles where id=owner_id;
  with balances as (
    select a.*,a.opening_balance_paise+(select coalesce(sum(t.amount_paise),0) from public.transactions t where t.account_id=a.id and t.user_id=owner_id) as balance_paise
      from public.accounts a where a.user_id=owner_id
  ), loan_state as (
    select l.*,coalesce(l.deduction_anchor_on,(select (d.details->>'first_due_on')::date from public.loan_document_details d where d.loan_id=l.id and d.user_id=owner_id)) as calendar_anchor_on,exists(select 1 from public.loan_document_details d where d.loan_id=l.id and d.user_id=owner_id) as has_document,l.principal_paise-(select coalesce(sum(p.principal_paise),0) from public.loan_payments p where p.loan_id=l.id and p.user_id=owner_id) as outstanding_paise
      from public.loans l where l.user_id=owner_id
  )
  select jsonb_build_object(
    'profile',(select to_jsonb(p) from public.profiles p where p.id=owner_id),
    'accounts',coalesce((select jsonb_agg(to_jsonb(b)-'balance_paise'||jsonb_build_object('balance_paise',b.balance_paise::text) order by b.created_at) from balances b),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.kind,c.name) from public.categories c where c.user_id=owner_id),'[]'::jsonb),
    'loans',coalesce((select jsonb_agg(to_jsonb(l)-'outstanding_paise'-'calendar_anchor_on'||jsonb_build_object('outstanding_paise',l.outstanding_paise::text,'deduction_anchor_on',l.calendar_anchor_on) order by l.created_at) from loan_state l),'[]'::jsonb),
    'subscriptions',coalesce((select jsonb_agg(to_jsonb(s) order by s.next_due_on) from public.subscriptions s where s.user_id=owner_id),'[]'::jsonb),
    'budgets',coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object('spent_paise',(-(select coalesce(sum(t.amount_paise),0) from public.transactions t where t.user_id=owner_id and t.category_id=b.category_id and (cutoff is null or t.occurred_on>=cutoff) and t.kind='expense' and t.occurred_on>=b.month and t.occurred_on<(b.month+interval '1 month')))::text)) from public.budgets b where b.user_id=owner_id and b.month=month_start),'[]'::jsonb),
    'goals',coalesce((select jsonb_agg(to_jsonb(g)||jsonb_build_object('allocated_paise',(select coalesce(sum(a.amount_paise),0)::text from public.goal_allocations a where a.goal_id=g.id and a.user_id=owner_id))) from public.savings_goals g where g.user_id=owner_id),'[]'::jsonb),
    'allocations',coalesce((select jsonb_agg(to_jsonb(a)) from public.goal_allocations a where a.user_id=owner_id),'[]'::jsonb),
    'summary',jsonb_build_object(
      'month',month_start::text,
      'income_paise',(select coalesce(sum(amount_paise),0)::text from public.transactions where user_id=owner_id and kind='income' and occurred_on>=month_start and (cutoff is null or occurred_on>=cutoff)),
      'expense_paise',(select (-coalesce(sum(amount_paise),0))::text from public.transactions where user_id=owner_id and kind='expense' and occurred_on>=month_start and (cutoff is null or occurred_on>=cutoff)),
      'loan_payments_paise',(select (-coalesce(sum(amount_paise),0))::text from public.transactions where user_id=owner_id and kind='loan_payment' and occurred_on>=month_start and (cutoff is null or occurred_on>=cutoff)),
      'liquid_cash_paise',((select coalesce(sum(balance_paise),0) from balances where type in ('bank','savings','cash') and archived_at is null)-(select coalesce(sum(g.amount_paise),0) from public.goal_allocations g join balances b on b.id=g.account_id where g.user_id=owner_id and b.type in ('bank','savings','cash') and b.archived_at is null))::text,
      'assets_paise',(select coalesce(sum(greatest(balance_paise,0)),0)::text from balances),
      'net_worth_paise',((select coalesce(sum(balance_paise),0) from balances)-(select coalesce(sum(outstanding_paise),0) from loan_state where card_account_id is null))::text,
      'existing_emi_paise',(select coalesce(sum(coalesce(reported_emi_paise,emi_paise)),0)::text from loan_state where status='active' and outstanding_paise>0)
    ),
    'cashflow',coalesce((select jsonb_agg(jsonb_build_object('month',m::date::text,
      'income_paise',(select coalesce(sum(t.amount_paise),0)::text from public.transactions t where t.user_id=owner_id and t.kind='income' and (cutoff is null or t.occurred_on>=cutoff) and t.occurred_on>=m::date and t.occurred_on<(m+interval '1 month')::date),
      'outflow_paise',(select (-coalesce(sum(t.amount_paise),0))::text from public.transactions t where t.user_id=owner_id and t.kind in ('expense','loan_payment') and (cutoff is null or t.occurred_on>=cutoff) and t.occurred_on>=m::date and t.occurred_on<(m+interval '1 month')::date)
      ) order by m) from generate_series(greatest(month_start-interval '11 months',coalesce(date_trunc('month',cutoff),month_start-interval '11 months')),month_start,interval '1 month') m),'[]'::jsonb)
  ) into result;
  result:=result||jsonb_build_object('investments',public.investment_portfolio());
  result:=jsonb_set(result,'{summary,assets_paise}',to_jsonb(((result->'summary'->>'assets_paise')::numeric+(select coalesce(sum((v->>'value_paise')::numeric),0) from jsonb_array_elements(result->'investments') v where v->>'account_id' is null))::text));
  result:=jsonb_set(result,'{summary,net_worth_paise}',to_jsonb(((result->'summary'->>'net_worth_paise')::numeric+(select coalesce(sum((v->>'value_paise')::numeric),0) from jsonb_array_elements(result->'investments') v where v->>'account_id' is null))::text));
  result:=result||jsonb_build_object(
   'category_spending',coalesce((select jsonb_agg(to_jsonb(x)) from (
    select date_trunc('month',t.occurred_on)::date::text as month,c.id category_id,c.name,
     (-sum(t.amount_paise))::text amount_paise from public.transactions t join public.categories c on c.id=t.category_id and c.user_id=owner_id
    where t.user_id=owner_id and t.kind='expense' and (cutoff is null or t.occurred_on>=cutoff) and t.occurred_on>=month_start-interval '11 months'
    group by 1,c.id,c.name order by 1,c.name) x),'[]'::jsonb),
   'deductions',coalesce((select jsonb_agg(to_jsonb(x) order by x.paid_on desc,x.transaction_id) from (
    select t.id transaction_id,'subscription'::text kind,t.subscription_id commitment_id,t.occurred_on::text paid_on,(-t.amount_paise)::text amount_paise,null::text principal_paise,null::text interest_paise
    from public.transactions t where t.user_id=owner_id and t.subscription_id is not null and (cutoff is null or t.occurred_on>=cutoff)
    union all
    select t.id,'card_emi',t.card_emi_loan_id,t.occurred_on::text,(-t.amount_paise)::text,null::text,null::text from public.transactions t where t.user_id=owner_id and t.card_emi_loan_id is not null and (cutoff is null or t.occurred_on>=cutoff)
    union all
    select p.transaction_id,'loan',p.loan_id,p.paid_on::text,(-t.amount_paise)::text,p.principal_paise::text,p.interest_paise::text
    from public.loan_payments p join public.transactions t on t.id=p.transaction_id and t.user_id=owner_id where p.user_id=owner_id and (cutoff is null or p.paid_on>=cutoff)
   ) x),'[]'::jsonb));
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
 ) else t.description=item->'entry'->>'description' or (t.kind='expense' and (t.subscription_id is not null or t.card_emi_loan_id is not null)) end)

$$;

notify pgrst,'reload schema';
