create table if not exists public.fedex_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null check (code ~ '^[0-9]{1,10}$'),
  name text not null check (char_length(name) <= 100),
  address text check (address is null or char_length(address) <= 250),
  latitude double precision,
  longitude double precision,
  phone text check (phone is null or char_length(phone) <= 20),
  routes jsonb not null default '[]'::jsonb,
  directions text check (directions is null or char_length(directions) <= 1000),
  instructions text check (instructions is null or char_length(instructions) <= 1000),
  notes text check (notes is null or char_length(notes) <= 1000),
  links jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_by uuid references public.employee_profiles(id),
  updated_by uuid references public.employee_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create table if not exists public.fedex_location_figures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid not null references public.fedex_locations(id) on delete cascade,
  storage_path text not null unique,
  original_name text,
  mime_type text not null default 'image/jpeg',
  file_size_bytes bigint,
  display_order integer not null default 0,
  created_by uuid references public.employee_profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists fedex_locations_company_code_idx on public.fedex_locations(company_id, code);
create index if not exists fedex_location_figures_location_idx on public.fedex_location_figures(location_id, display_order);

alter table public.fedex_locations enable row level security;
alter table public.fedex_location_figures enable row level security;

drop policy if exists "fedex locations managed by admins" on public.fedex_locations;
create policy "fedex locations managed by admins" on public.fedex_locations for all to authenticated
  using (company_id = public.current_company_id() and public.current_user_role() in ('admin'::public.user_role, 'super_admin'::public.user_role))
  with check (company_id = public.current_company_id() and public.current_user_role() in ('admin'::public.user_role, 'super_admin'::public.user_role));

drop policy if exists "fedex figures managed by admins" on public.fedex_location_figures;
create policy "fedex figures managed by admins" on public.fedex_location_figures for all to authenticated
  using (company_id = public.current_company_id() and public.current_user_role() in ('admin'::public.user_role, 'super_admin'::public.user_role))
  with check (company_id = public.current_company_id() and public.current_user_role() in ('admin'::public.user_role, 'super_admin'::public.user_role));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fedex-location-figures', 'fedex-location-figures', false, 1048576, array['image/jpeg','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg','image/webp'];

drop policy if exists "fedex figure files managed by admins" on storage.objects;
create policy "fedex figure files managed by admins" on storage.objects for all to authenticated
  using (
    bucket_id = 'fedex-location-figures'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.current_user_role() in ('admin'::public.user_role, 'super_admin'::public.user_role)
  )
  with check (
    bucket_id = 'fedex-location-figures'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.current_user_role() in ('admin'::public.user_role, 'super_admin'::public.user_role)
  );
