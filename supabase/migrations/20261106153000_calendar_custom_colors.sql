alter table public.admin_calendar_notes
  drop constraint admin_calendar_notes_important_color_check,
  add constraint admin_calendar_notes_important_color_check
    check (important_color in ('purple', 'blue', 'orange', 'pink')
           or important_color ~ '^#[0-9a-fA-F]{6}$');
