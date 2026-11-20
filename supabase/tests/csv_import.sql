-- Disposable, rolled-back fixtures. No hosted bootstrap or real files.
begin;
create function pg_temp.csv_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FAIL: %',label; end if;
perform set_config('folio.csv_assertions',(coalesce(nullif(current_setting('folio.csv_assertions',true),''),'0')::int+1)::text,true);
end $$;
create function pg_temp.csv_error(statement text,expected text,label text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then
  if sqlstate<>expected then raise exception 'FAIL: %, expected %, got %: %',label,expected,sqlstate,sqlerrm; end if;
  perform pg_temp.csv_assert(true,label); return;
 end;
 raise exception 'FAIL: % was accepted',label;
end $$;
with u as (insert into auth.users(id,email) values(gen_random_uuid(),'csv-a@example.invalid') returning id) select set_config('folio.csv_a',id::text,true) from u;
with u as (insert into auth.users(id,email) values(gen_random_uuid(),'csv-b@example.invalid') returning id) select set_config('folio.csv_b',id::text,true) from u;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('folio.csv_b'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('folio.csv_b'),'role','authenticated','is_anonymous',false)::text,true);
select public.initialize_workspace();
with a as (insert into public.accounts(name,type,opening_date) values('B import','cash',folio_private.today()-30) returning id) select set_config('folio.csv_account_b',id::text,true) from a;
select set_config('folio.csv_category_b',(select id::text from public.categories where name='Food & groceries'),true);
select set_config('request.jwt.claim.sub',current_setting('folio.csv_a'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('folio.csv_a'),'role','authenticated','is_anonymous',false)::text,true);
select public.initialize_workspace();
with a as (insert into public.accounts(name,type,opening_balance_paise,opening_date) values('A import','cash',1000000,folio_private.today()-30) returning id) select set_config('folio.csv_account',id::text,true) from a;
select set_config('folio.csv_category',(select id::text from public.categories where name='Food & groceries'),true);
select set_config('folio.csv_row',jsonb_build_object('occurred_on',folio_private.today(),'kind','expense','amount_paise',10029,'category_id',current_setting('folio.csv_category'),'description','CSV lunch')::text,true);
select set_config('folio.csv_rows',jsonb_build_array(current_setting('folio.csv_row')::jsonb,current_setting('folio.csv_row')::jsonb)::text,true);
select set_config('folio.csv_request',gen_random_uuid()::text,true);
select pg_temp.csv_assert(public.preview_csv_import(current_setting('folio.csv_account')::uuid,current_setting('folio.csv_rows')::jsonb)->'duplicates'='[false,true]'::jsonb,'preview detects repeated rows');
select pg_temp.csv_assert((select count(*)=0 from public.transactions),'preview posts nothing');
select pg_temp.csv_assert(public.import_csv_entries(current_setting('folio.csv_account')::uuid,current_setting('folio.csv_rows')::jsonb,current_setting('folio.csv_request')::uuid)='{"inserted":1,"skipped":1}'::jsonb,'batch posts once and skips repeated row');
select pg_temp.csv_assert(public.import_csv_entries(current_setting('folio.csv_account')::uuid,current_setting('folio.csv_rows')::jsonb,current_setting('folio.csv_request')::uuid)='{"inserted":1,"skipped":1}'::jsonb,'unchanged retry returns original counts');
select pg_temp.csv_assert((select count(*)=1 from public.transactions),'retry does not repost');
select pg_temp.csv_assert(public.import_csv_entries(current_setting('folio.csv_account')::uuid,current_setting('folio.csv_rows')::jsonb,gen_random_uuid())='{"inserted":0,"skipped":2}'::jsonb,'new import request skips existing entries');
select pg_temp.csv_assert((public.workspace_snapshot()->'summary'->>'expense_paise')::bigint=10029,'expenses affect summary once');
select pg_temp.csv_error(format('select public.import_csv_entries(%L,%L,%L)',current_setting('folio.csv_account'),jsonb_build_array(current_setting('folio.csv_row')::jsonb),current_setting('folio.csv_request')),'P0001','changed retry payload rejected');

-- Preview can become stale. Import rechecks live ledger inside the account lock.
select set_config('folio.csv_stale',jsonb_build_array(current_setting('folio.csv_row')::jsonb||'{"description":"Stale preview","amount_paise":200}'::jsonb)::text,true);
select pg_temp.csv_assert(public.preview_csv_import(current_setting('folio.csv_account')::uuid,current_setting('folio.csv_stale')::jsonb)->'duplicates'='[false]'::jsonb,'new row previews ready');
select public.record_entry(current_setting('folio.csv_account')::uuid,current_setting('folio.csv_category')::uuid,'expense',200,folio_private.today(),'Stale preview');
select pg_temp.csv_assert(public.import_csv_entries(current_setting('folio.csv_account')::uuid,current_setting('folio.csv_stale')::jsonb,gen_random_uuid())='{"inserted":0,"skipped":1}'::jsonb,'stale preview cannot duplicate manual entry');

do $$ declare changes jsonb; invalid jsonb; begin
 foreach changes in array array[
  '{"amount_paise":0}'::jsonb,'{"amount_paise":-1}','{"amount_paise":1.5}','{"amount_paise":1000000000001}',
  '{"kind":"transfer"}','{"kind":"loan_payment"}','{"description":null}',
  jsonb_build_object('description',repeat('x',241)),jsonb_build_object('occurred_on',folio_private.today()+1),
  '{"extra":"not allowed"}'
 ] loop
  invalid:=jsonb_build_array(current_setting('folio.csv_row')::jsonb||'{"description":"Must roll back"}'::jsonb,current_setting('folio.csv_row')::jsonb||changes);
  perform pg_temp.csv_error(format('select public.import_csv_entries(%L,%L,gen_random_uuid())',current_setting('folio.csv_account'),invalid),'P0001','invalid batch rejected: '||changes::text);
 end loop;
end $$;
select pg_temp.csv_assert((select count(*)=2 from public.transactions),'one invalid row leaves every row unposted');
select pg_temp.csv_error(format('select public.preview_csv_import(%L,%L)',current_setting('folio.csv_account'),'[]'),'P0001','empty batch rejected');
select pg_temp.csv_error(format('select public.preview_csv_import(%L,%L)',current_setting('folio.csv_account'),'{}'),'P0001','nonarray rejected');
select pg_temp.csv_error(format('select public.preview_csv_import(%L,%L)',current_setting('folio.csv_account'),(select jsonb_agg(current_setting('folio.csv_row')::jsonb) from generate_series(1,501))),'P0001','oversized row count rejected');
select pg_temp.csv_error(format('select public.preview_csv_import(%L,%L)',current_setting('folio.csv_account'),jsonb_build_array(current_setting('folio.csv_row')::jsonb||jsonb_build_object('description',repeat('x',1048576)))),'P0001','oversized payload rejected');
select pg_temp.csv_error(format('select public.import_csv_entries(%L,%L,null)',current_setting('folio.csv_account'),current_setting('folio.csv_rows')),'P0001','null request rejected');
select pg_temp.csv_error(format('select public.preview_csv_import(%L,%L)',current_setting('folio.csv_account_b'),current_setting('folio.csv_rows')),'42501','foreign account rejected');
select pg_temp.csv_error(format('select public.preview_csv_import(%L,%L)',current_setting('folio.csv_account'),jsonb_build_array(current_setting('folio.csv_row')::jsonb||jsonb_build_object('category_id',current_setting('folio.csv_category_b')))),'42501','foreign category rejected');
select pg_temp.csv_error(format('select public.preview_csv_import(%L,%L)',current_setting('folio.csv_account'),jsonb_build_array(current_setting('folio.csv_row')::jsonb||jsonb_build_object('occurred_on',folio_private.today()-31))),'42501','preopening date rejected');
-- Per-row valid amounts must not strand the dashboard outside its total range.
select set_config('folio.csv_income_category',(select id::text from public.categories where name='Salary'),true);
select pg_temp.csv_error(format('select public.import_csv_entries(%L,%L,gen_random_uuid())',current_setting('folio.csv_account'),jsonb_build_array(current_setting('folio.csv_row')::jsonb||jsonb_build_object('kind','income','amount_paise',1000000000000,'category_id',current_setting('folio.csv_income_category'),'description','Too large income'))),'22003','account/asset total overflow rolls back');
select pg_temp.csv_error(format('select public.import_csv_entries(%L,%L,gen_random_uuid())',current_setting('folio.csv_account'),jsonb_build_array(current_setting('folio.csv_row')::jsonb||'{"amount_paise":1000000000000,"description":"Too large expense"}'::jsonb)),'22003','monthly expense overflow rolls back');
select pg_temp.csv_assert((select count(*)=2 from public.transactions),'range rejection retains original ledger only');
update public.accounts set archived_at=now() where id=current_setting('folio.csv_account')::uuid;
select pg_temp.csv_error(format('select public.preview_csv_import(%L,%L)',current_setting('folio.csv_account'),current_setting('folio.csv_rows')),'42501','archived account rejected');
-- Completed receipt remains retry-safe even if the account has since been archived.
select pg_temp.csv_assert(public.import_csv_entries(current_setting('folio.csv_account')::uuid,current_setting('folio.csv_rows')::jsonb,current_setting('folio.csv_request')::uuid)='{"inserted":1,"skipped":1}'::jsonb,'completed retry needs no repost after archiving');
select pg_temp.csv_error('select * from folio_private.csv_import_receipts','42501','receipt contents remain private');
select pg_temp.csv_error(format('select folio_private.csv_rows(%L,%L)',current_setting('folio.csv_account'),current_setting('folio.csv_rows')),'42501','validation helper has no direct client privilege');
select set_config('request.jwt.claim.sub',current_setting('folio.csv_b'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('folio.csv_b'),'role','authenticated','is_anonymous',false)::text,true);
select pg_temp.csv_error(format('select public.import_csv_entries(%L,%L,%L)',current_setting('folio.csv_account'),current_setting('folio.csv_rows'),current_setting('folio.csv_request')),'42501','B cannot replay A receipt');
select set_config('request.jwt.claim.sub',current_setting('folio.csv_a'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('folio.csv_a'),'role','authenticated','is_anonymous',true)::text,true);
select pg_temp.csv_error(format('select public.import_csv_entries(%L,%L,gen_random_uuid())',current_setting('folio.csv_account'),current_setting('folio.csv_rows')),'42501','anonymous auth user rejected');
set local role anon;
select pg_temp.csv_error(format('select public.preview_csv_import(%L,%L)',current_setting('folio.csv_account'),current_setting('folio.csv_rows')),'42501','signed-out preview denied');
select pg_temp.csv_error(format('select public.import_csv_entries(%L,%L,gen_random_uuid())',current_setting('folio.csv_account'),current_setting('folio.csv_rows')),'42501','signed-out commit denied');
reset role;
do $$ begin raise notice 'PASS: % CSV import assertions',current_setting('folio.csv_assertions'); end $$;
rollback;
