# InsureDrive v1.5 RBAC Implementation

## Access matrix

| Capability | Administrator | Insurance Officer | Vehicle Owner |
|---|---:|---:|---:|
| View/edit own profile | Yes | Yes | Yes |
| View all users | Yes | No | No |
| View Vehicle Owner directory | Yes | Yes | No |
| Create Owner/Officer users | Yes | No | No |
| Change roles/status | Yes | No | No |
| Manage user-specific permissions | Yes | No | No |
| View all vehicles | Yes | Yes | No |
| View own assigned vehicles | Yes | Yes | Yes |
| Register vehicles | **Yes** | **No** | **No** |
| Reassign/edit/deactivate vehicles | **Yes** | **No** | **No** |
| View all policies | Yes | Yes | No |
| View own policies | Yes | Yes | Yes |
| Create/edit/renew policies | Yes | Yes | No |
| Request own renewal | Yes | No | Yes |
| Void policy | Yes | No | No |
| View Login Activity / Audit Logs | Yes | No | No |
| Reports/settings | Yes | No | No |

Fine-grained overrides can disable/restore capabilities valid for a base role. They cannot elevate Officer/Owner into Administrator-only functionality.

## Enforcement layers

1. Flutter centralized `AppPermission` checks determine navigation and actions.
2. `get_effective_permissions()` loads role defaults plus user overrides once per authenticated session.
3. PostgreSQL `has_permission()` is used by RLS for profile, vehicle, policy, notification and renewal access.
4. Vehicle creation/edit/reassignment/deactivation additionally requires the base role `administrator`.
5. User creation/status uses `admin-manage-users` Edge Function.
6. Role and permission changes use protected RPCs.
7. Security-significant operations are written to `audit_logs` by the trusted database/Edge Function path.

## User status

`profiles.account_status` is `active`, `inactive` or `suspended`. Inactive/suspended users may read their own profile only so the client can display the correct status message, while `current_user_is_active()` blocks protected operational data.

## Last Administrator protection

The backend rejects demotion, suspension or deactivation if that would leave no active Administrator.
