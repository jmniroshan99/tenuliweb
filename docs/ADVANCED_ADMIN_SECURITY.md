# InsureDrive v1.5 – Advanced Administrator Security

This upgrade implements the requested production-oriented administration model on top of the existing Supabase RBAC project.

## Enforced access

- **Administrator**: the only role allowed to register, reassign, edit, activate/deactivate or delete vehicles; can manage users, roles, statuses, user-specific permissions, login activity and audit logs.
- **Insurance Officer**: can view Vehicle Owner customers and vehicles and manage policies/reminders, but cannot register/edit/deactivate vehicles or access security administration.
- **Vehicle Owner**: can view assigned vehicles, own policies/reminders and edit approved profile fields. There is no Add Vehicle action.

The Flutter client uses a centralized permission model. PostgreSQL RLS and protected RPCs independently enforce the sensitive operations, so a modified client cannot bypass the vehicle/Admin restrictions.

## Database deployment

For a database that already has `RBAC_UPGRADE_RUN_THIS.sql` applied:

1. Supabase Dashboard → **SQL Editor** → **New query**.
2. Open `supabase/ADVANCED_ADMIN_SECURITY_RUN_THIS.sql`.
3. Copy all SQL and run it.
4. Open `supabase/VERIFY_ADVANCED_ADMIN_SECURITY.sql`, run it separately, and review the results.

The advanced migration adds rich profile fields, account status, vehicle registration details, permission tables, login activity, audit logs, indexes, permission-aware RLS and protected RPCs.

## Edge Functions

Deploy/redeploy:

```bash
supabase login
supabase link --project-ref ssykwhwnujxkzokpdeey
supabase functions deploy admin-manage-users
supabase functions deploy record-login-activity
supabase functions deploy send-policy-reminder
supabase functions deploy check-expiring-policies
```

`admin-manage-users` creates Owner/Officer accounts and manages active/inactive/suspended status. It verifies the caller is an active Administrator and respects the Admin's effective `create_users` / `manage_user_status` privileges.

`record-login-activity` records successful login, failed login, logout and restored-session events. It never accepts or stores passwords, access tokens or refresh tokens. Failed-login logging is rate-limited because it can occur before a user has a valid session.


## Security screens

Administrator security screens include paginated Login Activity and Audit Logs. Both support search and date-range filtering; Login Activity also filters by event/result and exposes recorded platform/browser/device/IP values when they were actually captured. Audit Logs also filter by action and entity type. User Details provides a direct **View Activity** action and shows the latest recorded login platform, browser, device and IP address without fabricating missing client data.

## Manual privileges

The Admin Access Privileges screen uses:

- `role_permissions` for base-role defaults.
- `user_permissions` for user-specific allow/deny overrides.
- `get_effective_permissions()` / `has_permission()` for evaluation.

Overrides can reduce access or restore valid capabilities for a base role. They cannot grant Administrator-only capabilities to Officer/Owner, and Vehicle Owner can never be granted policy issuing or vehicle administration.

## Account status

`profiles.account_status` supports:

- `active`
- `inactive`
- `suspended`

Inactive/suspended profiles fail `current_user_is_active()`, so RLS denies protected data operations. Device notification tokens are disabled when an Admin deactivates/suspends an account.

The last active Administrator cannot be demoted, deactivated or suspended.

## Audit data

`login_activity` records authentication events. `audit_logs` records protected actions such as user creation/status changes, role/permission changes, vehicle changes, policy changes and profile updates. Passwords and tokens must never be written into either table.

## Sri Lanka defaults retained

- LKR
- +94
- Asia/Colombo
- 9 provinces / 25 districts
- Sri Lankan insurer and policy defaults
