-- History-preserving removal; never deletes ledger entries or changes account balances.
alter table public.loans add column removed_at timestamptz;
alter table public.subscriptions add column removed_at timestamptz;
alter table public.loans add constraint removed_loan_closed check(removed_at is null or status='closed');
alter table public.subscriptions add constraint removed_subscription_inactive check(removed_at is null or not active);
-- All removal goes through the atomic owner RPC. Removed records cannot be revived by edits.
create function folio_private.guard_removed_commitment() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and old.removed_at is not null then raise exception 'This record was removed. Its history is retained.';end if;
 if new.removed_at is not null and current_user in('authenticated','anon') then raise exception 'Use the reviewed removal action.' using errcode='42501';end if;
 return new;
end$$;
create trigger loans_removal_guard before insert or update on public.loans for each row execute function folio_private.guard_removed_commitment();
create trigger subscriptions_removal_guard before insert or update on public.subscriptions for each row execute function folio_private.guard_removed_commitment();
revoke delete on public.subscriptions from authenticated;

create function folio_private.remove_commitment(p_kind text,p_id uuid,p_expected_balance bigint,p_expected_budget bigint,p_reduce_budget boolean,p_confirmation text)returns void
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); l public.loans;s public.subscriptions;outstanding numeric;budget bigint;monthly bigint;
begin
 if p_confirmation is distinct from 'DELETE' then raise exception 'Type DELETE to confirm removal.';end if;
 if p_kind='loan' then
  select * into l from public.loans where id=p_id and user_id=owner_id for update;
  if not found then raise exception 'Loan unavailable.' using errcode='42501';end if;
  if l.removed_at is not null then return;end if;
  outstanding:=l.principal_paise-(select coalesce(sum(principal_paise),0)from public.loan_payments where loan_id=l.id and user_id=owner_id);
  if outstanding is distinct from p_expected_balance then raise exception 'The loan balance changed. Close this form, refresh and review again.';end if;
  update public.loans set status='closed',removed_at=now()where id=l.id and user_id=owner_id;
  update public.statement_rules set enabled=false where user_id=owner_id and loan_id=l.id;
  -- Keep funding metadata and terms for portable history, but hidden loans never drive forecasts.
 elsif p_kind='subscription' then
  select * into s from public.subscriptions where id=p_id and user_id=owner_id for update;
  if not found then raise exception 'Subscription unavailable.' using errcode='42501';end if;
  if s.removed_at is not null then return;end if;
  select monthly_living_budget_paise into budget from public.profiles where id=owner_id for update;
  if budget is distinct from p_expected_budget then raise exception 'Your living budget changed. Close this form, refresh and review again.';end if;
  if p_reduce_budget is null then raise exception 'Choose how to update your living budget.';end if;
  monthly:=case when not s.active then 0 when s.cadence='yearly'then round(s.amount_paise::numeric/12)when s.cadence='weekly'then round(s.amount_paise::numeric*52/12)else s.amount_paise end;
  if monthly is distinct from p_expected_balance then raise exception 'The subscription changed. Close this form, refresh and review again.';end if;
  if p_reduce_budget then update public.profiles set monthly_living_budget_paise=greatest(0,budget-monthly)where id=owner_id;end if;
  update public.subscriptions set active=false,removed_at=now()where id=s.id and user_id=owner_id;
  update public.statement_rules set enabled=false where user_id=owner_id and subscription_id=s.id;
 else raise exception 'Choose a loan or subscription.';end if;
end$$;
create function public.remove_commitment(p_kind text,p_id uuid,p_expected_balance bigint,p_expected_budget bigint,p_reduce_budget boolean,p_confirmation text)returns void language sql security invoker set search_path='' as $$select folio_private.remove_commitment(p_kind,p_id,p_expected_balance,p_expected_budget,p_reduce_budget,p_confirmation)$$;
revoke all on function folio_private.guard_removed_commitment()from public,anon,authenticated;
revoke all on function folio_private.remove_commitment(text,uuid,bigint,bigint,boolean,text),public.remove_commitment(text,uuid,bigint,bigint,boolean,text)from public,anon,authenticated;
grant execute on function folio_private.remove_commitment(text,uuid,bigint,bigint,boolean,text),public.remove_commitment(text,uuid,bigint,bigint,boolean,text)to authenticated;

create or replace function public.workspace_snapshot() returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); month_start date:=date_trunc('month',folio_private.today())::date; result jsonb; cutoff date;
begin
  select tracking_start_date into cutoff from public.profiles where id=owner_id;
  with balances as (
    select a.*,a.opening_balance_paise+(select coalesce(sum(t.amount_paise),0) from public.transactions t where t.account_id=a.id and t.user_id=owner_id) as balance_paise
      from public.accounts a where a.user_id=owner_id
  ), loan_state as (
    select l.*,coalesce(l.deduction_anchor_on,(select (d.details->>'first_due_on')::date from public.loan_document_details d where d.loan_id=l.id and d.user_id=owner_id)) as calendar_anchor_on,exists(select 1 from public.loan_document_details d where d.loan_id=l.id and d.user_id=owner_id) as has_document,l.principal_paise-(select coalesce(sum(p.principal_paise),0) from public.loan_payments p where p.loan_id=l.id and p.user_id=owner_id) as outstanding_paise
      from public.loans l where l.user_id=owner_id and l.removed_at is null
  )
  select jsonb_build_object(
    'profile',(select to_jsonb(p) from public.profiles p where p.id=owner_id),
    'accounts',coalesce((select jsonb_agg(to_jsonb(b)-'balance_paise'||jsonb_build_object('balance_paise',b.balance_paise::text) order by b.created_at) from balances b),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.kind,c.name) from public.categories c where c.user_id=owner_id),'[]'::jsonb),
    'loans',coalesce((select jsonb_agg(to_jsonb(l)-'outstanding_paise'-'calendar_anchor_on'||jsonb_build_object('outstanding_paise',l.outstanding_paise::text,'deduction_anchor_on',l.calendar_anchor_on) order by l.created_at) from loan_state l),'[]'::jsonb),
    'subscriptions',coalesce((select jsonb_agg(to_jsonb(s) order by s.next_due_on) from public.subscriptions s where s.user_id=owner_id and s.removed_at is null),'[]'::jsonb),
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

-- Disabled matching history remains portable. Removed targets cannot be re-enabled.
create function folio_private.guard_removed_rule()returns trigger language plpgsql set search_path='' as $$
begin
 if new.enabled and (exists(select 1 from public.loans where id=new.loan_id and user_id=new.user_id and removed_at is not null)or exists(select 1 from public.subscriptions where id=new.subscription_id and user_id=new.user_id and removed_at is not null))then raise exception 'This rule points to a removed commitment.';end if;
 return new;
end$$;
create trigger statement_rules_removed_target before insert or update on public.statement_rules for each row execute function folio_private.guard_removed_rule();
revoke all on function folio_private.guard_removed_rule()from public,anon,authenticated;

-- Keep historical links; reject new deductions assigned to removed plans.
create or replace function folio_private.link_card_emi_deduction(p_loan uuid,p_transaction uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); t public.transactions; loan public.loans; cutoff date;
begin
 -- Loan then account then transaction, matching repayment/deletion lock order.
 if p_loan is not null then
  select * into loan from public.loans where id=p_loan and user_id=owner_id for update;
  if not found or loan.card_account_id is null or loan.removed_at is not null then raise exception 'Owned card EMI plan required.' using errcode='42501'; end if;
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
