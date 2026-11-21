-- Owner-requested V1 controls. Export is read-only; deletion requires a fresh password session.
-- No actual user is exported or deleted by this migration.
create function folio_private.portable_json(value jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb;
begin
 if jsonb_typeof(value)='object' then
  select coalesce(jsonb_object_agg(e.key,case when e.key~'_paise$' and jsonb_typeof(e.value)='number' then to_jsonb(e.value::text) else folio_private.portable_json(e.value) end),'{}'::jsonb) into result from jsonb_each(value)e;
  return result;
 elsif jsonb_typeof(value)='array' then
  select coalesce(jsonb_agg(folio_private.portable_json(e.value) order by e.ordinality),'[]'::jsonb) into result from jsonb_array_elements(value) with ordinality e;
  return result;
 end if;
 return value;
end $$;
create function folio_private.export_financial_data() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); table_name text; records jsonb; data jsonb:='{}'; result jsonb;
begin
 foreach table_name in array array['profiles','accounts','categories','transactions','loans','loan_payments','subscriptions','budgets','savings_goals','goal_allocations','loan_document_details','saved_simulations','investment_holdings','investment_entries','statement_rules'] loop
  execute format('select coalesce(jsonb_agg(folio_private.portable_json(to_jsonb(r)) order by to_jsonb(r)::text),''[]''::jsonb) from public.%I r where %I=$1',table_name,case when table_name='profiles' then 'id' else 'user_id' end) into records using owner_id;
  data:=data||jsonb_build_object(table_name,records);
 end loop;
 result:=jsonb_build_object('format','folio-financial-export','schema_version',1,'owner_id',owner_id,'exported_at',now(),'currency','INR','timezone','Asia/Kolkata','data',data);
 if octet_length(result::text)>20971520 then raise exception 'Export exceeds 20 MiB. Contact the project owner for a larger controlled export.' using errcode='54000'; end if;
 return result;
end $$;
create function public.export_financial_data() returns jsonb
language sql stable security invoker set search_path='' as $$select folio_private.export_financial_data()$$;

create function folio_private.delete_own_account(p_confirmation text) returns boolean
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); claims jsonb:=auth.jwt(); recent_password boolean:=false; session_uuid uuid;
begin
 if p_confirmation is distinct from 'DELETE MY ACCOUNT' then raise exception 'Type the exact deletion confirmation.' using errcode='42501'; end if;
 if claims->>'role' is distinct from 'authenticated' or jsonb_typeof(claims->'amr') is distinct from 'array'
  or coalesce(claims->>'session_id','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
  raise exception 'Confirm your password again before deleting your account.' using errcode='42501';
 end if;
 select exists(select 1 from jsonb_array_elements(claims->'amr') a where a->>'method'='password'
  and case when jsonb_typeof(a->'timestamp')='number' and a->>'timestamp'~'^[0-9]{1,12}$' then extract(epoch from now())-(a->>'timestamp')::numeric between 0 and 300 else false end) into recent_password;
 if not recent_password then raise exception 'A password sign-in within five minutes is required.' using errcode='42501'; end if;
 session_uuid:=(claims->>'session_id')::uuid;
 perform 1 from auth.sessions where id=session_uuid and user_id=owner_id and (not_after is null or not_after>now());
 if not found then raise exception 'The sign-in session is unavailable. Sign in again.' using errcode='42501'; end if;
 perform 1 from auth.users where id=owner_id and email_confirmed_at is not null;
 if not found then raise exception 'Confirmed account unavailable.' using errcode='42501'; end if;
 -- Match financial mutation lock order. FK cascades and deletion are one transaction.
 perform 1 from public.loans where user_id=owner_id order by id for update;
 perform 1 from public.accounts where user_id=owner_id order by id for update;
 delete from auth.users where id=owner_id;
 if not found then raise exception 'Account unavailable.' using errcode='42501'; end if;
 return true;
end $$;
create function public.delete_own_account(p_confirmation text) returns boolean
language sql security invoker set search_path='' as $$select folio_private.delete_own_account(p_confirmation)$$;
revoke all on function folio_private.portable_json(jsonb),folio_private.export_financial_data(),public.export_financial_data(),folio_private.delete_own_account(text),public.delete_own_account(text) from public,anon,authenticated;
grant execute on function folio_private.portable_json(jsonb),folio_private.export_financial_data(),public.export_financial_data(),folio_private.delete_own_account(text),public.delete_own_account(text) to authenticated;
notify pgrst,'reload schema';
