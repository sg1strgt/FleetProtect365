alter table public.employee_profiles
  add column if not exists is_tester boolean not null default false;

alter table public.employee_profiles
  drop constraint if exists employee_profiles_role_check;

alter table public.employee_profiles
  add constraint employee_profiles_role_check
  check (role in ('driver', 'user', 'admin', 'super_admin'));

update public.employee_profiles
set is_tester = true
where lower(email) = 'steven@fleetprotect365.com'
  and role = 'super_admin';
