-- Synthetic-only disposable and hosted-compatible acceptance; all changes roll back.
begin;
create function pg_temp.gmail_assert(ok boolean,label text) returns void language plpgsql as $$begin
 if ok is not true then raise exception 'FAIL: %',label;end if;
 perform set_config('folio.gmail_checks',(coalesce(nullif(current_setting('folio.gmail_checks',true),''),'0')::int+1)::text,true);
end$$;
create function pg_temp.gmail_error(statement text,expected text,label text) returns void language plpgsql as $$begin
 begin execute statement;exception when others then
  if sqlstate<>expected then raise exception 'FAIL: % expected %, got %: %',label,expected,sqlstate,sqlerrm;end if;
  perform pg_temp.gmail_assert(true,label);return;
 end;raise exception 'FAIL: % accepted',label;
end$$;
with u as(insert into auth.users(id,email) values(gen_random_uuid(),'gmail-a@example.invalid') returning id) select set_config('folio.gmail_a',id::text,true) from u;
with u as(insert into auth.users(id,email) values(gen_random_uuid(),'gmail-b@example.invalid') returning id) select set_config('folio.gmail_b',id::text,true) from u;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('folio.gmail_a'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('folio.gmail_a'),'is_anonymous',false)::text,true);
select public.initialize_workspace();
update public.profiles set monthly_living_budget_paise=200000,monthly_income_paise=500000 where id=auth.uid();
with a as(insert into public.accounts(name,type,opening_balance_paise) values('Synthetic receipt bank','bank',1000000) returning id) select set_config('folio.gmail_bank',id::text,true) from a;
with s as(insert into public.subscriptions(name,amount_paise,cadence,next_due_on) values('Synthetic membership',10029,'monthly',folio_private.today()) returning id) select set_config('folio.gmail_sub',id::text,true) from s;
select set_config('folio.gmail_category',(select id::text from public.categories where kind='expense' limit 1),true);
insert into public.budgets(category_id,month,limit_paise) values(current_setting('folio.gmail_category')::uuid,date_trunc('month',folio_private.today())::date,100000);
select pg_temp.gmail_error('select public.gmail_service(''due'',null)','42501','client cannot call backend protocol');
select pg_temp.gmail_error('select * from folio_private.gmail_credentials','42501','client cannot read credentials');
select pg_temp.gmail_error('select * from folio_private.gmail_oauth_states','42501','client cannot read OAuth state');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('folio.gmail_generation',(public.gmail_service('start',current_setting('folio.gmail_a')::uuid,'{"hash":"synthetic-state-hash","verifier":"v1.synthetic-pkce"}')->>'generation'),true);
select pg_temp.gmail_assert(public.gmail_service('consume_state',null,'{"hash":"unknown"}') is null,'unknown state rejected');
select pg_temp.gmail_assert(public.gmail_service('consume_state',null,'{"hash":"synthetic-state-hash"}')->>'user_id'=current_setting('folio.gmail_a'),'state tied to initiating owner');
select pg_temp.gmail_assert(public.gmail_service('consume_state',null,'{"hash":"synthetic-state-hash"}') is null,'state single-use');
select public.gmail_service('connect',current_setting('folio.gmail_a')::uuid,jsonb_build_object('generation',current_setting('folio.gmail_generation'),'ciphertext','v1.synthetic-encrypted-refresh','mailbox','fixture@example.invalid'));
select set_config('folio.gmail_lease',public.gmail_service('lease',current_setting('folio.gmail_a')::uuid)->>'lease',true);
select pg_temp.gmail_assert(public.gmail_service('lease',current_setting('folio.gmail_a')::uuid) is null,'overlapping sync denied');
select set_config('folio.gmail_row',jsonb_build_array(jsonb_build_object('message_id','abc123','dedupe_key','Uber:charge:SYNTHETIC-123','merchant','Uber','amount_paise',10029,'occurred_on',current_date,'kind','charge','reference','SYNTHETIC-123'))::text,true);
select public.gmail_service('ingest',current_setting('folio.gmail_a')::uuid,jsonb_build_object('lease',current_setting('folio.gmail_lease'),'rows',current_setting('folio.gmail_row')::jsonb));
select public.gmail_service('ingest',current_setting('folio.gmail_a')::uuid,jsonb_build_object('lease',current_setting('folio.gmail_lease'),'rows',current_setting('folio.gmail_row')::jsonb));
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('folio.gmail_a'),'is_anonymous',false)::text,true);
select set_config('folio.gmail_receipt',(select id::text from public.gmail_receipts),true);
select pg_temp.gmail_assert((select count(*)=1 from public.gmail_receipts),'repeated page creates one receipt');
select pg_temp.gmail_assert((select count(*)=0 from public.transactions),'sync never posts money');
select pg_temp.gmail_assert((public.gmail_plan_status()->>'pending')::int=1,'plan shows pending receipt count');
select pg_temp.gmail_assert((public.workspace_snapshot()->'summary'->>'expense_paise')::bigint=0,'draft excluded from expenses');
select pg_temp.gmail_error('update public.gmail_receipts set status=''posted''','42501','direct client mutation denied');
select set_config('folio.gmail_entry',public.review_gmail_receipt(current_setting('folio.gmail_receipt')::uuid,'post',current_setting('folio.gmail_bank')::uuid,current_setting('folio.gmail_category')::uuid,10029,folio_private.today(),current_setting('folio.gmail_sub')::uuid)::text,true);
select pg_temp.gmail_assert(public.review_gmail_receipt(current_setting('folio.gmail_receipt')::uuid,'post',current_setting('folio.gmail_bank')::uuid,current_setting('folio.gmail_category')::uuid,10029,folio_private.today())=current_setting('folio.gmail_entry')::uuid,'posting retry returns same expense');
select pg_temp.gmail_assert((select count(*)=1 from public.transactions),'one expense after repeat confirmation');
select pg_temp.gmail_assert((public.workspace_snapshot()->'summary'->>'expense_paise')::bigint=10029,'confirmed receipt enters settled expense once');
select pg_temp.gmail_assert((public.gmail_plan_status()->>'subscription_paid_paise')::bigint=10029,'linked charge is a subset of settled expense');
select pg_temp.gmail_assert((public.gmail_plan_status()->>'pending')::int=0,'posted receipt no longer pending');
select pg_temp.gmail_assert((select amount_paise=10029 from public.subscriptions),'receipt does not change subscription forecast');
select pg_temp.gmail_assert((public.workspace_snapshot()->'budgets'->0->>'spent_paise')::bigint=10029,'receipt enters category budget once');
select pg_temp.gmail_assert((public.workspace_snapshot()->'profile'->>'monthly_living_budget_paise')::bigint=200000,'receipt does not rewrite monthly assumptions');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.gmail_service('ingest',current_setting('folio.gmail_a')::uuid,jsonb_build_object('lease',current_setting('folio.gmail_lease'),'rows',jsonb_build_array(
 jsonb_build_object('message_id','abc333','dedupe_key','Uber:refund:SYNTHETIC-123','merchant','Uber','amount_paise',10029,'occurred_on',current_date,'kind','refund','reference','SYNTHETIC-123'),
 jsonb_build_object('message_id','abc444','dedupe_key','Zomato:cancellation:SYNTHETIC-456','merchant','Zomato','amount_paise',5000,'occurred_on',current_date,'kind','cancellation','reference','SYNTHETIC-456'),
 jsonb_build_object('message_id','abc555','dedupe_key','Zomato:charge:SYNTHETIC-456','merchant','Zomato','amount_paise',5000,'occurred_on',current_date,'kind','charge','reference','SYNTHETIC-456'))));
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('folio.gmail_a'),'is_anonymous',false)::text,true);
select pg_temp.gmail_assert((select needs_attention from public.gmail_receipts where id=current_setting('folio.gmail_receipt')::uuid),'later refund flags an already posted charge for reconciliation');
select pg_temp.gmail_assert((select needs_attention from public.gmail_receipts where dedupe_key='Zomato:charge:SYNTHETIC-456'),'charge arriving after cancellation also needs reconciliation');
select pg_temp.gmail_assert((select count(*)=1 and sum(amount_paise)=-10029 from public.transactions),'refund/cancellation never silently reverses or reposts financial history');
select pg_temp.gmail_error(format('select public.review_gmail_receipt(%L,''post'',%L,%L,5000,folio_private.today())',(select id from public.gmail_receipts where dedupe_key='Zomato:charge:SYNTHETIC-456'),current_setting('folio.gmail_bank'),current_setting('folio.gmail_category')),'P0001','known cancellation prevents posting a pending charge');
select set_config('request.jwt.claim.sub',current_setting('folio.gmail_b'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('folio.gmail_b'),'is_anonymous',false)::text,true);
select pg_temp.gmail_assert((select count(*)=0 from public.gmail_receipts),'second owner cannot read receipts');
select pg_temp.gmail_assert((select count(*)=0 from public.gmail_connections),'second owner cannot read connection');
select pg_temp.gmail_error(format('select public.review_gmail_receipt(%L,''dismiss'')',current_setting('folio.gmail_receipt')),'42501','second owner cannot review receipt');
select set_config('request.jwt.claim.sub',current_setting('folio.gmail_a'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('folio.gmail_a'),'is_anonymous',true)::text,true);
select pg_temp.gmail_assert((select count(*)=0 from public.gmail_receipts),'anonymous JWT cannot read receipts');
select pg_temp.gmail_error('select public.gmail_plan_status()','42501','anonymous JWT cannot read plan receipt totals');
reset role;
-- Additional incoming messages: a same-order conflict, refund and an exact manual match.
insert into public.gmail_receipts(user_id,message_id,dedupe_key,merchant,amount_paise,occurred_on,kind)
 values(current_setting('folio.gmail_a')::uuid,'def456','Uber:charge:CONFLICT','Uber',10029,folio_private.today(),'charge'),
 (current_setting('folio.gmail_a')::uuid,'fed654','Uber:refund:REFUND','Uber',10029,folio_private.today(),'refund'),
 (current_setting('folio.gmail_a')::uuid,'bad123','Uber:charge:MANUAL','Uber',10029,folio_private.today(),'charge');
select set_config('folio.gmail_conflict',(select id::text from public.gmail_receipts where dedupe_key='Uber:charge:CONFLICT'),true);
select set_config('folio.gmail_refund',(select id::text from public.gmail_receipts where dedupe_key='Uber:refund:REFUND'),true);
select set_config('folio.gmail_manual',(select id::text from public.gmail_receipts where dedupe_key='Uber:charge:MANUAL'),true);
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.gmail_service('ingest',current_setting('folio.gmail_a')::uuid,jsonb_build_object('lease',current_setting('folio.gmail_lease'),'rows',jsonb_build_array(jsonb_build_object('message_id','def456','dedupe_key','Uber:charge:CONFLICT','merchant','Uber','amount_paise',20029,'occurred_on',current_date,'kind','charge','reference',''))));
select public.gmail_service('finish',current_setting('folio.gmail_a')::uuid,jsonb_build_object('lease',current_setting('folio.gmail_lease'),'status','connected','cursor',now(),'has_more',false));
select pg_temp.gmail_error(format('select public.gmail_service(''ingest'',%L,''{"rows":[]}'')',current_setting('folio.gmail_a')),'P0001','missing lease cannot ingest');
select pg_temp.gmail_error(format('select public.gmail_service(''ingest'',%L,%L)',current_setting('folio.gmail_a'),jsonb_build_object('lease',current_setting('folio.gmail_lease'),'rows','[]'::jsonb)::text),'P0001','released sync lease cannot write');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('folio.gmail_a'),'is_anonymous',false)::text,true);
select pg_temp.gmail_assert((select needs_attention and amount_paise=10029 from public.gmail_receipts where id=current_setting('folio.gmail_conflict')::uuid),'conflicting amount flags review without overwriting draft');
select pg_temp.gmail_error(format('select public.review_gmail_receipt(%L,''post'',%L,%L,10029,folio_private.today())',current_setting('folio.gmail_conflict'),current_setting('folio.gmail_bank'),current_setting('folio.gmail_category')),'P0001','conflicting draft blocked');
select pg_temp.gmail_error(format('select public.review_gmail_receipt(%L,''post'',%L,%L,10029,folio_private.today())',current_setting('folio.gmail_refund'),current_setting('folio.gmail_bank'),current_setting('folio.gmail_category')),'P0001','refund never posted as an expense');
select pg_temp.gmail_error(format('select public.review_gmail_receipt(%L,''post'',%L,%L,10029,folio_private.today())',current_setting('folio.gmail_manual'),current_setting('folio.gmail_bank'),current_setting('folio.gmail_category')),'23505','existing charge requires explicit linking');
select pg_temp.gmail_error(format('select public.review_gmail_receipt(%L,''post'',%L,%L,10029,folio_private.today()+1)',current_setting('folio.gmail_manual'),current_setting('folio.gmail_bank'),current_setting('folio.gmail_category')),'P0001','unsettled future expense rejected');
select public.review_gmail_receipt(current_setting('folio.gmail_manual')::uuid,'link',current_setting('folio.gmail_bank')::uuid,current_setting('folio.gmail_category')::uuid,10029,folio_private.today(),null,current_setting('folio.gmail_entry')::uuid);
select pg_temp.gmail_assert((select count(*)=1 from public.transactions),'link existing expense does not post another charge');
select public.review_gmail_receipt(current_setting('folio.gmail_refund')::uuid,'dismiss');
select pg_temp.gmail_assert((select status='dismissed' from public.gmail_receipts where id=current_setting('folio.gmail_refund')::uuid),'refund draft can be dismissed');
select public.delete_entry(current_setting('folio.gmail_entry')::uuid,gen_random_uuid());
select pg_temp.gmail_assert((select transaction_id is null and status='posted' from public.gmail_receipts where id=current_setting('folio.gmail_receipt')::uuid),'deleting ledger entry retains reconciled receipt without reposting');
select pg_temp.gmail_assert((public.gmail_plan_status()->>'subscription_paid_paise')::bigint=0,'deleting charge clears linked actual subscription total');
reset role;
with r as(insert into public.gmail_receipts(user_id,message_id,dedupe_key,merchant,amount_paise,occurred_on,kind)
 values(current_setting('folio.gmail_a')::uuid,'beef123','Uber:charge:RANGE','Uber',10030,current_date,'charge') returning id)
 select set_config('folio.gmail_range',id::text,true) from r;
set local role authenticated;
update public.accounts set opening_balance_paise=-1000000000000 where id=current_setting('folio.gmail_bank')::uuid;
select pg_temp.gmail_error(format('select public.review_gmail_receipt(%L,''post'',%L,%L,10030,folio_private.today())',current_setting('folio.gmail_range'),current_setting('folio.gmail_bank'),current_setting('folio.gmail_category')),'22003','unsupported derived totals roll back');
select pg_temp.gmail_assert((select status='pending' and transaction_id is null from public.gmail_receipts where id=current_setting('folio.gmail_range')::uuid),'range rejection leaves draft unposted');
select pg_temp.gmail_assert((select count(*)=0 from public.transactions),'range rejection leaves no partial expense');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.gmail_service('disconnect',current_setting('folio.gmail_a')::uuid);
select pg_temp.gmail_error(format('select public.gmail_service(''connect'',%L,%L)',current_setting('folio.gmail_a'),jsonb_build_object('generation',current_setting('folio.gmail_generation'),'ciphertext','v1.old','mailbox','fixture@example.invalid')::text),'P0001','old callback cannot restore a disconnected connection');
select public.gmail_service('forget',current_setting('folio.gmail_a')::uuid);
reset role;
select pg_temp.gmail_assert((select count(*)=0 from folio_private.gmail_credentials where user_id=current_setting('folio.gmail_a')::uuid),'disconnect deletes retained token');
select pg_temp.gmail_assert((select count(*)=0 from public.gmail_receipts where user_id=current_setting('folio.gmail_a')::uuid),'forget removes receipt details');
select pg_temp.gmail_assert((select count(*)=1 from public.subscriptions where user_id=current_setting('folio.gmail_a')::uuid),'forget retains approved subscriptions');
select current_setting('folio.gmail_checks')||' Gmail assertions passed';
rollback;
