-- Disposable CI only: recreate the historical integration inside a rollback transaction,
-- seed an approved ledger charge, then verify retirement preserves accounting.
begin;
\ir ../migrations/20261121112759_gmail_receipts.sql
create function pg_temp.removal_assert(ok boolean,label text) returns void language plpgsql as $$begin
 if ok is not true then raise exception 'FAIL: %',label;end if;end$$;
with u as(insert into auth.users(id,email) values(gen_random_uuid(),'retirement@example.invalid') returning id) select set_config('folio.removal_owner',id::text,true) from u;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('folio.removal_owner'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('folio.removal_owner'),'is_anonymous',false)::text,true);
select public.initialize_workspace();
with a as(insert into public.accounts(name,type,opening_balance_paise) values('Removal fixture bank','bank',500000) returning id)select set_config('folio.removal_account',id::text,true)from a;
select set_config('folio.removal_category',(select id::text from public.categories where kind='expense' limit 1),true);
select set_config('folio.removal_entry',public.record_entry(current_setting('folio.removal_account')::uuid,current_setting('folio.removal_category')::uuid,'expense',12345,folio_private.today(),'Previously confirmed charge',null,gen_random_uuid())::text,true);
with s as(insert into public.subscriptions(name,amount_paise,cadence,next_due_on) values('Keep this subscription',12345,'monthly',folio_private.today()) returning id)select set_config('folio.removal_sub',id::text,true)from s;
select set_config('folio.removal_before',(public.workspace_snapshot()->'summary')::text,true);
reset role;
insert into public.gmail_connections(user_id,status)values(current_setting('folio.removal_owner')::uuid,'connected');
insert into folio_private.gmail_credentials values(current_setting('folio.removal_owner')::uuid,'v1.synthetic-encrypted');
insert into public.gmail_receipts(user_id,message_id,dedupe_key,merchant,amount_paise,occurred_on,kind,status,transaction_id)
 values(current_setting('folio.removal_owner')::uuid,'abc123','Uber:charge:SYNTHETIC','Uber',12345,current_date,'charge','posted',current_setting('folio.removal_entry')::uuid);
insert into public.subscription_charges values(current_setting('folio.removal_entry')::uuid,current_setting('folio.removal_owner')::uuid,current_setting('folio.removal_sub')::uuid);
\ir ../migrations/20261121115333_remove_email_integration.sql
select pg_temp.removal_assert(to_regclass('public.gmail_receipts') is null and to_regclass('public.gmail_connections') is null,'mailbox metadata removed');
select pg_temp.removal_assert(to_regclass('folio_private.gmail_credentials') is null and to_regclass('folio_private.gmail_oauth_states') is null,'OAuth credential/state storage removed');
select pg_temp.removal_assert(to_regprocedure('public.gmail_service(text,uuid,jsonb)') is null and to_regprocedure('public.gmail_plan_status()') is null,'browser/backend email RPCs removed');
set local role authenticated;
select pg_temp.removal_assert((select count(*)=1 and sum(amount_paise)=-12345 from public.transactions),'confirmed ledger charge retained');
select pg_temp.removal_assert((select count(*)=1 from public.subscriptions),'subscription retained');
select pg_temp.removal_assert(public.workspace_snapshot()->'summary'=current_setting('folio.removal_before')::jsonb,'financial summaries unchanged');
select pg_temp.removal_assert((public.preview_csv_import(current_setting('folio.removal_account')::uuid,jsonb_build_array(jsonb_build_object('occurred_on',folio_private.today(),'kind','expense','amount_paise',12345,'category_id',current_setting('folio.removal_category'),'description','Previously confirmed charge')))->'duplicates'->>0)::boolean,'statement-compatible ledger duplicate path retained');
select 'PASS: email retirement removes access and metadata, preserves confirmed accounting';
rollback;
