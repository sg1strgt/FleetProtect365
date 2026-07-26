alter table public.trucks
  add column if not exists year integer,
  add column if not exists make text,
  add column if not exists model text,
  add column if not exists vin text,
  add column if not exists license_plate text,
  add column if not exists plate_state text,
  add column if not exists quarterly_inspection date,
  add column if not exists annual_inspection date,
  add column if not exists insurance_expiration date,
  add column if not exists notes text;

create unique index if not exists trucks_company_vin_unique
  on public.trucks (company_id, upper(vin))
  where vin is not null and btrim(vin) <> '' and deleted_at is null;
