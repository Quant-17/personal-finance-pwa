-- Cache the JWT object per statement while preserving owner/anonymous predicates.
alter policy owner_select on public.saved_simulations using ((select auth.uid()) = user_id and ((select auth.jwt())->>'is_anonymous') is distinct from 'true');
alter policy owner_insert on public.saved_simulations with check ((select auth.uid()) = user_id and ((select auth.jwt())->>'is_anonymous') is distinct from 'true');
alter policy owner_delete on public.saved_simulations using ((select auth.uid()) = user_id and ((select auth.jwt())->>'is_anonymous') is distinct from 'true');
