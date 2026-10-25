-- InsureDrive v1.5.1 - Bootstrap role repair
-- Run in Supabase SQL Editor on the EXISTING project.
-- This repairs ONLY the three bootstrap accounts used for the initial InsureDrive setup.
-- The public.profiles role remains the authoritative source used by Flutter and RLS.

begin;

-- Make sure the three known bootstrap Auth users have matching profile rows.
insert into public.profiles (
  id, full_name, email, phone, role, province, district, is_active, account_status, updated_at
)
select
  u.id,
  case
    when lower(u.email) = 'admin@insuredrive.lk' then 'InsureDrive Administrator'
    when lower(u.email) = 'officer@insuredrive.lk' then 'Insurance Officer'
    when lower(u.email) = 'owner@insuredrive.lk' then 'Vehicle Owner'
    else split_part(coalesce(u.email, 'InsureDrive User'), '@', 1)
  end,
  lower(coalesce(u.email, '')),
  '',
  case
    when lower(u.email) = 'admin@insuredrive.lk' then 'administrator'::public.app_role
    when lower(u.email) = 'officer@insuredrive.lk' then 'insurance_officer'::public.app_role
    else 'vehicle_owner'::public.app_role
  end,
  'Western',
  'Colombo',
  true,
  'active',
  now()
from auth.users u
where lower(u.email) in (
  'admin@insuredrive.lk',
  'officer@insuredrive.lk',
  'owner@insuredrive.lk'
)
on conflict (id) do update set
  email = excluded.email,
  role = excluded.role,
  is_active = true,
  account_status = 'active',
  updated_at = now();

-- Remove user-specific DENY overrides from the bootstrap Administrator.
-- Administrator role defaults remain authoritative for all published admin permissions.
delete from public.user_permissions up
using auth.users u
where up.user_id = u.id
  and lower(u.email) = 'admin@insuredrive.lk'
  and up.allowed = false;

commit;

-- Verification result should show exactly:
-- admin@insuredrive.lk   | administrator      | active | true
-- officer@insuredrive.lk | insurance_officer  | active | true
-- owner@insuredrive.lk   | vehicle_owner      | active | true
select
  lower(u.email) as email,
  p.role,
  p.account_status,
  p.is_active
from auth.users u
join public.profiles p on p.id = u.id
where lower(u.email) in (
  'admin@insuredrive.lk',
  'officer@insuredrive.lk',
  'owner@insuredrive.lk'
)
order by u.email;
