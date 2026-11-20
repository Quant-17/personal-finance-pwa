-- CSV import is all-or-nothing. Receipts contain hashes/counts, never file contents.
create table folio_private.csv_import_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
alter table folio_private.csv_import_receipts enable row level security;
revoke all on folio_private.csv_import_receipts from public,anon,authenticated;

create function folio_private.csv_rows(p_account uuid,p_rows jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); item jsonb; normalized jsonb:='[]'::jsonb;
  day date; category uuid; amount bigint; row_kind text; description text;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Rows must be a JSON array.'; end if;
  if jsonb_array_length(p_rows) not between 1 and 500 or octet_length(p_rows::text)>1048576 then raise exception 'Import 1–500 rows within 1 MiB.'; end if;
  -- All posting paths lock this account, so duplicate rechecks are serialized.
  perform folio_private.check_account(p_account,owner_id,folio_private.today());
  for item in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'Invalid transaction row.'; end if;
    if (select count(*) from jsonb_object_keys(item))<>5 or not item ?& array['occurred_on','kind','amount_paise','category_id','description'] then raise exception 'Invalid transaction fields.'; end if;
    if jsonb_typeof(item->'occurred_on') is distinct from 'string' or (item->>'occurred_on') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Use ISO calendar dates.'; end if;
    day:=(item->>'occurred_on')::date;
    perform folio_private.check_account(p_account,owner_id,day);
    row_kind:=item->>'kind';
    if row_kind is null or row_kind not in ('income','expense') then raise exception 'Only income and expense rows can be imported.'; end if;
    if jsonb_typeof(item->'amount_paise') is distinct from 'number' or (item->>'amount_paise') !~ '^\d+$' then raise exception 'Use positive integer paise.'; end if;
    amount:=(item->>'amount_paise')::bigint;
    if amount not between 1 and 1000000000000 then raise exception 'Amount is outside the supported range.'; end if;
    category:=(item->>'category_id')::uuid;
    perform 1 from public.categories c where c.id=category and c.user_id=owner_id and c.kind=row_kind;
    if not found then raise exception 'Category unavailable or kind mismatch.' using errcode='42501'; end if;
    if jsonb_typeof(item->'description') is distinct from 'string' then raise exception 'Description must be text.'; end if;
    description:=btrim(item->>'description');
    if length(description)>240 then raise exception 'Description is too long.'; end if;
    normalized:=normalized||jsonb_build_array(jsonb_build_object('occurred_on',day,'kind',row_kind,'amount_paise',amount,'category_id',category,'description',description));
  end loop;
  return normalized;
end $$;

create function folio_private.csv_duplicate(p_owner uuid,p_account uuid,item jsonb) returns boolean
language sql volatile set search_path='' as $$
  select exists(select 1 from public.transactions t where t.user_id=p_owner and t.account_id=p_account
    and t.occurred_on=(item->>'occurred_on')::date and t.kind=item->>'kind'
    and t.category_id=(item->>'category_id')::uuid and t.description=item->>'description'
    and t.amount_paise=case when item->>'kind'='income' then (item->>'amount_paise')::bigint else -(item->>'amount_paise')::bigint end)
$$;

create function folio_private.preview_csv_import(p_account uuid,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); rows jsonb; item jsonb; seen text[]:='{}'; duplicates jsonb:='[]'; repeated boolean;
begin
  rows:=folio_private.csv_rows(p_account,p_rows);
  for item in select value from jsonb_array_elements(rows) loop
    repeated:=item::text=any(seen) or folio_private.csv_duplicate(owner_id,p_account,item);
    duplicates:=duplicates||jsonb_build_array(repeated);
    seen:=array_append(seen,item::text);
  end loop;
  return jsonb_build_object('duplicates',duplicates);
end $$;
create function public.preview_csv_import(p_account uuid,p_rows jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select folio_private.preview_csv_import(p_account,p_rows) $$;

create function folio_private.import_csv_entries(p_account uuid,p_rows jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); rows jsonb; item jsonb; receipt folio_private.csv_import_receipts;
  digest text; inserted integer:=0; skipped integer:=0; result jsonb; seen text[]:='{}';
begin
  if p_request_id is null or p_rows is null then raise exception 'A request ID and rows are required.'; end if;
  if octet_length(p_rows::text)>1048576 then raise exception 'Import payload exceeds 1 MiB.'; end if;
  digest:=encode(sha256(convert_to(jsonb_build_array(p_account,p_rows)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text||p_request_id::text,0));
  select * into receipt from folio_private.csv_import_receipts where user_id=owner_id and request_id=p_request_id;
  if found then
    if receipt.payload_hash<>digest then raise exception 'Request ID already used for a different import. Check the ledger before retrying.'; end if;
    return receipt.result;
  end if;
  -- Validate every row before any insertion. Failure rolls back the whole batch.
  rows:=folio_private.csv_rows(p_account,p_rows);
  for item in select value from jsonb_array_elements(rows) loop
    if item::text=any(seen) or folio_private.csv_duplicate(owner_id,p_account,item) then skipped:=skipped+1;
    else
      perform folio_private.record_entry(p_account,(item->>'category_id')::uuid,item->>'kind',(item->>'amount_paise')::bigint,(item->>'occurred_on')::date,item->>'description',null,null);
      inserted:=inserted+1;
    end if;
    seen:=array_append(seen,item::text);
  end loop;
  result:=jsonb_build_object('inserted',inserted,'skipped',skipped);
  insert into folio_private.csv_import_receipts(user_id,request_id,payload_hash,result) values(owner_id,p_request_id,digest,result);
  return result;
end $$;
create function public.import_csv_entries(p_account uuid,p_rows jsonb,p_request_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select folio_private.import_csv_entries(p_account,p_rows,p_request_id) $$;

revoke all on function folio_private.csv_rows(uuid,jsonb),folio_private.csv_duplicate(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function folio_private.preview_csv_import(uuid,jsonb),folio_private.import_csv_entries(uuid,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.preview_csv_import(uuid,jsonb),public.import_csv_entries(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function folio_private.preview_csv_import(uuid,jsonb),folio_private.import_csv_entries(uuid,jsonb,uuid),public.preview_csv_import(uuid,jsonb),public.import_csv_entries(uuid,jsonb,uuid) to authenticated;
notify pgrst, 'reload schema';
