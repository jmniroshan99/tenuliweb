# InsureDrive v1.5.4 — Administrator Vehicle Owner Assignment

## What changed

InsureDrive now has a dedicated, server-validated ownership assignment workflow. A vehicle is related to its owner by `vehicles.user_id -> profiles.id`; owner name/email are never used as the relationship key.

Only an authenticated, active **Administrator** can assign or reassign a vehicle. This is enforced in four places:

1. Flutter UI — Owner controls are visible only to Administrators.
2. Flutter business rule — `VehicleOwnershipRules.canAssign()` checks the base role directly and does not trust custom permissions.
3. PostgreSQL privileges/RLS — normal authenticated table updates cannot modify `user_id`, `owner_name`, `owner_assigned_at`, or `is_active`.
4. Secure RPC — `assign_vehicle_owner(vehicle_id, owner_id)` revalidates the Administrator and the selected active Vehicle Owner server-side.

## Owner search

The Administrator owner picker:

- searches active `vehicle_owner` profiles only;
- searches full name, NIC, mobile number, and email;
- uses 20-row pagination;
- uses a 350 ms debounce;
- includes loading, retry, and empty states;
- works in Sinhala/English and dark/light themes.

## Assignment / reassignment

For new vehicles, the Administrator selects an active Vehicle Owner and confirms the assignment before registration.

For an existing vehicle, use **Owner / Change Owner**. The RPC validates:

- authenticated session;
- active Administrator role;
- `edit_all_vehicles` privilege;
- vehicle existence;
- target profile existence;
- target role = `vehicle_owner`;
- target account status = active.

The RPC derives the actor from `auth.uid()`; no actor ID is accepted from the Flutter client.

## Why Remove Owner is not enabled

The existing production schema declares:

```sql
vehicles.user_id uuid not null
```

Therefore a registered vehicle may not be left without an owner. To remove a current owner, the Administrator must **reassign directly to another active Vehicle Owner**. This is the safe behavior requested for schemas where ownership is mandatory.

The audit trigger already understands `VEHICLE_OWNER_REMOVED` for a future schema that makes `user_id` nullable, but v1.5.4 does not relax the current database rule.

## Audit events

The migration records:

- `VEHICLE_OWNER_ASSIGNED` — initial assignment when a vehicle is created;
- `VEHICLE_OWNER_CHANGED` — reassignment from one owner to another;
- `VEHICLE_OWNER_REMOVED` — future-compatible event if nullable ownership is introduced later.

Metadata includes `registration_number`, `old_owner_id`, and `new_owner_id` as applicable. The actor is always `auth.uid()`.

## Database installation

Run in Supabase SQL Editor **after** the existing Advanced Admin Security migration:

```text
supabase/VEHICLE_OWNER_ASSIGNMENT_RUN_THIS.sql
```

Then verify with:

```text
supabase/VERIFY_VEHICLE_OWNER_ASSIGNMENT.sql
```

If using Supabase CLI migrations, the same migration is included as:

```text
supabase/migrations/20260813_vehicle_owner_assignment.sql
```

## Important policy behavior

Vehicle Owner selection remains:

```sql
vehicles.user_id = auth.uid()
```

for owner-side vehicle visibility. Insurance Officers do not receive ownership-change controls and cannot bypass the database restriction even if a custom permission is accidentally assigned.

## APK build

If applying this update to the Android-enabled working project on Windows:

```cmd
flutter clean
flutter pub get
flutter test
flutter build apk --release
```

APK output:

```text
build\app\outputs\flutter-apk\app-release.apk
```

If the source-only ZIP does not contain an Android platform folder, apply the PATCH ZIP to the already Android-enabled v1.5.3.2/v1.5.3.1 project, or generate Android once with:

```cmd
flutter create . --platforms=android --org lk.insuredrive
```

Then restore the Internet permission and your existing Android release settings before building.
