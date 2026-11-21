#!/usr/bin/env bash
# Disposable local/CI Postgres only, after bootstrap + sorted migrations. Never run on managed Supabase.
set -euo pipefail
gmail_work=$(mktemp -d /tmp/folio-gmail-race.XXXXXX)
gmail_fixture=$(psql -X -At -v ON_ERROR_STOP=1 <<'SQL'
with u as(insert into auth.users(id,email) values(gen_random_uuid(),'gmail-race@example.invalid') returning id),
p as(insert into public.profiles(id) select id from u),
a as(insert into public.accounts(user_id,name,type,opening_date) select id,'Receipt race bank','cash',folio_private.today() from u returning id,user_id),
c as(insert into public.categories(user_id,name,kind) select id,'Receipt race category','expense' from u returning id),
r as(insert into public.gmail_receipts(user_id,message_id,dedupe_key,merchant,amount_paise,occurred_on,kind)
 select id,'abc123','Uber:charge:RACE','Uber',12345,folio_private.today(),'charge' from u returning id)
select a.user_id::text||'|'||a.id::text||'|'||c.id::text||'|'||r.id::text from a,c,r;
SQL
)
IFS='|' read -r gmail_owner gmail_account gmail_category gmail_receipt <<< "$gmail_fixture"
[[ "$gmail_owner" =~ ^[0-9a-f-]{36}$ && "$gmail_account" =~ ^[0-9a-f-]{36}$ && "$gmail_category" =~ ^[0-9a-f-]{36}$ && "$gmail_receipt" =~ ^[0-9a-f-]{36}$ ]]
cat > "$gmail_work/cleanup.sql" <<'SQL'
delete from auth.users where id=:'gmail_owner'::uuid;
SQL
cleanup() {
 psql -X -v ON_ERROR_STOP=1 -v gmail_owner="$gmail_owner" -f "$gmail_work/cleanup.sql" >/dev/null
 rm -r "$gmail_work"
}
trap cleanup EXIT
cat > "$gmail_work/worker.sql" <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',:'gmail_owner',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',:'gmail_owner','role','authenticated','is_anonymous',false)::text,true);
select public.review_gmail_receipt(:'gmail_receipt','post',:'gmail_account',:'gmail_category',12345,folio_private.today());
select pg_sleep(0.25);
commit;
SQL
psql -X -v ON_ERROR_STOP=1 -v gmail_owner="$gmail_owner" -v gmail_account="$gmail_account" -v gmail_category="$gmail_category" -v gmail_receipt="$gmail_receipt" -f "$gmail_work/worker.sql" >"$gmail_work/one.log" &
gmail_pid_one=$!
psql -X -v ON_ERROR_STOP=1 -v gmail_owner="$gmail_owner" -v gmail_account="$gmail_account" -v gmail_category="$gmail_category" -v gmail_receipt="$gmail_receipt" -f "$gmail_work/worker.sql" >"$gmail_work/two.log" &
gmail_pid_two=$!
wait "$gmail_pid_one"
wait "$gmail_pid_two"
cat > "$gmail_work/check.sql" <<'SQL'
select 1/((count(*)=1 and sum(amount_paise)=-12345)::integer) from public.transactions where user_id=:'gmail_owner'::uuid;
select 1/((status='posted' and transaction_id is not null)::integer) from public.gmail_receipts where id=:'gmail_receipt';
SQL
psql -X -v ON_ERROR_STOP=1 -v gmail_owner="$gmail_owner" -v gmail_receipt="$gmail_receipt" -f "$gmail_work/check.sql" >/dev/null
echo 'PASS: concurrent Gmail receipt confirmations post one expense and retain one source link'
