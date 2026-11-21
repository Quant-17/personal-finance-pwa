-- Owner explicitly removed the email feature. Preserve all settled accounting.
-- Drop only the retired integration's functions/metadata, never ledger or subscriptions.
do $$ declare job record; begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  for job in execute 'select jobid from cron.job where jobname=''folio-gmail-receipts''' loop
   execute format('select cron.unschedule(%L)',job.jobid);
  end loop;
 end if;
 if to_regclass('vault.secrets') is not null then
  execute 'delete from vault.secrets where name in (''folio_gmail_function_url'',''folio_gmail_scheduler_secret'')';
 end if;
end $$;
drop function if exists public.gmail_service(text,uuid,jsonb);
drop function if exists folio_private.gmail_service(text,uuid,jsonb);
drop function if exists public.review_gmail_receipt(uuid,text,uuid,uuid,bigint,date,uuid,uuid);
drop function if exists folio_private.review_gmail_receipt(uuid,text,uuid,uuid,bigint,date,uuid,uuid);
drop function if exists public.gmail_plan_status();
drop function if exists folio_private.gmail_plan_status();
drop table if exists folio_private.gmail_oauth_states;
drop table if exists folio_private.gmail_credentials;
drop table if exists public.gmail_receipts;
drop table if exists public.gmail_connections;
drop table if exists public.subscription_charges;
notify pgrst,'reload schema';
