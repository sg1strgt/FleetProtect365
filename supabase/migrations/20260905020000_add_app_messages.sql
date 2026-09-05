create table if not exists public.app_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  sender_id uuid not null references public.employee_profiles(id),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 2000),
  link_url text,
  priority text not null default 'normal' check (priority in ('normal', 'important', 'urgent')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.app_message_recipients (
  message_id uuid not null references public.app_messages(id) on delete cascade,
  recipient_id uuid not null references public.employee_profiles(id) on delete cascade,
  delivered_at timestamptz,
  read_at timestamptz,
  acknowledged_at timestamptz,
  primary key (message_id, recipient_id)
);

create index if not exists app_messages_company_created_idx on public.app_messages(company_id, created_at desc);
create index if not exists app_message_recipients_user_idx on public.app_message_recipients(recipient_id, read_at);

alter table public.app_messages enable row level security;
alter table public.app_message_recipients enable row level security;

create or replace function public.is_company_admin(target_company uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.employee_profiles ep where ep.id=auth.uid() and ep.company_id=target_company and ep.deleted_at is null and ep.role in ('admin','super_admin'));
$$;

create or replace function public.is_message_recipient(target_message uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.app_message_recipients mr where mr.message_id=target_message and mr.recipient_id=auth.uid());
$$;

create or replace function public.is_message_admin(target_message uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.app_messages m where m.id=target_message and public.is_company_admin(m.company_id));
$$;

drop policy if exists "messages visible to sender or recipient" on public.app_messages;
create policy "messages visible to sender or recipient" on public.app_messages for select to authenticated using (
  public.is_company_admin(company_id) or public.is_message_recipient(id)
);
drop policy if exists "messages created by company admins" on public.app_messages;
create policy "messages created by company admins" on public.app_messages for insert to authenticated with check (sender_id=auth.uid() and public.is_company_admin(company_id));
drop policy if exists "messages deleted by company admins" on public.app_messages;
create policy "messages deleted by company admins" on public.app_messages for delete to authenticated using (public.is_company_admin(company_id));

drop policy if exists "message recipients visible to user or admin" on public.app_message_recipients;
create policy "message recipients visible to user or admin" on public.app_message_recipients for select to authenticated using (
  recipient_id=auth.uid() or public.is_message_admin(message_id)
);
drop policy if exists "message recipients added by admins" on public.app_message_recipients;
create policy "message recipients added by admins" on public.app_message_recipients for insert to authenticated with check (
  public.is_message_admin(message_id)
);
drop policy if exists "recipients update their message status" on public.app_message_recipients;
create policy "recipients update their message status" on public.app_message_recipients for update to authenticated using (recipient_id=auth.uid()) with check (recipient_id=auth.uid());
drop policy if exists "message recipients removed by admins" on public.app_message_recipients;
create policy "message recipients removed by admins" on public.app_message_recipients for delete to authenticated using (
  public.is_message_admin(message_id)
);
