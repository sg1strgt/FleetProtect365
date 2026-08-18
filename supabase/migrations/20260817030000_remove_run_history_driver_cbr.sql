alter table public.run_history_drivers
  drop constraint if exists run_history_drivers_company_id_cbr_key;

alter table public.run_history_drivers
  drop column if exists cbr;

alter table public.run_history_drivers
  drop constraint if exists run_history_drivers_company_id_fedex_id_key;

alter table public.run_history_drivers
  add constraint run_history_drivers_company_id_fedex_id_key
  unique (company_id, fedex_id);
