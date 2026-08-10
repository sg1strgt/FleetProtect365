-- Wade Freight drivers may read active FedEx locations and their private reference photos.
drop policy if exists "wfs users read fedex locations" on public.fedex_locations;
create policy "wfs users read fedex locations"
  on public.fedex_locations for select to authenticated
  using (
    active
    and company_id = public.current_company_id()
  );

drop policy if exists "wfs users read fedex figures" on public.fedex_location_figures;
create policy "wfs users read fedex figures"
  on public.fedex_location_figures for select to authenticated
  using (
    company_id = public.current_company_id()
  );

drop policy if exists "wfs users read fedex figure files" on storage.objects;
create policy "wfs users read fedex figure files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'fedex-location-figures'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );
