alter table public.admin_calendar_notes
  add column display_status text not null default 'default'
    check (display_status in ('default', 'important', 'reminder')),
  add column important_color text
    check (important_color in ('purple', 'blue', 'orange', 'pink')),
  add column important_bold boolean not null default false,
  add column completed boolean not null default false,
  add column completion_notes text not null default ''
    check (char_length(completion_notes) <= 5000);
