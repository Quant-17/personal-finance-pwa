#!/usr/bin/env bash
# Only run against the disposable CI database, after bootstrap and migrations.
set -euo pipefail
csv_work=$(mktemp -d /tmp/folio-csv-race.XXXXXX)
csv_fixture=$(psql -X -At -v ON_ERROR_STOP=1 <<'SQL'
with u as (insert into auth.users(id,email) values(gen_random_uuid(),'csv-race@example.invalid') returning id),
a as (insert into public.accounts(user_id,name,type,opening_date) select id,'CSV race fixture','cash',folio_private.today() from u returning id,user_id),
c as (insert into public.categories(user_id,name,kind) select id,'CSV race category','expense' from u returning id)
select a.user_id::text||'|'||a.id::text||'|'||c.id::text from a,c;
SQL
)
IFS='|' read -r csv_owner csv_account csv_category <<< "$csv_fixture"
[[ "$csv_owner" =~ ^[0-9a-f-]{36}$ && "$csv_account" =~ ^[0-9a-f-]{36}$ && "$csv_category" =~ ^[0-9a-f-]{36}$ ]]
cat > "$csv_work/cleanup.sql" <<'SQL'
delete from auth.users where id=:'csv_owner'::uuid;
SQL
cleanup() {
  psql -X -v ON_ERROR_STOP=1 -v csv_owner="$csv_owner" -f "$csv_work/cleanup.sql" > /dev/null
  rm -r "$csv_work"
}
trap cleanup EXIT
cat > "$csv_work/worker.sql" <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',:'csv_owner',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',:'csv_owner','role','authenticated','is_anonymous',false)::text,true);
select public.import_csv_entries(:'csv_account'::uuid,jsonb_build_array(jsonb_build_object('occurred_on',folio_private.today(),'kind','expense','amount_paise',12345,'category_id',:'csv_category','description','Concurrent CSV fixture')),gen_random_uuid());
select pg_sleep(0.25);
commit;
SQL
psql -X -v ON_ERROR_STOP=1 -v csv_owner="$csv_owner" -v csv_account="$csv_account" -v csv_category="$csv_category" -f "$csv_work/worker.sql" > "$csv_work/one.log" &
csv_pid_one=$!
psql -X -v ON_ERROR_STOP=1 -v csv_owner="$csv_owner" -v csv_account="$csv_account" -v csv_category="$csv_category" -f "$csv_work/worker.sql" > "$csv_work/two.log" &
csv_pid_two=$!
wait "$csv_pid_one"
wait "$csv_pid_two"
cat > "$csv_work/check.sql" <<'SQL'
select 1/((count(*)=1 and sum(amount_paise)=-12345)::integer) from public.transactions where account_id=:'csv_account'::uuid;
select 1/((count(*)=2)::integer) from folio_private.csv_import_receipts where user_id=:'csv_owner'::uuid;
SQL
psql -X -v ON_ERROR_STOP=1 -v csv_owner="$csv_owner" -v csv_account="$csv_account" -f "$csv_work/check.sql" > /dev/null
echo 'PASS: concurrent CSV imports post one expense and keep two retry receipts'
