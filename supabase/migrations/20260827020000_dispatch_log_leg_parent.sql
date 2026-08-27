alter table public.dispatch_log
  add column if not exists parent_log_id uuid references public.dispatch_log(id) on delete cascade;

create index if not exists dispatch_log_parent_idx
  on public.dispatch_log(parent_log_id, leg_number);
