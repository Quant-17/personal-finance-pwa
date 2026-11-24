begin;
do $$
declare
  owner_id uuid := gen_random_uuid();
  plan_id uuid;
begin
  insert into auth.users(id,email,email_confirmed_at) values(owner_id,'window-test@example.invalid',now());
  insert into public.subscriptions(user_id,name,amount_paise,cadence,next_due_on)
    values(owner_id,'Synthetic monthly bill',10000,'monthly','2026-12-10') returning id into plan_id;
  update public.subscriptions set payment_window_start=1 where id=plan_id;
  begin
    update public.subscriptions set payment_window_start=11 where id=plan_id;
    raise exception 'Window after deadline accepted';
  exception when check_violation then null;
  end;
  begin
    update public.subscriptions set cadence='weekly' where id=plan_id;
    raise exception 'Weekly window accepted';
  exception when check_violation then null;
  end;
end $$;
rollback;
