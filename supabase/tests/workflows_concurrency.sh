#!/usr/bin/env bash
# Disposable PostgreSQL only: two interrupted/retried paired imports must post once.
set -euo pipefail
workflow_work=$(mktemp -d /tmp/folio-workflow-race.XXXXXX)
workflow_fixture=$(psql -X -At -v ON_ERROR_STOP=1 <<'SQL'
with u as(insert into auth.users(id,email)values(gen_random_uuid(),'workflow-race@example.invalid')returning id),
a as(insert into public.accounts(user_id,name,type,opening_date)select id,'Workflow race A','cash',folio_private.today()from u returning id,user_id),
b as(insert into public.accounts(user_id,name,type,opening_date)select id,'Workflow race B','cash',folio_private.today()from u returning id)
select a.user_id::text||'|'||a.id::text||'|'||b.id::text||'|'||gen_random_uuid()::text from a,b;
SQL
)
IFS='|' read -r workflow_owner workflow_from workflow_to workflow_request <<< "$workflow_fixture"
[[ "$workflow_owner" =~ ^[0-9a-f-]{36}$ && "$workflow_from" =~ ^[0-9a-f-]{36}$ && "$workflow_to" =~ ^[0-9a-f-]{36}$ && "$workflow_request" =~ ^[0-9a-f-]{36}$ ]]
cat > "$workflow_work/cleanup.sql" <<'SQL'
delete from auth.users where id=:'workflow_owner'::uuid;
SQL
cleanup() {
 psql -X -v ON_ERROR_STOP=1 -v workflow_owner="$workflow_owner" -f "$workflow_work/cleanup.sql" > /dev/null
 rm -r "$workflow_work"
}
trap cleanup EXIT
cat > "$workflow_work/worker.sql" <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',:'workflow_owner',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',:'workflow_owner','is_anonymous',false)::text,true);
select public.confirm_transfer_match(jsonb_build_object('from_account',:'workflow_from','to_account',:'workflow_to','amount_paise',10029,'debit_on',folio_private.today(),'credit_on',folio_private.today(),'description','Synthetic retry race','debit_source',jsonb_build_object('sha',repeat('d',64),'row','1:2'),'credit_source',jsonb_build_object('sha',repeat('e',64),'row','1:3'),'existing_transfer',null),:'workflow_request'::uuid);
select pg_sleep(0.25);
commit;
SQL
psql -X -v ON_ERROR_STOP=1 -v workflow_owner="$workflow_owner" -v workflow_from="$workflow_from" -v workflow_to="$workflow_to" -v workflow_request="$workflow_request" -f "$workflow_work/worker.sql" > "$workflow_work/one.log" &
workflow_pid_one=$!
psql -X -v ON_ERROR_STOP=1 -v workflow_owner="$workflow_owner" -v workflow_from="$workflow_from" -v workflow_to="$workflow_to" -v workflow_request="$workflow_request" -f "$workflow_work/worker.sql" > "$workflow_work/two.log" &
workflow_pid_two=$!
wait "$workflow_pid_one"
wait "$workflow_pid_two"
cat > "$workflow_work/check.sql" <<'SQL'
select 1/((count(*)=2 and sum(amount_paise)=0)::integer)from public.transactions where user_id=:'workflow_owner'::uuid;
select 1/((count(*)=2)::integer)from folio_private.transfer_sources where user_id=:'workflow_owner'::uuid;
select 1/((count(*)=2)::integer)from public.audit_events where user_id=:'workflow_owner'::uuid and table_name='transactions';
SQL
psql -X -v ON_ERROR_STOP=1 -v workflow_owner="$workflow_owner" -f "$workflow_work/check.sql" > /dev/null
echo 'PASS: concurrent paired-statement retries post two balanced legs once'
