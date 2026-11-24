-- Self-contained transactional fixtures. No mail is sent, and every record is rolled back.
begin;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$
begin
 if ok is not true then raise exception 'FAIL: %',label; end if;
 perform set_config('folio.assertions',(coalesce(nullif(current_setting('folio.assertions',true),''),'0')::int+1)::text,true);
end $$;
create function pg_temp.expect_error(statement text, expected_state text, label text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then
   if sqlstate<>expected_state then raise exception 'FAIL: %, expected SQLSTATE %, got %: %',label,expected_state,sqlstate,sqlerrm; end if;
   perform pg_temp.assert_true(true,label); return;
 end;
 raise exception 'FAIL: % did not reject the operation',label;
end $$;
with u as (insert into auth.users(id,email) values(gen_random_uuid(),'folio-a@example.invalid') returning id) select set_config('folio.user_a',id::text,true) from u;
with u as (insert into auth.users(id,email) values(gen_random_uuid(),'folio-b@example.invalid') returning id) select set_config('folio.user_b',id::text,true) from u;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('folio.user_a'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('folio.user_a'),'role','authenticated','is_anonymous',false)::text,true);
select public.initialize_workspace();
select pg_temp.assert_true((public.workspace_snapshot()->'summary'->>'income_paise')::bigint=0,'new workspace starts with no fictional income');
with a as (insert into public.accounts(name,type,opening_balance_paise,opening_date) values('Fixture bank','bank',1000000,folio_private.today()-30) returning id) select set_config('folio.account_a',id::text,true) from a;
with a as (insert into public.accounts(name,type,opening_balance_paise,opening_date) values('Fixture savings','savings',0,folio_private.today()-30) returning id) select set_config('folio.account_a2',id::text,true) from a;
select set_config('folio.income_a',(select id::text from public.categories where name='Salary'),true);
select set_config('folio.expense_a',(select id::text from public.categories where name='Food & groceries'),true);
select set_config('folio.income_entry_a',public.record_entry(current_setting('folio.account_a')::uuid,current_setting('folio.income_a')::uuid,'income',100000,folio_private.today(),'Fixture income')::text,true);
select set_config('folio.expense_entry_a',public.record_entry(current_setting('folio.account_a')::uuid,current_setting('folio.expense_a')::uuid,'expense',25000,folio_private.today(),'Fixture expense')::text,true);
select set_config('folio.transfer_a',public.record_transfer(current_setting('folio.account_a')::uuid,current_setting('folio.account_a2')::uuid,100000,folio_private.today(),'Fixture transfer')::text,true);
select pg_temp.assert_true((select count(*)=2 and sum(amount_paise)=0 from public.transactions where transfer_id=current_setting('folio.transfer_a')::uuid),'transfer creates a zero-sum pair');
select pg_temp.expect_error(format('select public.record_transfer(%L,%L,100,%L,%L)',current_setting('folio.account_a'),current_setting('folio.account_a'),folio_private.today(),''),'P0001','self transfer rejected');
select pg_temp.expect_error(format('select public.record_entry(%L,%L,%L,100,%L,%L)',current_setting('folio.account_a'),current_setting('folio.expense_a'),'income',folio_private.today(),''),'42501','wrong category kind rejected');
select pg_temp.expect_error(format('select public.record_entry(%L,%L,%L,100,%L,%L)',current_setting('folio.account_a'),current_setting('folio.income_a'),'income',folio_private.today()+1,''),'P0001','future settled transaction rejected');
select pg_temp.expect_error(format('select public.record_entry(%L,%L,%L,0,%L,%L)',current_setting('folio.account_a'),current_setting('folio.income_a'),'income',folio_private.today(),''),'P0001','zero amount rejected');
select pg_temp.expect_error(format('insert into public.transactions(user_id,account_id,kind,amount_paise,occurred_on) values(%L,%L,%L,-100,%L)',current_setting('folio.user_a'),current_setting('folio.account_a'),'loan_payment',folio_private.today()),'42501','direct ledger writes rejected');
with l as (insert into public.loans(name,principal_paise,apr,tenure_months,start_date) values('Fixture loan',500000,12,12,folio_private.today()-30) returning id) select set_config('folio.loan_a',id::text,true) from l;
select set_config('folio.payment_a',public.record_loan_payment(current_setting('folio.loan_a')::uuid,current_setting('folio.account_a')::uuid,50000,5000,folio_private.today(),'Fixture repayment')::text,true);
select pg_temp.expect_error(format('select public.record_loan_payment(%L,%L,500000,100,%L,%L)',current_setting('folio.loan_a'),current_setting('folio.account_a'),folio_private.today(),''),'P0001','loan overpayment rejected');
select pg_temp.expect_error(format('update public.loans set principal_paise=1 where id=%L',current_setting('folio.loan_a')),'P0001','principal cannot erase recorded repayments');
insert into public.subscriptions(name,amount_paise,cadence,next_due_on) values('Fixture subscription',10000,'monthly',folio_private.today()+2);
insert into public.budgets(category_id,month,limit_paise) values(current_setting('folio.expense_a')::uuid,date_trunc('month',folio_private.today())::date,100000);
with g as (insert into public.savings_goals(name,target_paise) values('Fixture goal',200000) returning id) select set_config('folio.goal_a',id::text,true) from g;
select public.set_goal_allocation(current_setting('folio.goal_a')::uuid,current_setting('folio.account_a')::uuid,75000);
select pg_temp.expect_error(format('select public.set_goal_allocation(%L,%L,250000)',current_setting('folio.goal_a'),current_setting('folio.account_a')),'P0001','allocation cannot exceed target');
select pg_temp.expect_error(format('select public.set_goal_allocation(%L,%L,150000)',current_setting('folio.goal_a'),current_setting('folio.account_a2')),'P0001','allocation cannot exceed account funds');
select pg_temp.expect_error(format('update public.savings_goals set target_paise=1 where id=%L',current_setting('folio.goal_a')),'P0001','goal target cannot erase allocation');
select pg_temp.assert_true((public.workspace_snapshot()->'summary'->>'income_paise')::bigint=100000,'transfers do not count as income');
select pg_temp.assert_true((public.workspace_snapshot()->'summary'->>'expense_paise')::bigint=25000,'subscriptions forecasts and loan principal are not duplicate living expenses');
select pg_temp.assert_true((public.workspace_snapshot()->'summary'->>'loan_payments_paise')::bigint=55000,'debt cash outflow includes principal and interest once');
select pg_temp.assert_true((public.workspace_snapshot()->'summary'->>'liquid_cash_paise')::bigint=945000,'allocations earmark existing money, not new assets');
select pg_temp.assert_true((public.workspace_snapshot()->'summary'->>'net_worth_paise')::bigint=570000,'net worth includes remaining loan liability once');
select pg_temp.assert_true((public.workspace_snapshot()->'loans'->0->>'outstanding_paise')::bigint=450000,'principal repayment reduces outstanding loan');
select pg_temp.assert_true((public.workspace_snapshot()->'budgets'->0->>'spent_paise')::bigint=25000,'budget spending derives from settled expenses');
select public.record_entry(current_setting('folio.account_a')::uuid,current_setting('folio.expense_a')::uuid,'expense',30000,folio_private.today(),'Edited fixture',current_setting('folio.expense_entry_a')::uuid);
select pg_temp.assert_true((public.workspace_snapshot()->'summary'->>'expense_paise')::bigint=30000,'editing an entry recalculates summary');
select public.record_entry(current_setting('folio.account_a')::uuid,current_setting('folio.expense_a')::uuid,'expense',25000,folio_private.today(),'Fixture expense',current_setting('folio.expense_entry_a')::uuid);
-- Retry safety is enforced at the server, not just by disabling a submit button.
select set_config('folio.retry_entry_key',gen_random_uuid()::text,true);
select set_config('folio.retry_entry',public.record_entry(current_setting('folio.account_a')::uuid,current_setting('folio.income_a')::uuid,'income',100,folio_private.today(),'Retry fixture',null,current_setting('folio.retry_entry_key')::uuid)::text,true);
select pg_temp.assert_true(public.record_entry(current_setting('folio.account_a')::uuid,current_setting('folio.income_a')::uuid,'income',100,folio_private.today(),'Retry fixture',null,current_setting('folio.retry_entry_key')::uuid)=current_setting('folio.retry_entry')::uuid,'entry retries return the original ID');
select pg_temp.assert_true((select count(*)=1 from public.transactions where id=current_setting('folio.retry_entry')::uuid),'entry retry does not duplicate cash');
select pg_temp.expect_error(format('select public.record_entry(%L,%L,%L,200,%L,%L,null,%L)',current_setting('folio.account_a'),current_setting('folio.income_a'),'income',folio_private.today(),'Retry fixture',current_setting('folio.retry_entry_key')),'P0001','request key cannot be reused for changed data');
select public.delete_entry(current_setting('folio.retry_entry')::uuid);
select set_config('folio.retry_transfer_key',gen_random_uuid()::text,true);
select set_config('folio.retry_transfer',public.record_transfer(current_setting('folio.account_a')::uuid,current_setting('folio.account_a2')::uuid,100,folio_private.today(),'Retry transfer',current_setting('folio.retry_transfer_key')::uuid)::text,true);
select pg_temp.assert_true(public.record_transfer(current_setting('folio.account_a')::uuid,current_setting('folio.account_a2')::uuid,100,folio_private.today(),'Retry transfer',current_setting('folio.retry_transfer_key')::uuid)=current_setting('folio.retry_transfer')::uuid,'transfer retry returns original group');
select pg_temp.assert_true((select count(*)=2 from public.transactions where transfer_id=current_setting('folio.retry_transfer')::uuid),'transfer retry keeps exactly two legs');
select set_config('folio.retry_delete_entry',(select id::text from public.transactions where transfer_id=current_setting('folio.retry_transfer')::uuid limit 1),true);
select set_config('folio.retry_delete_key',gen_random_uuid()::text,true);
select public.delete_entry(current_setting('folio.retry_delete_entry')::uuid,current_setting('folio.retry_delete_key')::uuid);
select public.delete_entry(current_setting('folio.retry_delete_entry')::uuid,current_setting('folio.retry_delete_key')::uuid);
select pg_temp.assert_true((select count(*)=0 from public.transactions where transfer_id=current_setting('folio.retry_transfer')::uuid),'deletion retry succeeds without reposting entries');
select set_config('folio.retry_payment_key',gen_random_uuid()::text,true);
select set_config('folio.retry_payment',public.record_loan_payment(current_setting('folio.loan_a')::uuid,current_setting('folio.account_a')::uuid,100,10,folio_private.today(),'Retry payment',current_setting('folio.retry_payment_key')::uuid)::text,true);
select pg_temp.assert_true(public.record_loan_payment(current_setting('folio.loan_a')::uuid,current_setting('folio.account_a')::uuid,100,10,folio_private.today(),'Retry payment',current_setting('folio.retry_payment_key')::uuid)=current_setting('folio.retry_payment')::uuid,'repayment retry returns original cash entry');
select pg_temp.assert_true((select count(*)=1 from public.loan_payments where transaction_id=current_setting('folio.retry_payment')::uuid),'repayment retry does not reduce principal twice');
select public.delete_entry(current_setting('folio.retry_payment')::uuid);
select pg_temp.expect_error('select * from folio_private.mutation_receipts','42501','receipt hashes are not available through the client role');
update public.accounts set archived_at=now() where id=current_setting('folio.account_a')::uuid;
select public.set_goal_allocation(current_setting('folio.goal_a')::uuid,current_setting('folio.account_a')::uuid,0);
select pg_temp.assert_true((select count(*)=0 from public.goal_allocations),'earmarks can be released after archiving an account');
update public.accounts set archived_at=null where id=current_setting('folio.account_a')::uuid;
select public.set_goal_allocation(current_setting('folio.goal_a')::uuid,current_setting('folio.account_a')::uuid,75000);

-- All ten tables contain fixtures for A; B cannot select, update, delete, or associate them.
select set_config('request.jwt.claim.sub',current_setting('folio.user_b'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('folio.user_b'),'role','authenticated','is_anonymous',false)::text,true);
select public.initialize_workspace();
with a as (insert into public.accounts(name,type,opening_date) values('B bank','bank',folio_private.today()-30) returning id) select set_config('folio.account_b',id::text,true) from a;
select set_config('folio.income_b',(select id::text from public.categories where name='Salary'),true);
do $$ declare t text; n bigint; col text; owner_col text; begin
 foreach t in array array['profiles','accounts','categories','transactions','loans','loan_payments','subscriptions','budgets','savings_goals','goal_allocations'] loop
  owner_col:=case when t='profiles' then 'id' else 'user_id' end;
  execute format('select count(*) from public.%I where %I=$1',t,owner_col) into n using current_setting('folio.user_a')::uuid;
  perform pg_temp.assert_true(n=0,'B cannot read A '||t);
  if t in ('profiles','accounts','categories','loans','subscriptions','budgets','savings_goals') then
   col:=case when t='profiles' then 'display_name' when t='budgets' then 'limit_paise' else 'name' end;
   execute format('update public.%I set %I=%I where %I=$1',t,col,col,owner_col) using current_setting('folio.user_a')::uuid;
   get diagnostics n=row_count;
   perform pg_temp.assert_true(n=0,'B cannot update A '||t);
  end if;
  if t='subscriptions' then
   perform pg_temp.expect_error(format('delete from public.subscriptions where user_id=%L',current_setting('folio.user_a')),'42501','subscription deletion requires reviewed RPC');
  end if;
  if t in ('categories','budgets','savings_goals') then
   execute format('delete from public.%I where user_id=$1',t) using current_setting('folio.user_a')::uuid;
   get diagnostics n=row_count;
   perform pg_temp.assert_true(n=0,'B cannot delete A '||t);
  end if;
 end loop;
end $$;
select pg_temp.expect_error(format('insert into public.profiles(id) values(%L)',current_setting('folio.user_a')),'42501','B cannot create A profile');
select pg_temp.expect_error(format('insert into public.accounts(user_id,name,type,opening_date) values(%L,%L,%L,%L)',current_setting('folio.user_a'),'Attack','bank',folio_private.today()),'42501','B cannot create A account');
select pg_temp.expect_error(format('insert into public.categories(user_id,name,kind) values(%L,%L,%L)',current_setting('folio.user_a'),'Attack','income'),'42501','B cannot create A category');
select pg_temp.expect_error(format('insert into public.loans(user_id,name,principal_paise,apr,tenure_months,start_date) values(%L,%L,100,0,1,%L)',current_setting('folio.user_a'),'Attack',folio_private.today()),'42501','B cannot create A loan');
select pg_temp.expect_error(format('insert into public.subscriptions(user_id,name,amount_paise,cadence,next_due_on) values(%L,%L,100,%L,%L)',current_setting('folio.user_a'),'Attack','monthly',folio_private.today()),'42501','B cannot create A subscription');
select pg_temp.expect_error(format('insert into public.budgets(user_id,category_id,month,limit_paise) values(%L,%L,%L,100)',current_setting('folio.user_a'),current_setting('folio.expense_a'),date_trunc('month',folio_private.today())::date),'42501','B cannot create A budget');
select pg_temp.expect_error(format('insert into public.savings_goals(user_id,name,target_paise) values(%L,%L,100)',current_setting('folio.user_a'),'Attack'),'42501','B cannot create A goal');
select pg_temp.expect_error(format('update public.accounts set user_id=%L where id=%L',current_setting('folio.user_a'),current_setting('folio.account_b')),'42501','owner reassignment rejected');
select pg_temp.expect_error(format('insert into public.subscriptions(account_id,name,amount_paise,cadence,next_due_on) values(%L,%L,100,%L,%L)',current_setting('folio.account_a'),'Attack','monthly',folio_private.today()),'23503','foreign account ownership enforced');
select pg_temp.expect_error(format('insert into public.budgets(category_id,month,limit_paise) values(%L,%L,100)',current_setting('folio.expense_a'),date_trunc('month',folio_private.today())::date),'23503','foreign category ownership enforced');
select pg_temp.expect_error(format('select public.record_entry(%L,%L,%L,100,%L,%L)',current_setting('folio.account_a'),current_setting('folio.income_b'),'income',folio_private.today(),''),'42501','RPC cannot post to foreign account');
select pg_temp.expect_error(format('select public.record_entry(%L,%L,%L,100,%L,%L,%L)',current_setting('folio.account_b'),current_setting('folio.income_b'),'income',folio_private.today(),'',current_setting('folio.income_entry_a')),'42501','RPC cannot edit foreign entry');
select pg_temp.expect_error(format('select public.record_transfer(%L,%L,100,%L,%L)',current_setting('folio.account_b'),current_setting('folio.account_a'),folio_private.today(),''),'42501','RPC cannot transfer to foreign account');
select pg_temp.expect_error(format('select public.record_loan_payment(%L,%L,100,0,%L,%L)',current_setting('folio.loan_a'),current_setting('folio.account_b'),folio_private.today(),''),'42501','RPC cannot repay foreign loan');
select pg_temp.expect_error(format('select public.set_goal_allocation(%L,%L,100)',current_setting('folio.goal_a'),current_setting('folio.account_b')),'42501','RPC cannot allocate foreign goal');
select pg_temp.expect_error(format('select public.delete_entry(%L)',current_setting('folio.income_entry_a')),'42501','RPC cannot delete foreign entry');
select pg_temp.assert_true((public.workspace_snapshot()->'summary'->>'income_paise')::bigint=0,'B summary cannot include A income');
select pg_temp.assert_true((select count(*)=0 from public.transactions),'failed foreign transfer creates no half transfer');
-- Anonymous Auth users must not gain financial access through the authenticated role.
select set_config('request.jwt.claim.sub',current_setting('folio.user_a'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('folio.user_a'),'role','authenticated','is_anonymous',true)::text,true);
select pg_temp.assert_true((select count(*)=0 from public.accounts),'anonymous Auth identity cannot read financial data');
select pg_temp.expect_error('select public.initialize_workspace()','42501','anonymous Auth identity cannot initialize workspace');
-- Restore A and prove grouped deletions preserve accounting.
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('folio.user_a'),'role','authenticated','is_anonymous',false)::text,true);
select public.delete_entry(current_setting('folio.payment_a')::uuid);
select pg_temp.assert_true((select count(*)=0 from public.loan_payments),'deleting repayment removes its principal record');
select pg_temp.assert_true((public.workspace_snapshot()->'loans'->0->>'outstanding_paise')::bigint=500000,'deleting repayment restores principal');
select public.delete_entry((select id from public.transactions where transfer_id=current_setting('folio.transfer_a')::uuid limit 1));
select pg_temp.assert_true((select count(*)=0 from public.transactions where transfer_id=current_setting('folio.transfer_a')::uuid),'deleting transfer removes both legs');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
do $$ declare t text; fn regprocedure; begin
 foreach t in array array['profiles','accounts','categories','transactions','loans','loan_payments','subscriptions','budgets','savings_goals','goal_allocations'] loop
  perform pg_temp.assert_true(not has_table_privilege('anon','public.'||t,'SELECT'),'anonymous table ACL '||t);
  perform pg_temp.expect_error(format('select * from public.%I',t),'42501','anonymous read '||t);
 end loop;
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('initialize_workspace','workspace_snapshot','record_entry','record_transfer','record_loan_payment','set_goal_allocation','delete_entry') loop
  perform pg_temp.assert_true(not has_function_privilege('anon',fn,'EXECUTE'),'anonymous RPC ACL '||fn::text);
 end loop;
end $$;
reset role;
select 'PASS: '||current_setting('folio.assertions')||' isolation/accounting assertions; all fixtures rolled back.' as result;
rollback;
