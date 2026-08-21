alter table public.time_off_requests
  add column if not exists comments text;

alter table public.time_off_requests
  drop constraint if exists time_off_requests_comments_length_check;

alter table public.time_off_requests
  add constraint time_off_requests_comments_length_check
  check (comments is null or char_length(comments) <= 500);
