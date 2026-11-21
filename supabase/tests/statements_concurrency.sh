#!/usr/bin/env bash
# Only run against the disposable CI database, after bootstrap and migrations.
set -euo pipefail
statement_work=$(mktemp -d /tmp/folio-statement-race.XXXXXX)
statement_fixture=$(psql -X -At -v ON_ERROR_STOP=1 <<'SQL'
with u as (insert into auth.users(id,email) values(gen_random_uuid(),'statement-race@example.invalid') returning id),
a as (insert into public.accounts(user_id,name,type,opening_date) select id,'Statement race fixture','cash',folio_private.today() from u returning id,user_id),
c as (insert into public.categories(user_id,name,kind) select id,'Statement race category','expense' from u returning id)
select a.user_id::text||'|'||a.id::text||'|'||c.id::text from a,c;
SQL
)
IFS='|' read -r statement_owner statement_account statement_category <<< "$statement_fixture"
[[ "$statement_owner" =~ ^[0-9a-f-]{36}$ && "$statement_account" =~ ^[0-9a-f-]{36}$ && "$statement_category" =~ ^[0-9a-f-]{36}$ ]]
cat > "$statement_work/cleanup.sql" <<'SQL'
delete from auth.users where id=:'statement_owner'::uuid;
SQL
cleanup() {
  psql -X -v ON_ERROR_STOP=1 -v statement_owner="$statement_owner" -f "$statement_work/cleanup.sql" > /dev/null
  rm -r "$statement_work"
}
trap cleanup EXIT
cat > "$statement_work/worker.sql" <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',:'statement_owner',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',:'statement_owner','role','authenticated','is_anonymous',false)::text,true);
select public.import_statement_entries(:'statement_account'::uuid,repeat('a',64),jsonb_build_array(jsonb_build_object('source_row','1:4','entry',jsonb_build_object('occurred_on',folio_private.today(),'kind','expense','amount_paise',12345,'category_id',:'statement_category','description','Concurrent statement fixture'))),gen_random_uuid());
select pg_sleep(0.25);
commit;
SQL
psql -X -v ON_ERROR_STOP=1 -v statement_owner="$statement_owner" -v statement_account="$statement_account" -v statement_category="$statement_category" -f "$statement_work/worker.sql" > "$statement_work/one.log" &
statement_pid_one=$!
psql -X -v ON_ERROR_STOP=1 -v statement_owner="$statement_owner" -v statement_account="$statement_account" -v statement_category="$statement_category" -f "$statement_work/worker.sql" > "$statement_work/two.log" &
statement_pid_two=$!
wait "$statement_pid_one"
wait "$statement_pid_two"
cat > "$statement_work/check.sql" <<'SQL'
select 1/((count(*)=1 and sum(amount_paise)=-12345)::integer) from public.transactions where account_id=:'statement_account'::uuid;
select 1/((count(*)=2)::integer) from folio_private.statement_requests where user_id=:'statement_owner'::uuid;
SQL
psql -X -v ON_ERROR_STOP=1 -v statement_owner="$statement_owner" -v statement_account="$statement_account" -f "$statement_work/check.sql" > /dev/null
echo 'PASS: concurrent Statement imports post one expense and keep two retry receipts'
