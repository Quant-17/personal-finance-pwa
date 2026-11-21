-- PDF contents/passwords never reach PostgreSQL. Only confirmed entries + opaque source hashes.
create table folio_private.statement_rows (
 user_id uuid not null references auth.users(id) on delete cascade,
 account_id uuid not null,
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 source_row text not null check(source_row ~ '^[0-9]{1,2}:[0-9]{1,6}$'),
 created_at timestamptz not null default now(),
 primary key(user_id,account_id,source_sha256,source_row),
 foreign key(account_id,user_id) references public.accounts(id,user_id) on delete cascade
);
create table folio_private.statement_requests (
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, payload_hash text not null, result jsonb not null,
 primary key(user_id,request_id)
);
alter table folio_private.statement_rows enable row level security;
alter table folio_private.statement_requests enable row level security;
revoke all on folio_private.statement_rows,folio_private.statement_requests from public,anon,authenticated;
create function folio_private.statement_rows_valid(p_account uuid,p_rows jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare item jsonb; normalized jsonb; result jsonb:='[]'; seen text[]:='{}';
begin
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 or octet_length(p_rows::text)>1048576 then raise exception 'Review 1–500 rows within 1 MiB.'; end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(item) is distinct from 'object' or (select count(*) from jsonb_object_keys(item))<>2 or not item ?& array['source_row','entry'] or coalesce(item->>'source_row','')!~'^[0-9]{1,2}:[0-9]{1,6}$' or item->>'source_row'=any(seen) then raise exception 'Invalid or repeated source row.'; end if;
  normalized:=folio_private.csv_rows(p_account,jsonb_build_array(item->'entry'))->0;
  result:=result||jsonb_build_array(jsonb_build_object('source_row',item->>'source_row','entry',normalized));
  seen:=array_append(seen,item->>'source_row');
 end loop;
 return result;
end $$;
create function folio_private.statement_duplicate(p_owner uuid,p_account uuid,p_source text,item jsonb) returns boolean
language sql volatile set search_path='' as $$
 select exists(select 1 from folio_private.statement_rows where user_id=p_owner and account_id=p_account and source_sha256=p_source and source_row=item->>'source_row')
 or exists(select 1 from public.transactions t where t.user_id=p_owner and t.account_id=p_account and t.kind=item->'entry'->>'kind'
 and t.occurred_on=(item->'entry'->>'occurred_on')::date and t.description=item->'entry'->>'description'
 and t.amount_paise=case when item->'entry'->>'kind'='income' then (item->'entry'->>'amount_paise')::bigint else -(item->'entry'->>'amount_paise')::bigint end)
$$;
create function folio_private.preview_statement_import(p_account uuid,p_source_sha256 text,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); rows jsonb; item jsonb; seen text[]:='{}'; duplicates jsonb:='[]'; repeated boolean;
begin
 if p_source_sha256 is null or p_source_sha256!~'^[a-f0-9]{64}$' then raise exception 'Invalid document fingerprint.'; end if;
 rows:=folio_private.statement_rows_valid(p_account,p_rows);
 for item in select value from jsonb_array_elements(rows) loop
  repeated:=(item->'entry')::text=any(seen) or folio_private.statement_duplicate(owner_id,p_account,p_source_sha256,item);
  duplicates:=duplicates||jsonb_build_array(repeated); seen:=array_append(seen,(item->'entry')::text);
 end loop;
 return jsonb_build_object('duplicates',duplicates);
end $$;
create function public.preview_statement_import(p_account uuid,p_source_sha256 text,p_rows jsonb) returns jsonb
language sql security invoker set search_path='' as $$select folio_private.preview_statement_import(p_account,p_source_sha256,p_rows)$$;
create function folio_private.import_statement_entries(p_account uuid,p_source_sha256 text,p_rows jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); prior folio_private.statement_requests; digest text; rows jsonb; item jsonb; entry jsonb; inserted integer:=0; skipped integer:=0; result jsonb; snapshot jsonb;
begin
 if p_source_sha256 is null or p_source_sha256!~'^[a-f0-9]{64}$' or p_request_id is null or p_rows is null or octet_length(p_rows::text)>1048576 then raise exception 'Invalid statement import.'; end if;
 digest:=encode(sha256(convert_to(jsonb_build_array(p_account,p_source_sha256,p_rows)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||p_request_id::text,0));
 select * into prior from folio_private.statement_requests where user_id=owner_id and request_id=p_request_id;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request ID already used for a different selection.'; end if;
  return prior.result;
 end if;
 perform 1 from public.accounts where user_id=owner_id order by id for update;
 rows:=folio_private.statement_rows_valid(p_account,p_rows);
 for item in select value from jsonb_array_elements(rows) loop
  if folio_private.statement_duplicate(owner_id,p_account,p_source_sha256,item) then skipped:=skipped+1;
  else
   entry:=item->'entry';
   perform folio_private.record_entry(p_account,(entry->>'category_id')::uuid,entry->>'kind',(entry->>'amount_paise')::bigint,(entry->>'occurred_on')::date,entry->>'description',null,null);
   inserted:=inserted+1;
  end if;
  -- Remember even a ledger match. Reclassifying a statement row cannot repost it later.
  insert into folio_private.statement_rows(user_id,account_id,source_sha256,source_row)
   values(owner_id,p_account,p_source_sha256,item->>'source_row') on conflict do nothing;
 end loop;
 snapshot:=public.workspace_snapshot();
 if exists(select 1 from (
  select (a->>'balance_paise')::numeric amount from jsonb_array_elements(snapshot->'accounts') a
  union all select case when key<>'month' then value::numeric end from jsonb_each_text(snapshot->'summary')
  union all select (b->>'spent_paise')::numeric from jsonb_array_elements(snapshot->'budgets') b
  union all select (c->>'income_paise')::numeric from jsonb_array_elements(snapshot->'cashflow') c
  union all select (c->>'outflow_paise')::numeric from jsonb_array_elements(snapshot->'cashflow') c
 ) totals where abs(amount)>1000000000000) then raise exception 'Statement exceeds supported financial totals.' using errcode='22003'; end if;
 result:=jsonb_build_object('inserted',inserted,'skipped',skipped);
 insert into folio_private.statement_requests values(owner_id,p_request_id,digest,result);
 return result;
end $$;
create function public.import_statement_entries(p_account uuid,p_source_sha256 text,p_rows jsonb,p_request_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select folio_private.import_statement_entries(p_account,p_source_sha256,p_rows,p_request_id)$$;
revoke all on function folio_private.statement_rows_valid(uuid,jsonb),folio_private.statement_duplicate(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.preview_statement_import(uuid,text,jsonb),public.import_statement_entries(uuid,text,jsonb,uuid) from public,anon;
grant execute on function folio_private.preview_statement_import(uuid,text,jsonb),folio_private.import_statement_entries(uuid,text,jsonb,uuid),public.preview_statement_import(uuid,text,jsonb),public.import_statement_entries(uuid,text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
