alter table public.companies
  add column if not exists driver_entry_retention_hours integer;

update public.companies
set driver_entry_retention_hours = case
  when upper(company_code) = 'WFS' then 10
  else 24
end
where driver_entry_retention_hours is null;

alter table public.companies
  alter column driver_entry_retention_hours set default 24,
  alter column driver_entry_retention_hours set not null;

alter table public.companies
  drop constraint if exists companies_driver_entry_retention_hours_check;

alter table public.companies
  add constraint companies_driver_entry_retention_hours_check
  check (driver_entry_retention_hours between 1 and 720);
