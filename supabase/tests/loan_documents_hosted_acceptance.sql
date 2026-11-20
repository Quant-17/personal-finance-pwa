-- DDL-free hosted acceptance. Run only after the reviewed migration is applied.
-- Generated .invalid users and financial fixtures roll back; no owner records are read.
begin;
do $$
declare
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); loan uuid; card uuid; bank uuid;
  terms jsonb; request uuid:=gen_random_uuid(); rev integer; result jsonb;
begin
  insert into auth.users(id,email) values(a,'loan-review-'||a::text||'@example.invalid'),(b,'loan-review-'||b::text||'@example.invalid');
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','is_anonymous',false)::text,true);
  execute 'set local role authenticated';
  perform public.initialize_workspace();
  terms:=jsonb_build_object('name','Disposable document loan','provider','credit_saison','source_sha256',repeat('a',64),'source_page_count',1,
    'original_principal_paise',1200000,'original_months',12,'nominal_rate',0,'disclosure_apr',3.25,'net_disbursed_paise',null,'fees_paise',null,
    'reported_emi_paise',100000,'current_outstanding_paise',600000,'remaining_months',6,'as_of',folio_private.today(),
    'paid_through',null,'first_due_on',null,'balance_basis','manual','card_account_id',null,'schedule_origin','none','schedule','[]'::jsonb,
    'source_pages',jsonb_build_object('principal',1,'rate',1,'apr',1,'emi',1,'tenure',1,'first_due',null));
  loan:=public.save_loan_document(null,0,terms,request);
  if public.save_loan_document(null,0,terms,request)<>loan or (select count(*) from public.loans)<>1 then raise exception 'Retry posted another loan'; end if;
  if not exists(select 1 from public.loan_document_details where loan_id=loan and revision=1 and details->>'disclosure_apr'='3.25') then raise exception 'Reviewed disclosure precision failed'; end if;
  result:=public.workspace_snapshot();
  if (result->'summary'->>'existing_emi_paise')::bigint<>100000 or (result->'loans'->0->>'outstanding_paise')::bigint<>600000
    or not (result->'loans'->0->>'has_document')::boolean then raise exception 'Quoted EMI/current principal snapshot failed'; end if;
  if (select count(*) from public.transactions)<>0 then raise exception 'Import posted historical transactions'; end if;
  begin perform public.save_loan_document(null,0,terms,gen_random_uuid()); raise exception 'Duplicate fingerprint accepted'; exception when unique_violation then null; end;
  if (select count(*) from public.loans)<>1 then raise exception 'Duplicate left an orphan loan'; end if;
  begin update public.loan_document_details set revision=9; raise exception 'Direct metadata write accepted'; exception when insufficient_privilege then null; end;
  begin perform public.save_loan_document(null,0,terms||'{"raw_text":"forbidden"}',gen_random_uuid()); raise exception 'Raw document field accepted' using errcode='XX000'; exception when raise_exception then null; end;
  insert into public.accounts(name,type,opening_balance_paise) values('Disposable card','credit_card',-600000) returning id into card;
  terms:=terms||jsonb_build_object('card_account_id',card);
  perform public.save_loan_document(loan,1,terms,gen_random_uuid());
  if (public.workspace_snapshot()->'summary'->>'net_worth_paise')::bigint<>-600000 then raise exception 'Card debt counted twice'; end if;
  begin perform public.record_loan_payment(loan,card,100000,0,folio_private.today(),'Disposable card repayment',gen_random_uuid()); raise exception 'Linked card accepted duplicate repayment' using errcode='XX000'; exception when raise_exception then null; end;
  if (select count(*) from public.transactions)<>0 then raise exception 'Rejected card repayment left a transaction'; end if;
  select revision into rev from public.loan_document_details where loan_id=loan;
  terms:=terms||'{"card_account_id":null}';
  perform public.save_loan_document(loan,rev,terms,gen_random_uuid());
  insert into public.accounts(name,type,opening_balance_paise) values('Disposable bank','bank',1000000) returning id into bank;
  select revision into rev from public.loan_document_details where loan_id=loan;
  perform public.record_loan_payment(loan,bank,100000,5000,folio_private.today(),'Disposable repayment',gen_random_uuid());
  begin perform public.save_loan_document(loan,rev,terms,gen_random_uuid()); raise exception 'Stale review accepted'; exception when serialization_failure then null; end;
  select revision into rev from public.loan_document_details where loan_id=loan;
  terms:=terms||'{"current_outstanding_paise":350000,"remaining_months":4}';
  perform public.save_loan_document(loan,rev,terms,gen_random_uuid());
  if not exists(select 1 from public.loans where id=loan and principal_paise=450000) or
    (public.workspace_snapshot()->'loans'->0->>'outstanding_paise')::bigint<>350000 or (select count(*) from public.transactions)<>1 then raise exception 'Balance correction did not preserve repayments'; end if;
  perform set_config('request.jwt.claim.sub',b::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','is_anonymous',false)::text,true);
  if exists(select 1 from public.loan_document_details) then raise exception 'Cross-owner document read accepted'; end if;
  begin perform public.save_loan_document(loan,rev,terms,gen_random_uuid()); raise exception 'Cross-owner update accepted'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','is_anonymous',true)::text,true);
  if exists(select 1 from public.loan_document_details) then raise exception 'Anonymous-auth document read accepted'; end if;
  begin perform public.save_loan_document(null,0,terms,gen_random_uuid()); raise exception 'Anonymous-auth import accepted'; exception when insufficient_privilege then null; end;
  execute 'reset role';execute 'set local role anon';
  begin perform public.save_loan_document(null,0,terms,gen_random_uuid()); raise exception 'Signed-out import accepted'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.loan_document_details; raise exception 'Signed-out read accepted'; exception when insufficient_privilege then null; end;
  execute 'reset role';
end $$;
rollback;
select 'PASS: loan-document precision, current balance, quoted EMI, retry, duplicate rollback, card liability, stale edits, repayment preservation and owner/anonymous isolation; all fixtures rolled back' as acceptance;
