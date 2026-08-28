update public.dispatch_log as child
set parent_log_id = (
  select base.id
  from public.dispatch_log as base
  where base.company_id = child.company_id
    and base.dispatch_date = child.dispatch_date
    and base.driver_profile_id = child.driver_profile_id
    and base.truck_number = child.truck_number
    and base.leg_number = 1
    and base.id <> child.id
  order by
    case when base.created_at <= child.created_at then 0 else 1 end,
    abs(extract(epoch from (child.created_at - base.created_at)))
  limit 1
)
where child.leg_number > 1
  and child.parent_log_id is null;
