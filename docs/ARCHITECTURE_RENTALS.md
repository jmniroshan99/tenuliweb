# Rental design and shared contracts

Both clients authenticate against the existing Supabase project and call `public.rental_api(p_action text, p_payload jsonb, p_request_id uuid)`. The browser never directly writes rental tables. The public invoker wrapper reaches a private SECURITY DEFINER function with an explicit search path, active-account checks, role/permission checks and transactional writes. The private schema is not an exposed PostgREST schema.

## Data and authorization

Renters live in `rental_customers`, separate from `profiles`. They do not need a login. A booking references an existing `vehicles.id`; no rental operation changes `vehicles.user_id`. One business configuration is assumed; this is not a multi-tenant SaaS system.

| Permission | Meaning | Defaults |
| --- | --- | --- |
| view_rentals | Read customers/bookings | Administrator |
| manage_rentals | Customer/booking edits and lifecycle | Administrator |
| view_billing | Invoice and ledger read | Administrator |
| manage_billing | Final charges, issue invoices, collect/apply money | Administrator |
| refund_payments | Refund payments/deposits; void invoices | Administrator |
| view_own_rentals | Redacted owned-vehicle rental summaries | Vehicle owner |

Officers require explicit assignment through the existing permissions system. Rental staff functions also require administrator/insurance_officer role, so an accidental owner billing grant cannot grant staff access. Owners receive availability/status/vehicle/time/version only, not renter names, identification, price, notes, invoices or ledger. Direct owner reads of rental tables are denied. Existing protected operations such as owner assignment use their original RPCs.

RLS permits authorized reads; authenticated/anon rental INSERT/UPDATE/DELETE privileges are revoked. Issued snapshots and ledger records are append-only through the API except the permitted invoice status transition to void. No PDF bucket or public document link exists. PDFs are generated locally from an authorized in-memory snapshot and have no remote permanent URL. Logout clears client-visible user data and subscriptions; downloaded files remain the user's responsibility.

## Lifecycle, overlap and edits

Draft → confirmed → active → completed. Draft/confirmed can be cancelled with a reason. Completed invoices require a verified return. Active rentals cannot simply be cancelled: return the vehicle, settle charges and refund as appropriate. Cancellation does not automatically issue a refund and cancelled bookings accept refunds only.

Confirmed and active reservations occupy `[pickup_at, return_at)`; an exact boundary handover is permitted. Draft/cancelled/completed rows do not block future bookings. Confirmation, checkout and extension validate an active vehicle and serialize using the vehicle row and a transaction advisory lock. An overdue active rental blocks a new confirmation on that vehicle. Checkout is blocked while any other rental on it remains active. Extension only moves the agreed return later and must pass the same overlap check.

Booking/customer updates use version checks. Null/missing/stale versions cannot bypass them. All financial actions lock the booking row, so issuance, allocation, refund and deposit movements serialize for the same booking. Invoice and receipt sequences supply unique monotonically increasing numbers; rollback gaps are allowed and numbers are not reset each year. Independent native PostgreSQL sessions still need the supplied concurrency test in the target environment.

Web vehicle and policy edit forms also compare the loaded `updated_at` when saving. Existing protected RPC contracts are preserved. No offline write queue exists: offline writes surface errors. Both clients refetch on subscription reconnect/resume and periodically; overlapping refresh requests are coalesced with a follow-up refresh. Owner summaries refresh by poll/focus, as their direct row subscriptions cannot expose private rows.

## Authoritative calculation

All money uses integer LKR minor units (100 minor = LKR 1); durations/distance use PostgreSQL numeric arithmetic. Client fields accept money with at most two decimal places. No GPS distance is substituted for recorded odometers.

- Hourly: started 60-minute periods.
- Daily: started 24-hour periods, not calendar dates.
- Monthly: started fixed 30-day periods, not calendar months.
- Minimum one period. The contractual duration is the minimum charge; early return does not reduce it.
- Grace minutes apply only to actual overtime beyond the agreed duration. Exceeding grace adds started billing periods under the same plan.
- Included kilometres = included km per billed period × billed periods. Excess = max(0, return odometer − checkout odometer − included allowance).
- Subtotal = base rent + rounded excess-km charge + itemized extras. Extras are positive/non-negative minor-unit amounts; up to 50 labels, each at most 150 characters.
- Discount is subtracted before tax and cannot exceed the subtotal. Tax is explicitly configured in basis points (100 basis points = 1%); tax on the discounted amount rounds half up to a minor unit. No default statutory tax is assumed.

Fixture: 3 × LKR 8,000 = 24,000; 380 actual km − 300 allowance = 80 × LKR 100 = 8,000; delivery 2,000; discount 1,000; no tax → **33,000**. Allocated advance 10,000 → **23,000** balance. Deposit 15,000 is separate.

## Ledger, invoices and correction

A payment before issuance is an advance. On issuance, net prior payments/refunds/deposit applications allocate to the invoice. Deposits do not allocate automatically. Deposit application needs an issued invoice and reason; both balance and available deposit are checked. Partial payments are supported; overpayments/overrefunds are rejected. Refunds reduce allocated payments; deposit refunds reduce only the held deposit. No payment gateway or automatic bank transaction is implied.

Issued invoices snapshot customer contact details, business details, vehicle registration/make/model, booking terms and calculated lines. Contact/rate edits do not change those snapshots. Live allocated payment/deposit balances are labeled with the display time separately from fixed issued charges. The bundled application logo is a versioned asset, not a per-invoice uploaded image. Invoice lifecycle (`issued`/`void`), derived payment state (`unpaid`/`partial`/`paid`) and overdue date are separate.

For corrections, refund the allocated amount first (net allocation must be zero), void with a reason, adjust completed booking charges with a reason and version, then issue a new invoice. Old invoice snapshot and ledger remain. There is no destructive delete/reset operation or credit-note tax compliance claim.

Mutations require an idempotency UUID. Server requests are scoped to authenticated actor and key, and payload hashes prevent reuse with changed content. Booking/ledger/invoice result and idempotency result commit atomically. Clients retain retry keys until success in the current session. A page/app restart can lose an in-flight retry key: reconcile the ledger before manually re-entering a payment after an uncertain failure/restart. Issuance and overlap constraints still protect their corresponding operations.

## API actions

Reads: `list`, `quote` (booking `id`). Mutations: `customer_save`, `booking_save`, `confirm`, `checkout`, `return`, `extend`, `cancel`, `charges_update`, `invoice_issue`, `invoice_void`, `payment`, `deposit`, `deposit_apply`, `refund`, `deposit_refund`, `business_save`.

`customer_save`/`booking_save` use `id` and `version` for edits. Lifecycle, final-charge and issuance requests use booking `id` and `version`. Return adds `odometer_in` and `actual_return_at`; checkout adds `odometer_out`; extend adds `return_at`. Invoice issue adds `due_date`; void uses `invoice_id` and `reason`. Money actions use booking `id`, `amount_minor`, `method`, optional `reference`, and a mandatory reason for refunds/applications. UI does not expose raw API fields to ordinary operators.

Audit records include actor, action, entity, amount and reason without copying full renter identity documents. Existing administrator permission RPCs retain their audits. Refund methods are recorded descriptions of externally completed actions, not instructions to a payment processor.

## Source map

- `insuredrive-web/src/features`: rentals, operational legacy modules, printable documents.
- `insuredrive-web/src/lib`: shared backend client and precise input/display helpers.
- `insuredrive-web/src/demo`: explicitly synthetic platform plus exact rental SQL.
- `lib/services/rental_repository.dart`: same checked RPC and retry handling for Android.
- `lib/screens/rentals_screen.dart`: native rental workflows; document portal handoff.
- `supabase/RENTALS_UPGRADE.sql`: authoritative migration, copied into timestamp migration/demo.

The rental list currently returns all authorized rental rows, with client-side table pagination. Very large fleets should add server cursor pagination before substantial growth. Existing GPS map/history and legacy modules depend on deployed migrations and permissions and have not been tested against live data here.
