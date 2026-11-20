-- DDL-free acceptance. Every generated Auth/financial fixture rolls back.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); account uuid; category uuid;
 saved uuid:=gen_random_uuid(); request uuid:=gen_random_uuid(); rows jsonb; result jsonb; n bigint;
begin
 insert into auth.users(id,email) values(a,'phase3-'||a::text||'@example.invalid'),(b,'phase3-'||b::text||'@example.invalid');
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','is_anonymous',false)::text,true);
 execute 'set local role authenticated';
 perform public.initialize_workspace();
 insert into public.accounts(name,type,opening_balance_paise,opening_date) values('Disposable Phase 3 account','cash',1000000,folio_private.today()-1) returning id into account;
 select id into category from public.categories where kind='expense' and name='Food & groceries';
 insert into public.saved_simulations(id,name,price_paise,apr,tenure_months,delay_months,payment_method,income_paise,expenses_paise,existing_emi_paise,liquid_cash_paise,reserve_paise)
 values(saved,'Disposable comparison',5000029,12.125,18,6,'emi',5000000,2000000,0,1000000,100000);
 if not exists(select 1 from public.saved_simulations where id=saved and price_paise=5000029 and apr=12.125 and calculation_version=1) then raise exception 'Saved input precision failed'; end if;
 rows:=jsonb_build_array(jsonb_build_object('occurred_on',folio_private.today(),'kind','expense','amount_paise',10029,'category_id',category,'description','Disposable CSV expense'));
 rows:=rows||rows;
 if public.preview_csv_import(account,rows)->'duplicates'<>'[false,true]'::jsonb then raise exception 'Duplicate preview failed'; end if;
 if (select count(*) from public.transactions)<>0 then raise exception 'Preview wrote a ledger row'; end if;
 result:=public.import_csv_entries(account,rows,request);
 if result<>'{"inserted":1,"skipped":1}'::jsonb then raise exception 'Atomic import counts failed'; end if;
 if public.import_csv_entries(account,rows,request)<>result or (select count(*) from public.transactions)<>1 then raise exception 'Import retry reposted'; end if;
 if (public.workspace_snapshot()->'summary'->>'liquid_cash_paise')::bigint<>989971 then raise exception 'Imported cash balance failed'; end if;
 if not exists(select 1 from public.saved_simulations where id=saved and liquid_cash_paise=1000000) then raise exception 'Original saved assumptions changed'; end if;
 begin
  perform public.import_csv_entries(account,jsonb_build_array((rows->0)||'{"amount_paise":1000000000000,"description":"Disposable range rejection"}'::jsonb),gen_random_uuid());
  raise exception 'Out-of-range batch was accepted';
 exception when numeric_value_out_of_range then null;
 end;
 if (select count(*) from public.transactions)<>1 then raise exception 'Rejected range left partial rows'; end if;
 begin update public.saved_simulations set name='Forbidden change' where id=saved; raise exception 'Immutable saved row was updated'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','is_anonymous',false)::text,true);
 if (select count(*) from public.saved_simulations)<>0 then raise exception 'B could read A saved comparisons'; end if;
 delete from public.saved_simulations where id=saved; get diagnostics n=row_count;
 if n<>0 then raise exception 'B could delete A comparison'; end if;
 begin perform public.import_csv_entries(account,rows,request); raise exception 'B could replay A import'; exception when insufficient_privilege then null; end;
 execute 'reset role'; execute 'set local role anon';
 begin perform public.preview_csv_import(account,rows); raise exception 'Anonymous preview was accepted'; exception when insufficient_privilege then null; end;
 execute 'reset role';
end $$;
rollback;
select 'PASS: hosted Phase 3 precision, frozen assumptions, import/duplicate/retry/range rollback, immutable records and owner/anonymous isolation; fixtures rolled back' as acceptance;
