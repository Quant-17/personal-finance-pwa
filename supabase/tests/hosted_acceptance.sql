-- DDL-free hosted smoke test. Transaction rolls back both generated Auth users and every financial fixture.
-- Run as the Supabase database administrator; never run bootstrap.sql on a hosted project.
begin;
do $$
declare
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); bank uuid; savings uuid; category uuid;
 loan uuid; goal uuid; tx uuid; retried uuid; request_id uuid:=gen_random_uuid(); transfer uuid;
 table_name text; visible_rows bigint; snapshot jsonb;
begin
 insert into auth.users(id,email) values(a,'folio-acceptance-a@example.invalid'),(b,'folio-acceptance-b@example.invalid');
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','is_anonymous',false)::text,true);
 execute 'set local role authenticated';
 perform public.initialize_workspace();
 insert into public.accounts(name,type,opening_balance_paise,opening_date) values('Disposable bank','bank',1000000,current_date-1) returning id into bank;
 insert into public.accounts(name,type,opening_balance_paise,opening_date) values('Disposable savings','savings',0,current_date-1) returning id into savings;
 select id into category from public.categories where kind='expense' limit 1;
 tx:=public.record_entry(bank,category,'expense',25000,current_date-1,'Disposable fixture',null,request_id);
 retried:=public.record_entry(bank,category,'expense',25000,current_date-1,'Disposable fixture',null,request_id);
 if tx<>retried or (select count(*) from public.transactions where id=tx)<>1 then raise exception 'Idempotent entry failed'; end if;
 transfer:=public.record_transfer(bank,savings,100000,current_date-1,'Disposable transfer',gen_random_uuid());
 if (select sum(amount_paise) from public.transactions where transfer_id=transfer)<>0 then raise exception 'Transfer balance failed'; end if;
 insert into public.loans(name,principal_paise,apr,tenure_months,start_date) values('Disposable loan',500000,12,12,current_date-1) returning id into loan;
 perform public.record_loan_payment(loan,bank,50000,5000,current_date-1,'Disposable payment',gen_random_uuid());
 insert into public.savings_goals(name,target_paise) values('Disposable goal',200000) returning id into goal;
 perform public.set_goal_allocation(goal,bank,75000,gen_random_uuid());
 snapshot:=public.workspace_snapshot();
 if (snapshot->'summary'->>'net_worth_paise')::bigint<>470000 then raise exception 'Net worth accounting failed'; end if;
 if (snapshot->'summary'->>'liquid_cash_paise')::bigint<>845000 then raise exception 'Earmarked cash accounting failed'; end if;
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','is_anonymous',false)::text,true);
 foreach table_name in array array['profiles','accounts','categories','transactions','loans','loan_payments','subscriptions','budgets','savings_goals','goal_allocations'] loop
   execute format('select count(*) from public.%I',table_name) into visible_rows;
   if visible_rows<>0 then raise exception 'Cross-user read leaked on %',table_name; end if;
 end loop;
 begin
   perform public.record_entry(bank,category,'expense',100,current_date-1,'Forbidden');
   raise exception 'Cross-user mutation was accepted';
 exception when insufficient_privilege then null;
 end;
 execute 'reset role'; execute 'set local role anon';
 begin perform public.workspace_snapshot(); raise exception 'Anonymous RPC was accepted'; exception when insufficient_privilege then null; end;
 execute 'reset role';
 raise notice 'PASS: hosted owner accounting, retry protection, ten-table cross-user reads, cross-user mutation and anonymous RPC isolation';
end $$;
rollback;
