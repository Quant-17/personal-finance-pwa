-- A null opening day retains the fixed charge date for existing plans.
alter table public.subscriptions add column payment_window_start smallint;
alter table public.subscriptions add constraint subscription_payment_window_valid
  check (payment_window_start is null or
    (cadence = 'monthly' and payment_window_start between 1 and extract(day from next_due_on)));
