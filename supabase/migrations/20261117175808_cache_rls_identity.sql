-- Cache the JWT object itself once per statement, rather than the JSON extraction.
-- Preserve each policy's role, command, ownership condition and anonymous-user denial.
do $$
declare p record; predicate text; owner_column text;
begin
 for p in select tablename,policyname,cmd from pg_policies where schemaname='public' and tablename in ('profiles','accounts','categories','transactions','loans','loan_payments','subscriptions','budgets','savings_goals','goal_allocations') loop
  owner_column:=case when p.tablename='profiles' then 'id' else 'user_id' end;
  predicate:=format('(select auth.uid()) = %I and ((select auth.jwt())->>''is_anonymous'') is distinct from ''true''',owner_column);
  if p.cmd='INSERT' then
   execute format('alter policy %I on public.%I with check (%s)',p.policyname,p.tablename,predicate);
  elsif p.cmd='UPDATE' then
   execute format('alter policy %I on public.%I using (%s) with check (%s)',p.policyname,p.tablename,predicate,predicate);
  else
   execute format('alter policy %I on public.%I using (%s)',p.policyname,p.tablename,predicate);
  end if;
 end loop;
end $$;
