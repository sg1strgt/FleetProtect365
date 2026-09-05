create or replace function public.get_my_app_messages()
returns table (
  message_id uuid,
  delivered_at timestamptz,
  read_at timestamptz,
  acknowledged_at timestamptz,
  app_messages jsonb
)
language sql
stable
security definer
set search_path=public
as $$
  select r.message_id, r.delivered_at, r.read_at, r.acknowledged_at,
    jsonb_build_object(
      'id',m.id,'title',m.title,'body',m.body,'link_url',m.link_url,
      'priority',m.priority,'expires_at',m.expires_at,'created_at',m.created_at
    )
  from public.app_message_recipients r
  join public.app_messages m on m.id=r.message_id
  where r.recipient_id=auth.uid() and r.acknowledged_at is null
  order by m.created_at;
$$;

revoke all on function public.get_my_app_messages() from public;
grant execute on function public.get_my_app_messages() to authenticated;
