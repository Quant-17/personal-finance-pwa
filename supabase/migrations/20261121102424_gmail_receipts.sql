-- Gmail drafts are separate from accounting. OAuth credentials never enter the exposed schema.
create table public.gmail_connections (
 user_id uuid primary key references auth.users(id) on delete cascade,
 generation uuid not null default gen_random_uuid(),
 status text not null check(status in ('connecting','connected','disconnected','reconnect_required','error')),
 mailbox text, has_more boolean not null default false, last_synced_at timestamptz, last_attempt_at timestamptz,
 sync_lease uuid, lease_until timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.gmail_connections enable row level security;
revoke all on public.gmail_connections from public,anon,authenticated;
grant select on public.gmail_connections to authenticated;
create policy gmail_connection_owner on public.gmail_connections for select to authenticated
 using(user_id=(select auth.uid()) and ((select auth.jwt())->>'is_anonymous') is distinct from 'true');
create table folio_private.gmail_credentials (
 user_id uuid primary key references public.gmail_connections(user_id) on delete cascade,
 ciphertext text not null check(length(ciphertext)<16000)
);
create table folio_private.gmail_oauth_states (
 state_hash text primary key, user_id uuid not null unique references public.gmail_connections(user_id) on delete cascade,
 generation uuid not null, verifier text not null, expires_at timestamptz not null
);
alter table folio_private.gmail_credentials enable row level security;
alter table folio_private.gmail_oauth_states enable row level security;
revoke all on folio_private.gmail_credentials,folio_private.gmail_oauth_states from public,anon,authenticated;

create table public.gmail_receipts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 message_id text not null check(message_id ~ '^[a-fA-F0-9]{1,40}$'),
 dedupe_key text not null check(length(dedupe_key) between 1 and 160),
 merchant text not null check(merchant in ('Uber','Zomato','Swiggy','Amazon')),
 amount_paise bigint check(amount_paise between 1 and 1000000000000), occurred_on date not null,
 kind text not null check(kind in ('charge','refund','cancellation','uncertain')),
 reference text not null default '' check(length(reference)<=60),
 subscription_hint text check(length(subscription_hint)<=60),
 status text not null default 'pending' check(status in ('pending','posted','dismissed')),
 needs_attention boolean not null default false,
 transaction_id uuid, created_at timestamptz not null default now(),
 unique(user_id,dedupe_key), unique(id,user_id),
 foreign key(transaction_id,user_id) references public.transactions(id,user_id) on delete set null (transaction_id)
);
create index gmail_receipts_owner_status_idx on public.gmail_receipts(user_id,status,created_at desc);
create index gmail_receipts_transaction_idx on public.gmail_receipts(transaction_id,user_id);
alter table public.gmail_receipts enable row level security;
revoke all on public.gmail_receipts from public,anon,authenticated;
grant select on public.gmail_receipts to authenticated;
create policy gmail_receipt_owner on public.gmail_receipts for select to authenticated
 using(user_id=(select auth.uid()) and ((select auth.jwt())->>'is_anonymous') is distinct from 'true');
create table public.subscription_charges (
 transaction_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, subscription_id uuid not null,
 foreign key(transaction_id,user_id) references public.transactions(id,user_id) on delete cascade,
 foreign key(subscription_id,user_id) references public.subscriptions(id,user_id) on delete cascade
);
create index subscription_charges_owner_idx on public.subscription_charges(user_id,subscription_id);
alter table public.subscription_charges enable row level security;
revoke all on public.subscription_charges from public,anon,authenticated;
grant select on public.subscription_charges to authenticated;
create policy subscription_charge_owner on public.subscription_charges for select to authenticated
 using(user_id=(select auth.uid()) and ((select auth.jwt())->>'is_anonymous') is distinct from 'true');

-- Backend-only atomic protocol: single-use OAuth state, generation fencing and expiring sync leases.
create function folio_private.gmail_service(p_action text,p_user uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.gmail_connections; s folio_private.gmail_oauth_states; r public.gmail_receipts; lease uuid;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Backend only.' using errcode='42501'; end if;
 if p_action='consume_state' then
   delete from folio_private.gmail_oauth_states where state_hash=p_data->>'hash' and expires_at>now() returning * into s;
   if not found then return null; end if;
   return to_jsonb(s);
 end if;
 if p_action='due' then
   return (select coalesce(jsonb_agg(user_id),'[]'::jsonb) from (select user_id from public.gmail_connections where status in ('connected','error') and coalesce(last_attempt_at,'epoch')<now()-interval '15 minutes' and coalesce(lease_until,'epoch')<now() order by last_attempt_at nulls first limit 20) x);
 end if;
 if p_user is null then raise exception 'Owner required.'; end if;
 if p_action='start' then
   insert into public.gmail_connections(user_id,status) values(p_user,'connecting') on conflict(user_id) do update
    set generation=gen_random_uuid(),status='connecting',sync_lease=null,lease_until=null,updated_at=now();
   select * into c from public.gmail_connections where user_id=p_user for update;
   delete from folio_private.gmail_credentials where user_id=p_user;
   delete from folio_private.gmail_oauth_states where user_id=p_user or expires_at<=now();
   insert into folio_private.gmail_oauth_states values(p_data->>'hash',p_user,c.generation,p_data->>'verifier',now()+interval '10 minutes');
   return jsonb_build_object('generation',c.generation);
 end if;
 select * into c from public.gmail_connections where user_id=p_user for update;
 if not found then return null; end if;
 if p_action in ('disconnect','forget') then
   delete from folio_private.gmail_credentials where user_id=p_user;
   delete from folio_private.gmail_oauth_states where user_id=p_user;
   update public.gmail_connections set status='disconnected',generation=gen_random_uuid(),mailbox=null,sync_lease=null,lease_until=null,updated_at=now() where user_id=p_user;
   if p_action='forget' then delete from public.gmail_receipts where user_id=p_user; end if;
   return 'true'; -- Approved ledger entries and subscription links are retained.
 end if;
 if p_action='connect' then
   if c.generation<>(p_data->>'generation')::uuid or c.status<>'connecting' then raise exception 'Connection changed.'; end if;
   insert into folio_private.gmail_credentials values(p_user,p_data->>'ciphertext') on conflict(user_id) do update set ciphertext=excluded.ciphertext;
   update public.gmail_connections set status='connected',mailbox=left(p_data->>'mailbox',254),last_synced_at=null,last_attempt_at=null,updated_at=now() where user_id=p_user;
   return 'true';
 end if;
 if p_action='lease' then
   if c.status not in ('connected','error') or coalesce(c.lease_until,'epoch')>now() or coalesce(c.last_attempt_at,'epoch')>now()-interval '1 minute' then return null; end if;
   lease:=gen_random_uuid();
   update public.gmail_connections set sync_lease=lease,lease_until=now()+interval '5 minutes',last_attempt_at=now() where user_id=p_user;
   return jsonb_build_object('lease',lease,'last_synced_at',c.last_synced_at,'ciphertext',(select ciphertext from folio_private.gmail_credentials where user_id=p_user));
 end if;
 if c.sync_lease is null or c.lease_until is null or c.sync_lease is distinct from (p_data->>'lease')::uuid or c.lease_until<=now() then raise exception 'Sync expired.'; end if;
 if p_action='token' then
   update folio_private.gmail_credentials set ciphertext=p_data->>'ciphertext' where user_id=p_user;
   return 'true';
 end if;
 if p_action='ingest' then
   for r in select * from jsonb_populate_recordset(null::public.gmail_receipts,p_data->'rows') loop
     insert into public.gmail_receipts(user_id,message_id,dedupe_key,merchant,amount_paise,occurred_on,kind,reference,subscription_hint)
       values(p_user,r.message_id,r.dedupe_key,r.merchant,r.amount_paise,r.occurred_on,r.kind,r.reference,r.subscription_hint)
       on conflict(user_id,dedupe_key) do update set needs_attention=public.gmail_receipts.needs_attention or public.gmail_receipts.amount_paise is distinct from excluded.amount_paise;
   end loop;
   return 'true';
 end if;
 if p_action='finish' then
   if p_data->>'status' not in ('connected','error','reconnect_required') then raise exception 'Invalid sync status.'; end if;
   update public.gmail_connections set status=p_data->>'status',has_more=coalesce((p_data->>'has_more')::boolean,has_more),sync_lease=null,lease_until=null,
    last_synced_at=case when p_data->>'status'='connected' then (p_data->>'cursor')::timestamptz else last_synced_at end,updated_at=now() where user_id=p_user;
   return 'true';
 end if;
 raise exception 'Unknown backend action.';
end $$;
create function public.gmail_service(p_action text,p_user uuid,p_data jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$select folio_private.gmail_service(p_action,p_user,p_data)$$;
revoke all on function public.gmail_service(text,uuid,jsonb),folio_private.gmail_service(text,uuid,jsonb) from public,anon,authenticated;
grant usage on schema folio_private to service_role;
grant execute on function public.gmail_service(text,uuid,jsonb),folio_private.gmail_service(text,uuid,jsonb) to service_role;

-- Owner reviews each draft. Atomic status lock prevents duplicate posting across tabs/retries.
create function folio_private.review_gmail_receipt(p_receipt uuid,p_action text,p_account uuid,p_category uuid,p_amount_paise bigint,p_date date,p_subscription uuid,p_existing uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); r public.gmail_receipts; t public.transactions; entry_id uuid; snapshot jsonb;
begin
 select * into r from public.gmail_receipts where id=p_receipt and user_id=owner_id for update;
 if not found then raise exception 'Receipt unavailable.' using errcode='42501'; end if;
 if p_action='dismiss' then
   if r.status='posted' then raise exception 'Delete the ledger entry separately.'; end if;
   update public.gmail_receipts set status='dismissed' where id=r.id; return null;
 end if;
 if p_action not in ('post','link') or p_action is null then raise exception 'Invalid review action.'; end if;
 if r.status='posted' then return r.transaction_id; end if;
 if r.status<>'pending' or r.kind<>'charge' or r.needs_attention then raise exception 'This receipt needs manual reconciliation; do not post it automatically.'; end if;
 if p_amount_paise is null or p_amount_paise not between 1 and 1000000000000 or p_date is null or p_date>folio_private.today() then raise exception 'Review a positive amount and settled date.'; end if;
 if p_subscription is not null then
   perform 1 from public.subscriptions where id=p_subscription and user_id=owner_id;
   if not found then raise exception 'Subscription unavailable.' using errcode='42501'; end if;
 end if;
 if p_action='link' then
   select * into t from public.transactions where id=p_existing and user_id=owner_id for update;
   if not found or t.kind<>'expense' or t.account_id<>p_account or t.amount_paise<>-p_amount_paise or t.occurred_on<>p_date then raise exception 'Existing expense does not match.' using errcode='42501'; end if;
   entry_id:=t.id;
 else
   perform 1 from public.accounts where user_id=owner_id order by id for update;
   perform folio_private.check_account(p_account,owner_id,p_date);
   -- Exact existing charges require explicit reconciliation, not an automatic false match.
   if exists(select 1 from public.transactions where user_id=owner_id and account_id=p_account and kind='expense' and amount_paise=-p_amount_paise and occurred_on=p_date) then
     raise exception 'A matching expense exists. Link it using its ledger ID or review the ledger first.' using errcode='23505';
   end if;
   entry_id:=folio_private.record_entry(p_account,p_category,'expense',p_amount_paise,p_date,r.merchant||case when r.reference<>'' then ' · '||r.reference else '' end,null,null);
 end if;
 perform folio_private.check_investment_totals();
 snapshot:=public.workspace_snapshot();
 if exists(select 1 from (
   select (a->>'balance_paise')::numeric amount from jsonb_array_elements(snapshot->'accounts') a
   union all select case when key<>'month' then value::numeric end from jsonb_each_text(snapshot->'summary')
   union all select (b->>'spent_paise')::numeric from jsonb_array_elements(snapshot->'budgets') b
   union all select (c->>'income_paise')::numeric from jsonb_array_elements(snapshot->'cashflow') c
   union all select (c->>'outflow_paise')::numeric from jsonb_array_elements(snapshot->'cashflow') c
 ) totals where abs(amount)>1000000000000) then raise exception 'Receipt exceeds supported financial totals.' using errcode='22003'; end if;
 if p_subscription is not null then
   insert into public.subscription_charges values(entry_id,owner_id,p_subscription)
    on conflict(transaction_id) do update set subscription_id=excluded.subscription_id;
 end if;
 update public.gmail_receipts set status='posted',transaction_id=entry_id where id=r.id;
 return entry_id;
end $$;
create function public.review_gmail_receipt(p_receipt uuid,p_action text,p_account uuid default null,p_category uuid default null,p_amount_paise bigint default null,p_date date default null,p_subscription uuid default null,p_existing uuid default null) returns uuid
language sql security invoker set search_path='' as $$select folio_private.review_gmail_receipt(p_receipt,p_action,p_account,p_category,p_amount_paise,p_date,p_subscription,p_existing)$$;
revoke all on function public.review_gmail_receipt(uuid,text,uuid,uuid,bigint,date,uuid,uuid) from public,anon;
grant execute on function public.review_gmail_receipt(uuid,text,uuid,uuid,bigint,date,uuid,uuid),folio_private.review_gmail_receipt(uuid,text,uuid,uuid,bigint,date,uuid,uuid) to authenticated;

create function folio_private.gmail_plan_status() returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=folio_private.current_owner(); month_start date:=date_trunc('month',folio_private.today())::date; total numeric;
begin
 select coalesce(sum(-t.amount_paise),0) into total from public.subscription_charges sc join public.transactions t on t.id=sc.transaction_id and t.user_id=sc.user_id
 where sc.user_id=owner_id and t.kind='expense' and t.occurred_on>=month_start and t.occurred_on<month_start+interval '1 month';
 if total>1000000000000 then raise exception 'Financial total exceeds the supported range.' using errcode='22003'; end if;
 return jsonb_build_object('pending',(select count(*) from public.gmail_receipts where user_id=owner_id and status='pending'), 'subscription_paid_paise',total::text);
end $$;
create function public.gmail_plan_status() returns jsonb language sql security invoker set search_path='' as $$select folio_private.gmail_plan_status()$$;
revoke all on function public.gmail_plan_status() from public,anon;
grant execute on function public.gmail_plan_status(),folio_private.gmail_plan_status() to authenticated;

notify pgrst, 'reload schema';
