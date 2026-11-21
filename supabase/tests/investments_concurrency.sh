#!/usr/bin/env bash
# Disposable CI database only; never run this fixture/cleanup harness on managed Supabase.
set -euo pipefail
invest_work=$(mktemp -d /tmp/folio-invest-race.XXXXXX)
invest_fixture=$(psql -X -At -v ON_ERROR_STOP=1 <<'SQL'
with u as(insert into auth.users(id,email) values(gen_random_uuid(),'investment-race@example.invalid') returning id),
p as(insert into public.profiles(id) select id from u),
h as(insert into public.investment_holdings(user_id,name,scheme,funding_source) select id,'Investment race fixture','ppf','self' from u returning id,user_id),
e as(insert into public.investment_entries(user_id,holding_id,kind,amount_paise,occurred_on) select user_id,id,'valuation',0,folio_private.today() from h)
select h.user_id::text||'|'||h.id::text||'|'||gen_random_uuid()::text from h;
SQL
)
IFS='|' read -r invest_owner invest_holding invest_request <<< "$invest_fixture"
[[ "$invest_owner" =~ ^[0-9a-f-]{36}$ && "$invest_holding" =~ ^[0-9a-f-]{36}$ && "$invest_request" =~ ^[0-9a-f-]{36}$ ]]
cat > "$invest_work/cleanup.sql" <<'SQL'
delete from auth.users where id=:'invest_owner'::uuid;
SQL
cleanup() {
 psql -X -v ON_ERROR_STOP=1 -v invest_owner="$invest_owner" -f "$invest_work/cleanup.sql" > /dev/null
 rm -r "$invest_work"
}
trap cleanup EXIT
cat > "$invest_work/worker.sql" <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',:'invest_owner',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',:'invest_owner','role','authenticated','is_anonymous',false)::text,true);
select public.record_investment_entry(:'invest_holding'::uuid,1,null,'self',10029,folio_private.today(),'Concurrent history fixture',false,:'invest_request'::uuid);
select pg_sleep(0.25);
commit;
SQL
psql -X -v ON_ERROR_STOP=1 -v invest_owner="$invest_owner" -v invest_holding="$invest_holding" -v invest_request="$invest_request" -f "$invest_work/worker.sql" > "$invest_work/one.log" &
invest_pid_one=$!
psql -X -v ON_ERROR_STOP=1 -v invest_owner="$invest_owner" -v invest_holding="$invest_holding" -v invest_request="$invest_request" -f "$invest_work/worker.sql" > "$invest_work/two.log" &
invest_pid_two=$!
wait "$invest_pid_one"
wait "$invest_pid_two"
cat > "$invest_work/check.sql" <<'SQL'
select 1/((count(*)=1 and sum(amount_paise)=10029)::integer) from public.investment_entries where holding_id=:'invest_holding'::uuid and kind='self';
select 1/((revision=2)::integer) from public.investment_holdings where id=:'invest_holding'::uuid;
select 1/((count(*)=1)::integer) from folio_private.mutation_receipts where user_id=:'invest_owner'::uuid;
select 1/((count(*)=0)::integer) from public.transactions where user_id=:'invest_owner'::uuid;
SQL
psql -X -v ON_ERROR_STOP=1 -v invest_owner="$invest_owner" -v invest_holding="$invest_holding" -f "$invest_work/check.sql" > /dev/null
echo 'PASS: concurrent investment retries keep one contribution, one revision increment and no bank posting'
