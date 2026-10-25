# RBAC + Sri Lanka Production Notes

## Roles

### 1. Vehicle Owner (`vehicle_owner`)
- Sees only their own vehicles and policies.
- Receives their own expiry notifications.
- Can maintain their profile and device token.

### 2. Insurance Officer (`insurance_officer`)
- Can view customer vehicle/policy records for operational work.
- Can create/update vehicle and policy records for customer accounts.
- Cannot assign Administrator privileges.

### 3. Administrator (`administrator`)
- Portfolio-wide access.
- May manage user roles through a protected admin process.

## Important role-security rule

The `handle_new_user()` database trigger always creates a new signup as `vehicle_owner`. Do not accept a role supplied by the public mobile client during signup.

After creating a genuine staff account through your controlled process, promote it from a trusted backend / SQL admin session, for example:

```sql
update public.profiles
set role = 'insurance_officer'
where id = '<AUTH-USER-UUID>';
```

Administrator provisioning:

```sql
update public.profiles
set role = 'administrator'
where id = '<AUTH-USER-UUID>';
```

Never expose a service-role key or direct role-promotion operation in the Flutter client.

## Sri Lanka defaults

The Flutter demo includes:

- `LKR`
- `+94`
- `Asia/Colombo`
- Western / Central / Southern / Northern / Eastern / North Western / North Central / Uva / Sabaragamuwa provinces
- all 25 districts grouped under their province
- motor insurance cover types commonly used in the demo workflow
- a provider dropdown seeded from insurers shown by IRCSL as licensed for General Insurance when checked in August 2026

Official insurer reference:

`https://ircsl.gov.lk/insurance-companies/`

The insurer list is external regulatory data and can change. For production, maintain it in a backend reference table and periodically verify it against IRCSL instead of shipping it permanently as a hard-coded list.

## Vehicle registration field

The registration value is intentionally kept as flexible uppercase text rather than applying a rigid regex. Sri Lankan registration formats vary across vehicle ages/categories, so production validation should be based on the exact Department of Motor Traffic rules applicable to the records you support.

## Privacy

Vehicle registration numbers, chassis/engine numbers, policy details, contact information and uploaded policy documents can be sensitive operational/customer data. Apply least-privilege RLS, private storage, encryption in transit, audit logging, secure authentication and an appropriate privacy/retention policy before live deployment.
