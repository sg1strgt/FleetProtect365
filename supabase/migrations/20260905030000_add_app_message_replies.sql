create table if not exists public.app_message_replies (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.app_messages(id) on delete cascade,
  author_id uuid not null references public.employee_profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists app_message_replies_message_idx on public.app_message_replies(message_id, created_at);
alter table public.app_message_replies enable row level security;
create policy "message replies visible to participants" on public.app_message_replies for select to authenticated using (public.is_message_admin(message_id) or public.is_message_recipient(message_id));
create policy "message participants can reply" on public.app_message_replies for insert to authenticated with check (author_id=auth.uid() and (public.is_message_admin(message_id) or public.is_message_recipient(message_id)));
