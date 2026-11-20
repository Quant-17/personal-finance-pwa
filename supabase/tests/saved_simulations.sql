-- Disposable fixtures only. No emails, persistent users or financial records.
begin;
create function pg_temp.assert_saved(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FAIL: %',label; end if;
perform set_config('folio.saved_assertions',(coalesce(nullif(current_setting('folio.saved_assertions',true),''),'0')::int+1)::text,true);
end $$;
create function pg_temp.saved_error(statement text, expected text, label text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then
  if sqlstate<>expected then raise exception 'FAIL: %, expected %, got %: %',label,expected,sqlstate,sqlerrm; end if;
  perform pg_temp.assert_saved(true,label); return;
 end;
 raise exception 'FAIL: % was accepted',label;
end $$;
with u as (insert into auth.users(id,email) values(gen_random_uuid(),'saved-a@example.invalid') returning id) select set_config('folio.saved_a',id::text,true) from u;
with u as (insert into auth.users(id,email) values(gen_random_uuid(),'saved-b@example.invalid') returning id) select set_config('folio.saved_b',id::text,true) from u;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('folio.saved_a'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('folio.saved_a'),'role','authenticated','is_anonymous',false)::text,true);
select public.initialize_workspace();
select set_config('folio.saved_before',(public.workspace_snapshot()->'summary')::text,true);
with s as (
 insert into public.saved_simulations(name,price_paise,apr,tenure_months,delay_months,payment_method,income_paise,expenses_paise,existing_emi_paise,liquid_cash_paise,reserve_paise)
 values('Fixture laptop',5000029,12.125,18,6,'emi',9000000,3000000,1000000,20000000,15000000) returning *
) select set_config('folio.saved_id',id::text,true),set_config('folio.saved_payload',to_jsonb(s)::text,true) from s;
select pg_temp.assert_saved((select user_id=current_setting('folio.saved_a')::uuid and price_paise=5000029 and apr=12.125 and calculation_version=1 from public.saved_simulations where id=current_setting('folio.saved_id')::uuid),'owner and exact inputs retained');
insert into public.saved_simulations select * from jsonb_populate_record(null::public.saved_simulations,current_setting('folio.saved_payload')::jsonb) on conflict(id) do nothing;
select pg_temp.assert_saved((select count(*)=1 from public.saved_simulations),'retry UUID cannot create a duplicate');
select pg_temp.assert_saved((public.workspace_snapshot()->'summary')::text=current_setting('folio.saved_before'),'saving does not change financial summary');
select pg_temp.saved_error(format('update public.saved_simulations set name=%L where id=%L','Changed',current_setting('folio.saved_id')),'42501','saved assumptions are immutable');
-- Every invalid payload starts from a valid snapshot and a fresh ID.
do $$ declare changes jsonb; begin
 foreach changes in array array[
  '{"name":" "}'::jsonb,'{"price_paise":0}','{"price_paise":1000000001}',
  '{"apr":61}','{"tenure_months":0}','{"delay_months":5}',
  '{"payment_method":"other"}','{"income_paise":-1}',
  '{"liquid_cash_paise":1000000000001}','{"calculation_version":2}'
 ] loop
  perform pg_temp.saved_error(format('insert into public.saved_simulations select * from jsonb_populate_record(null::public.saved_simulations,%L::jsonb)',current_setting('folio.saved_payload')::jsonb || jsonb_build_object('id',gen_random_uuid()) || changes),'23514','invalid comparison rejected: '||changes::text);
 end loop;
end $$;
select set_config('request.jwt.claim.sub',current_setting('folio.saved_b'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('folio.saved_b'),'role','authenticated','is_anonymous',false)::text,true);
select pg_temp.assert_saved((select count(*)=0 from public.saved_simulations),'B cannot read A comparisons');
with d as (delete from public.saved_simulations where id=current_setting('folio.saved_id')::uuid returning id) select pg_temp.assert_saved(count(*)=0,'B cannot delete A comparison') from d;
select pg_temp.saved_error(format('insert into public.saved_simulations select * from jsonb_populate_record(null::public.saved_simulations,%L::jsonb)',current_setting('folio.saved_payload')::jsonb || jsonb_build_object('id',gen_random_uuid())),'42501','B cannot insert for A');
select set_config('request.jwt.claim.sub',current_setting('folio.saved_a'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('folio.saved_a'),'role','authenticated','is_anonymous',true)::text,true);
select pg_temp.assert_saved((select count(*)=0 from public.saved_simulations),'anonymous auth user cannot read snapshots');
select pg_temp.saved_error(format('insert into public.saved_simulations select * from jsonb_populate_record(null::public.saved_simulations,%L::jsonb)',current_setting('folio.saved_payload')::jsonb || jsonb_build_object('id',gen_random_uuid())),'42501','anonymous auth user cannot save snapshots');
set local role anon;
select pg_temp.saved_error('select * from public.saved_simulations','42501','signed-out API role has no access');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('folio.saved_a'),'role','authenticated','is_anonymous',false)::text,true);
delete from public.saved_simulations where id=current_setting('folio.saved_id')::uuid;
select pg_temp.assert_saved((select count(*)=0 from public.saved_simulations),'owner can delete comparison');
select pg_temp.assert_saved((public.workspace_snapshot()->'summary')::text=current_setting('folio.saved_before'),'deleting does not change financial summary');
reset role;
do $$ begin raise notice 'PASS: % saved simulation assertions',current_setting('folio.saved_assertions'); end $$;
rollback;
