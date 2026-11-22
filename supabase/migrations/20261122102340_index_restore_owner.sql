-- Cover owner checks and the Auth cascade without changing financial records.
create index restore_runs_owner_idx on folio_private.restore_runs(user_id);
