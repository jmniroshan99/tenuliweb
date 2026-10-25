-- InsureDrive v1.5.1 - Verify bootstrap identities and effective permissions.
select
  lower(u.email) as email,
  p.id,
  p.role,
  p.account_status,
  p.is_active,
  p.updated_at
from auth.users u
join public.profiles p on p.id = u.id
where lower(u.email) in (
  'admin@insuredrive.lk',
  'officer@insuredrive.lk',
  'owner@insuredrive.lk'
)
order by u.email;

-- Administrator should have all role-default permissions unless a deliberate custom override exists.
select rp.permission_key, rp.allowed
from public.role_permissions rp
where rp.role = 'administrator'::public.app_role
order by rp.permission_key;
