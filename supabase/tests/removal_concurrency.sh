#!/usr/bin/env bash
# Disposable PostgreSQL only. Concurrent retries must not free the same budget twice.
set -euo pipefail
removal_work=$(mktemp -d /tmp/folio-removal-race.XXXXXX)
removal_fixture=$(psql -X -At -v ON_ERROR_STOP=1 <<'SQL'
with u as(insert into auth.users(id,email,email_confirmed_at)values(gen_random_uuid(),'removal-race@example.invalid',now())returning id),
p as(insert into public.profiles(id,monthly_living_budget_paise)select id,100000 from u),
s as(insert into public.subscriptions(user_id,name,amount_paise,cadence,next_due_on)select id,'Synthetic concurrent removal',10000,'monthly',folio_private.today()from u returning id,user_id)
select user_id::text||'|'||id::text from s;
SQL
)
IFS='|' read -r removal_owner removal_id <<< "$removal_fixture"
[[ "$removal_owner" =~ ^[0-9a-f-]{36}$ && "$removal_id" =~ ^[0-9a-f-]{36}$ ]]
cat > "$removal_work/cleanup.sql" <<'SQL'
delete from auth.users where id=:'removal_owner'::uuid;
SQL
cleanup() {
 psql -X -v ON_ERROR_STOP=1 -v removal_owner="$removal_owner" -f "$removal_work/cleanup.sql" > /dev/null
 rm -r "$removal_work"
}
trap cleanup EXIT
cat > "$removal_work/worker.sql" <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',:'removal_owner',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',:'removal_owner','is_anonymous',false)::text,true);
select public.remove_commitment('subscription',:'removal_id'::uuid,10000,100000,true,'DELETE');
select pg_sleep(0.25);
commit;
SQL
for removal_attempt in one two; do
 psql -X -v ON_ERROR_STOP=1 -v removal_owner="$removal_owner" -v removal_id="$removal_id" -f "$removal_work/worker.sql" > "$removal_work/$removal_attempt.log" &
 if [[ "$removal_attempt" = one ]]; then removal_one=$!; else removal_two=$!; fi
done
wait "$removal_one"
wait "$removal_two"
cat > "$removal_work/check.sql" <<'SQL'
select 1/((monthly_living_budget_paise=90000)::integer)from public.profiles where id=:'removal_owner'::uuid;
select 1/((not active and removed_at is not null)::integer)from public.subscriptions where id=:'removal_id'::uuid;
select 1/((count(*)=1)::integer)from public.audit_events where user_id=:'removal_owner'::uuid and table_name='subscriptions'and after_data->>'removed_at'is not null;
SQL
psql -X -v ON_ERROR_STOP=1 -v removal_owner="$removal_owner" -v removal_id="$removal_id" -f "$removal_work/check.sql" > /dev/null
echo 'PASS: concurrent removal retries reduce the living budget once'
