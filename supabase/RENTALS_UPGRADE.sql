-- InsureDrive additive rental module. Apply once after the documented prerequisites.
-- Single business. No table/role reset. Private checked RPC performs transactional writes.
begin;
do $$ begin
 if to_regprocedure('public.has_permission(text)') is null or
    to_regprocedure('public.current_user_is_active()') is null or
    to_regclass('public.audit_logs') is null then
   raise exception 'Apply existing advanced security and vehicle ownership migrations first';
 end if;
end $$;
create schema if not exists rental_private;
revoke all on schema rental_private from public;
grant usage on schema rental_private to authenticated;
insert into public.permissions(permission_key,name,category,description,admin_only) values
 ('view_rentals','View rentals','Rentals','Read rental customer and booking records',false),
 ('manage_rentals','Manage rentals','Rentals','Create customers and manage booking lifecycle',false),
 ('view_billing','View rental billing','Rentals','Read invoices and payment ledger',false),
 ('manage_billing','Manage rental billing','Rentals','Issue invoices and receive payments',false),
 ('refund_payments','Refund rental payments','Rentals','Refund money and void unpaid invoices',false),
 ('view_own_rentals','View own vehicle rental summaries','Rentals','Redacted vehicle availability summaries',false)
on conflict(permission_key) do nothing;
insert into public.role_permissions(role,permission_key,allowed)
 select 'administrator'::public.app_role,permission_key,true from public.permissions where category='Rentals'
on conflict(role,permission_key) do nothing;
insert into public.role_permissions(role,permission_key,allowed) values
 ('vehicle_owner','view_own_rentals',true) on conflict do nothing;
-- Preserve the deployed allow-list, including any additions absent from the ZIP.
do $$ begin
 if to_regprocedure('rental_private.previous_permission_allowed_for_role(public.app_role,text)') is null then
   alter function public.permission_allowed_for_role(public.app_role,text) set schema rental_private;
   alter function rental_private.permission_allowed_for_role(public.app_role,text) rename to previous_permission_allowed_for_role;
 end if;
end $$;
create or replace function public.permission_allowed_for_role(target_role public.app_role,target_permission_key text)
returns boolean language sql stable set search_path='' as $$
 select rental_private.previous_permission_allowed_for_role(target_role,target_permission_key)
 or (target_role='insurance_officer' and target_permission_key in ('view_rentals','manage_rentals','view_billing','manage_billing','refund_payments'))
 or (target_role='vehicle_owner' and target_permission_key='view_own_rentals');
$$;
revoke all on function public.permission_allowed_for_role(public.app_role,text) from public;
grant execute on function public.permission_allowed_for_role(public.app_role,text) to authenticated;

create table public.rental_customers (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name))>0),
 phone text not null, email text not null default '', address text not null default '',
 identity_reference text not null default '', licence_reference text not null default '',
 version integer not null default 1, created_at timestamptz not null default now()
);
create table public.rental_business (
 id boolean primary key default true check(id), name text not null default 'InsureDrive',
 address text not null default '', phone text not null default '', notes text not null default '',
 version integer not null default 1
);
insert into public.rental_business(id) values(true);
create table public.rental_bookings (
 id uuid primary key default gen_random_uuid(), vehicle_id uuid not null references public.vehicles(id) on delete restrict,
 customer_id uuid not null references public.rental_customers(id) on delete restrict,
 pickup_at timestamptz not null, return_at timestamptz not null, actual_return_at timestamptz,
 status text not null default 'draft' check(status in ('draft','confirmed','active','completed','cancelled')),
 rate_plan text not null default 'daily' check(rate_plan in ('hourly','daily','monthly')),
 rate_minor bigint not null check(rate_minor>=0), included_km numeric(12,2) not null default 0 check(included_km>=0),
 excess_rate_minor bigint not null default 0 check(excess_rate_minor>=0),
 grace_minutes integer not null default 0 check(grace_minutes between 0 and 1440),
 odometer_out numeric(12,2), odometer_in numeric(12,2),
 extras jsonb not null default '[]', discount_minor bigint not null default 0 check(discount_minor>=0),
 tax_bps integer not null default 0 check(tax_bps between 0 and 10000),
 agreement_ref text not null default '', notes text not null default '',
 version integer not null default 1, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(return_at>pickup_at), check(odometer_out is null or odometer_out>=0),
 check(odometer_in is null or odometer_in>=odometer_out),
 check(actual_return_at is null or actual_return_at>pickup_at)
);
create index rental_booking_vehicle_period on public.rental_bookings(vehicle_id,pickup_at,return_at) where status in ('confirmed','active');
create index rental_booking_customer on public.rental_bookings(customer_id);
create sequence rental_private.invoice_number;
create sequence rental_private.receipt_number;
create table public.rental_invoices (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.rental_bookings(id),
 number text not null unique, issued_at timestamptz not null default now(), due_date date not null,
 status text not null default 'issued' check(status in ('issued','void')),
 total_minor bigint not null check(total_minor>=0), snapshot jsonb not null,
 void_reason text, created_by uuid not null references auth.users(id)
);
create unique index rental_one_issued_invoice on public.rental_invoices(booking_id) where status='issued';
create table public.rental_ledger (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.rental_bookings(id),
 receipt_number text not null unique,
 kind text not null check(kind in ('payment','refund','deposit','deposit_refund','deposit_apply')),
 amount_minor bigint not null check(amount_minor>0), method text not null check(method in ('cash','bank','card','deposit')),
 reference text not null default '', reason text not null default '',
 created_at timestamptz not null default now(), created_by uuid not null references auth.users(id)
);
create index rental_ledger_booking on public.rental_ledger(booking_id);
create table public.rental_allocations (
 invoice_id uuid not null references public.rental_invoices(id), ledger_id uuid not null references public.rental_ledger(id),
 amount_minor bigint not null, primary key(invoice_id,ledger_id)
);
create table rental_private.requests (
 actor uuid not null, request_id uuid not null, action text not null, payload_hash text not null,
 response jsonb not null, created_at timestamptz not null default now(), primary key(actor,request_id)
);
revoke all on all tables in schema rental_private from public,anon,authenticated;

create function rental_private.staff(p text) returns boolean language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and public.current_user_is_active() and
 public.current_user_role() in ('administrator','insurance_officer') and public.has_permission(p);
$$;
-- Read-only RLS. Mutations are only through the checked transaction RPC below.
do $$ declare t text; begin
 foreach t in array array['rental_customers','rental_business','rental_bookings','rental_invoices','rental_ledger','rental_allocations'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy rental_customers_read on public.rental_customers for select to authenticated using(rental_private.staff('view_rentals') or rental_private.staff('manage_rentals'));
create policy rental_bookings_read on public.rental_bookings for select to authenticated using(rental_private.staff('view_rentals') or rental_private.staff('manage_rentals'));
create policy rental_business_read on public.rental_business for select to authenticated using(public.current_user_is_active() and auth.uid() is not null);
create policy rental_invoices_read on public.rental_invoices for select to authenticated using(rental_private.staff('view_billing') or rental_private.staff('manage_billing') or rental_private.staff('refund_payments'));
create policy rental_ledger_read on public.rental_ledger for select to authenticated using(rental_private.staff('view_billing') or rental_private.staff('manage_billing') or rental_private.staff('refund_payments'));
create policy rental_allocations_read on public.rental_allocations for select to authenticated using(rental_private.staff('view_billing') or rental_private.staff('manage_billing') or rental_private.staff('refund_payments'));

create function rental_private.quote(b public.rental_bookings) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare units bigint; seconds numeric; unit_seconds numeric; excess numeric; base bigint; extra bigint:=0; subtotal bigint; tax bigint; total bigint; item jsonb; lines jsonb;
begin
 unit_seconds:=case b.rate_plan when 'hourly' then 3600 when 'daily' then 86400 else 2592000 end;
 seconds:=extract(epoch from (coalesce(b.actual_return_at,b.return_at)-b.pickup_at));
 if seconds<=0 then raise exception 'Return must be after pickup'; end if;
 -- Grace applies only to time beyond scheduled return, never discounts the contracted period.
 units:=greatest(1,ceil((greatest(extract(epoch from(b.return_at-b.pickup_at)),seconds-b.grace_minutes*60))/unit_seconds));
 base:=units*b.rate_minor;
 excess:=greatest(0,coalesce(b.odometer_in-b.odometer_out,0)-units*b.included_km);
 lines:=jsonb_build_array(jsonb_build_object('label','Rental ('||b.rate_plan||')','quantity',units,'rate_minor',b.rate_minor,'amount_minor',base));
 if excess>0 then lines:=lines||jsonb_build_array(jsonb_build_object('label','Excess kilometres','quantity',excess,'rate_minor',b.excess_rate_minor,'amount_minor',round(excess*b.excess_rate_minor)::bigint)); end if;
 if jsonb_typeof(b.extras)<>'array' or jsonb_array_length(b.extras)>50 then raise exception 'Invalid charge items'; end if;
 for item in select * from jsonb_array_elements(b.extras) loop
   if jsonb_typeof(item)<>'object' or coalesce(length(trim(item->>'label')),0)=0 or length(item->>'label')>150 or (item->>'amount_minor') is null or (item->>'amount_minor')::numeric<0 or (item->>'amount_minor')::numeric<>trunc((item->>'amount_minor')::numeric) then raise exception 'Invalid charge item'; end if;
   extra:=extra+(item->>'amount_minor')::bigint;
   lines:=lines||jsonb_build_array(jsonb_build_object('label',item->>'label','quantity',1,'rate_minor',(item->>'amount_minor')::bigint,'amount_minor',(item->>'amount_minor')::bigint));
 end loop;
 subtotal:=base+round(excess*b.excess_rate_minor)::bigint+extra;
 if b.discount_minor>subtotal then raise exception 'Discount exceeds subtotal'; end if;
 tax:=round((subtotal-b.discount_minor)::numeric*b.tax_bps/10000)::bigint;
 total:=subtotal-b.discount_minor+tax;
 return jsonb_build_object('units',units,'included_km',units*b.included_km,'excess_km',excess,'lines',lines,'subtotal_minor',subtotal,'discount_minor',b.discount_minor,'tax_bps',b.tax_bps,'tax_minor',tax,'total_minor',total,'policy','Started hourly / 24-hour daily / fixed 30-day monthly periods; half-open reservations; no early-return discount; grace applies only to overtime.');
end $$;

create function rental_private.api(p_action text,p_payload jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare uid uuid:=auth.uid(); b public.rental_bookings; inv public.rental_invoices; item jsonb; result jsonb; prior rental_private.requests;
 id uuid; v uuid; customer uuid; count_rows integer; quote jsonb; n bigint; amount bigint; paid bigint; deposit bigint; current_total bigint; ledger_id uuid;
 can_rent boolean; can_bill boolean; need_permission text; desired text; old_status text;
begin
 if uid is null or not public.current_user_is_active() then raise exception 'Active authenticated account required' using errcode='42501'; end if;
 can_rent:=rental_private.staff('view_rentals') or rental_private.staff('manage_rentals');
 can_bill:=rental_private.staff('view_billing') or rental_private.staff('manage_billing') or rental_private.staff('refund_payments');
 if p_action='list' then
  if not can_rent and not can_bill then
   if not public.has_permission('view_own_rentals') then raise exception 'Rental access denied' using errcode='42501'; end if;
   return jsonb_build_object('owner_only',true,'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'vehicle_id',r.vehicle_id,'pickup_at',r.pickup_at,'return_at',r.return_at,'status',r.status,'version',r.version)) from public.rental_bookings r join public.vehicles v on v.id=r.vehicle_id where v.user_id=uid),'[]'::jsonb),'customers','[]'::jsonb,'invoices','[]'::jsonb,'ledger','[]'::jsonb,'allocations','[]'::jsonb);
  end if;
  return jsonb_build_object('owner_only',false,
   'customers',case when can_rent then coalesce((select jsonb_agg(c order by c.name) from public.rental_customers c),'[]'::jsonb) else '[]'::jsonb end,
   'bookings',case when can_rent or can_bill then coalesce((select jsonb_agg(r order by r.pickup_at desc) from public.rental_bookings r),'[]'::jsonb) else '[]'::jsonb end,
   'invoices',case when can_bill then coalesce((select jsonb_agg(i order by i.issued_at desc) from public.rental_invoices i),'[]'::jsonb) else '[]'::jsonb end,
   'ledger',case when can_bill then coalesce((select jsonb_agg(l order by l.created_at desc) from public.rental_ledger l),'[]'::jsonb) else '[]'::jsonb end,
   'allocations',case when can_bill then coalesce((select jsonb_agg(a) from public.rental_allocations a),'[]'::jsonb) else '[]'::jsonb end,
   'business',(select to_jsonb(x) from public.rental_business x where x.id));
 end if;
 if p_action='quote' then
  if not (can_rent or can_bill) then raise exception 'Quote access denied' using errcode='42501'; end if;
  select * into strict b from public.rental_bookings where rental_bookings.id=(p_payload->>'id')::uuid;
  return rental_private.quote(b);
 end if;
 need_permission:=case
 when p_action in ('customer_save','booking_save','confirm','checkout','return','cancel','extend') then 'manage_rentals'
 when p_action in ('invoice_issue','charges_update','payment','deposit','deposit_apply') then 'manage_billing'
 when p_action in ('refund','deposit_refund','invoice_void') then 'refund_payments'
 when p_action='business_save' then 'manage_system_settings' else null end;
 if need_permission is null or not rental_private.staff(need_permission) then raise exception 'Operation not permitted' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'Idempotency request ID required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||p_request_id::text,0));
 select * into prior from rental_private.requests where actor=uid and request_id=p_request_id;
 if found then
  if prior.action<>p_action or prior.payload_hash<>md5(p_payload::text) then raise exception 'Request ID reused with different content'; end if;
  return prior.response;
 end if;
 id:=nullif(p_payload->>'id','')::uuid;
 if p_action='customer_save' then
  if id is null then
   insert into public.rental_customers(name,phone,email,address,identity_reference,licence_reference)
   values(trim(p_payload->>'name'),coalesce(p_payload->>'phone',''),coalesce(p_payload->>'email',''),coalesce(p_payload->>'address',''),coalesce(p_payload->>'identity_reference',''),coalesce(p_payload->>'licence_reference','')) returning rental_customers.id into id;
  else
   update public.rental_customers set name=trim(p_payload->>'name'),phone=coalesce(p_payload->>'phone',''),email=coalesce(p_payload->>'email',''),address=coalesce(p_payload->>'address',''),identity_reference=coalesce(p_payload->>'identity_reference',''),licence_reference=coalesce(p_payload->>'licence_reference',''),version=version+1 where rental_customers.id=id and version=(p_payload->>'version')::integer;
   get diagnostics count_rows=row_count; if count_rows<>1 then raise exception 'Customer changed. Reload before editing' using errcode='40001'; end if;
  end if;
  result:=jsonb_build_object('id',id);
 elsif p_action='business_save' then
  if public.current_user_role()<>'administrator' then raise exception 'Administrator required'; end if;
  update public.rental_business set name=p_payload->>'name',address=coalesce(p_payload->>'address',''),phone=coalesce(p_payload->>'phone',''),notes=coalesce(p_payload->>'notes',''),version=version+1 where version=(p_payload->>'version')::integer;
  get diagnostics count_rows=row_count; if count_rows<>1 then raise exception 'Business settings changed. Reload' using errcode='40001'; end if;
  result:=jsonb_build_object('saved',true);
 elsif p_action='booking_save' then
  v:=(p_payload->>'vehicle_id')::uuid; customer:=(p_payload->>'customer_id')::uuid;
  if not exists(select 1 from public.vehicles where vehicles.id=v and is_active) then raise exception 'Choose an active vehicle'; end if;
  if id is not null then
   select * into strict b from public.rental_bookings where rental_bookings.id=id for update;
   if b.version is distinct from (p_payload->>'version')::integer then raise exception 'Booking changed. Reload' using errcode='40001'; end if;
   if b.status<>'draft' then raise exception 'Only draft terms can be edited. Use extension for confirmed/active bookings'; end if;
  end if;
  insert into public.rental_bookings as r(id,vehicle_id,customer_id,pickup_at,return_at,rate_plan,rate_minor,included_km,excess_rate_minor,grace_minutes,extras,discount_minor,tax_bps,agreement_ref,notes,created_by)
  values(coalesce(id,gen_random_uuid()),v,customer,(p_payload->>'pickup_at')::timestamptz,(p_payload->>'return_at')::timestamptz,coalesce(p_payload->>'rate_plan','daily'),(p_payload->>'rate_minor')::bigint,coalesce((p_payload->>'included_km')::numeric,0),coalesce((p_payload->>'excess_rate_minor')::bigint,0),coalesce((p_payload->>'grace_minutes')::integer,0),coalesce(p_payload->'extras','[]'),coalesce((p_payload->>'discount_minor')::bigint,0),coalesce((p_payload->>'tax_bps')::integer,0),coalesce(p_payload->>'agreement_ref',''),coalesce(p_payload->>'notes',''),uid)
  on conflict on constraint rental_bookings_pkey do update set vehicle_id=excluded.vehicle_id,customer_id=excluded.customer_id,pickup_at=excluded.pickup_at,return_at=excluded.return_at,rate_plan=excluded.rate_plan,rate_minor=excluded.rate_minor,included_km=excluded.included_km,excess_rate_minor=excluded.excess_rate_minor,grace_minutes=excluded.grace_minutes,extras=excluded.extras,discount_minor=excluded.discount_minor,tax_bps=excluded.tax_bps,agreement_ref=excluded.agreement_ref,notes=excluded.notes,version=r.version+1,updated_at=now()
  returning * into b;
  perform rental_private.quote(b); id:=b.id; result:=to_jsonb(b);
 else
  -- Every booking/financial mutation serializes on the same booking row.
  if p_action='invoice_void' then
   select booking_id into strict id from public.rental_invoices where rental_invoices.id=(p_payload->>'invoice_id')::uuid;
  end if;
  select * into strict b from public.rental_bookings where rental_bookings.id=id for update;
  if p_action in ('confirm','checkout','return','cancel','extend') then
   if b.version is distinct from (p_payload->>'version')::integer then raise exception 'Booking changed. Reload' using errcode='40001'; end if;
   old_status:=b.status;
   if p_action='confirm' then
    if b.status<>'draft' then raise exception 'Only draft bookings can be confirmed'; end if; b.status:='confirmed';
   elsif p_action='checkout' then
    if b.status<>'confirmed' then raise exception 'Confirm before checkout'; end if;
    b.odometer_out:=(p_payload->>'odometer_out')::numeric; if b.odometer_out is null or b.odometer_out<0 then raise exception 'Valid checkout odometer required'; end if;
    b.status:='active';
   elsif p_action='return' then
    if b.status<>'active' then raise exception 'Only active rentals can be returned'; end if;
    b.odometer_in:=(p_payload->>'odometer_in')::numeric;
    b.actual_return_at:=(p_payload->>'actual_return_at')::timestamptz;
    if b.odometer_in is null or b.odometer_in<b.odometer_out or b.actual_return_at is null or b.actual_return_at<=b.pickup_at then raise exception 'Invalid return time or odometer'; end if;
    b.status:='completed';
   elsif p_action='cancel' then
    if b.status not in ('draft','confirmed') then raise exception 'Only draft or confirmed rentals can be cancelled'; end if;
    if length(trim(coalesce(p_payload->>'reason','')))=0 then raise exception 'Cancellation reason required'; end if;
    b.status:='cancelled';
   elsif p_action='extend' then
    if b.status not in ('confirmed','active') then raise exception 'Cannot extend this booking'; end if;
    if (p_payload->>'return_at')::timestamptz<=b.return_at then raise exception 'Extension must be later'; end if;
    b.return_at:=(p_payload->>'return_at')::timestamptz;
   end if;
   if b.status in ('confirmed','active') then
    perform 1 from public.vehicles where vehicles.id=b.vehicle_id and is_active for update;
    if not found then raise exception 'Vehicle is inactive or unavailable'; end if;
    perform pg_advisory_xact_lock(hashtextextended(b.vehicle_id::text,1));
    if exists(select 1 from public.rental_bookings r where r.vehicle_id=b.vehicle_id and r.id<>b.id and r.status in ('confirmed','active') and
     (tstzrange(r.pickup_at,r.return_at,'[)') && tstzrange(b.pickup_at,b.return_at,'[)') or (r.status='active' and (r.return_at<now() or p_action='checkout')))) then raise exception 'Vehicle unavailable: overlapping booking or unreturned rental' using errcode='23P01'; end if;
   end if;
   perform rental_private.quote(b);
   update public.rental_bookings set status=b.status,return_at=b.return_at,actual_return_at=b.actual_return_at,odometer_out=b.odometer_out,odometer_in=b.odometer_in,version=version+1,updated_at=now() where rental_bookings.id=b.id returning * into b;
   result:=to_jsonb(b);
  elsif p_action='charges_update' then
   if b.version is distinct from (p_payload->>'version')::integer then raise exception 'Booking changed. Reload' using errcode='40001'; end if;
   if b.status<>'completed' or exists(select 1 from public.rental_invoices where booking_id=b.id and status='issued') then raise exception 'Charges can be adjusted after return and before issuing an invoice'; end if;
   if length(trim(coalesce(p_payload->>'reason','')))=0 then raise exception 'Adjustment reason required'; end if;
   b.extras:=coalesce(p_payload->'extras',b.extras);b.discount_minor:=coalesce((p_payload->>'discount_minor')::bigint,b.discount_minor);b.tax_bps:=coalesce((p_payload->>'tax_bps')::integer,b.tax_bps);
   perform rental_private.quote(b);
   update public.rental_bookings set extras=b.extras,discount_minor=b.discount_minor,tax_bps=b.tax_bps,version=version+1,updated_at=now() where rental_bookings.id=b.id returning * into b;
   result:=to_jsonb(b);
  elsif p_action='invoice_issue' then
   if b.version is distinct from (p_payload->>'version')::integer then raise exception 'Booking changed. Reopen the quote' using errcode='40001'; end if;
   if b.status<>'completed' then raise exception 'Record return before issuing the final invoice'; end if;
   if exists(select 1 from public.rental_invoices where booking_id=b.id and status='issued') then raise exception 'An issued invoice already exists'; end if;
   quote:=rental_private.quote(b); n:=nextval('rental_private.invoice_number');
   insert into public.rental_invoices(booking_id,number,due_date,total_minor,snapshot,created_by)
   values(b.id,'INV-'||to_char(now() at time zone 'Asia/Colombo','YYYY')||'-'||lpad(n::text,greatest(6,length(n::text)),'0'),(p_payload->>'due_date')::date,(quote->>'total_minor')::bigint,
   jsonb_build_object('booking',to_jsonb(b),'calculation',quote,'customer',(select jsonb_build_object('name',c.name,'phone',c.phone,'address',c.address) from public.rental_customers c where c.id=b.customer_id),'vehicle',(select jsonb_build_object('registration_number',v.registration_number,'make',v.make,'model',v.model) from public.vehicles v where v.id=b.vehicle_id),'business',(select to_jsonb(x) from public.rental_business x where x.id)),uid) returning * into inv;
   -- Allocate all net advances to the new invoice; do not consume security deposits.
   insert into public.rental_allocations(invoice_id,ledger_id,amount_minor)
   select inv.id,l.id,case when l.kind='refund' then -l.amount_minor else l.amount_minor end from public.rental_ledger l where l.booking_id=b.id and l.kind in ('payment','refund','deposit_apply');
   select coalesce(sum(amount_minor),0) into paid from public.rental_allocations where invoice_id=inv.id;
   if paid>inv.total_minor then raise exception 'Advances exceed final invoice. Refund the excess before issuance'; end if;
   result:=to_jsonb(inv);
  elsif p_action='invoice_void' then
   select * into strict inv from public.rental_invoices where rental_invoices.id=(p_payload->>'invoice_id')::uuid and status='issued';
   select coalesce(sum(amount_minor),0) into paid from public.rental_allocations where invoice_id=inv.id;
   if paid<>0 then raise exception 'Refund allocated payments before voiding'; end if;
   if length(trim(coalesce(p_payload->>'reason','')))=0 then raise exception 'Void reason required'; end if;
   update public.rental_invoices set status='void',void_reason=p_payload->>'reason' where rental_invoices.id=inv.id;
   result:=jsonb_build_object('id',inv.id,'status','void');
  else
   if p_action<>'deposit_apply' and coalesce(p_payload->>'method','cash') not in ('cash','bank','card') then raise exception 'Choose cash, bank or externally processed card'; end if;
   amount:=(p_payload->>'amount_minor')::bigint;
   if amount is null or amount<=0 then raise exception 'Positive amount required'; end if;
   select coalesce(sum(case when kind in ('payment','deposit_apply') then amount_minor when kind='refund' then -amount_minor else 0 end),0),coalesce(sum(case when kind='deposit' then amount_minor when kind in ('deposit_refund','deposit_apply') then -amount_minor else 0 end),0)
    into paid,deposit from public.rental_ledger where booking_id=b.id;
   select * into inv from public.rental_invoices where booking_id=b.id and status='issued';
   if p_action in ('payment','deposit','deposit_apply') and b.status='cancelled' then raise exception 'Cancelled booking accepts refunds only'; end if;
   if p_action in ('deposit_refund','deposit_apply') and amount>deposit then raise exception 'Insufficient deposit balance'; end if;
   if p_action='deposit_apply' and inv.id is null then raise exception 'Issue an invoice before applying a deposit'; end if;
   if p_action='refund' and amount>paid then raise exception 'Refund exceeds received rental payments'; end if;
   if p_action in ('refund','deposit_refund','deposit_apply') and length(trim(coalesce(p_payload->>'reason','')))=0 then raise exception 'Reason required'; end if;
   if p_action in ('payment','deposit_apply') and inv.id is not null and paid+amount>inv.total_minor then raise exception 'Payment exceeds outstanding balance'; end if;
   n:=nextval('rental_private.receipt_number');
   insert into public.rental_ledger(booking_id,receipt_number,kind,amount_minor,method,reference,reason,created_by)
   values(b.id,'RCT-'||lpad(n::text,greatest(7,length(n::text)),'0'),p_action,amount,case when p_action='deposit_apply' then 'deposit' else coalesce(p_payload->>'method','cash') end,coalesce(p_payload->>'reference',''),coalesce(p_payload->>'reason',''),uid) returning rental_ledger.id into ledger_id;
   if inv.id is not null and p_action in ('payment','refund','deposit_apply') then
    insert into public.rental_allocations values(inv.id,ledger_id,case when p_action='refund' then -amount else amount end);
   end if;
   result:=jsonb_build_object('id',ledger_id);
  end if;
 end if;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
 values(uid,'RENTAL_'||upper(p_action),'rental',coalesce(id::text,''),jsonb_build_object('request_id',p_request_id,'reason',coalesce(p_payload->>'reason',''),'amount_minor',p_payload->'amount_minor','discount_minor',p_payload->'discount_minor','tax_bps',p_payload->'tax_bps'));
 insert into rental_private.requests(actor,request_id,action,payload_hash,response) values(uid,p_request_id,p_action,md5(p_payload::text),result);
 return result;
end $$;
revoke all on all functions in schema rental_private from public,anon,authenticated;
grant execute on function rental_private.staff(text) to authenticated;
grant execute on function rental_private.previous_permission_allowed_for_role(public.app_role,text) to authenticated;
grant execute on function rental_private.api(text,jsonb,uuid) to authenticated;
create function public.rental_api(p_action text,p_payload jsonb default '{}',p_request_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$ select rental_private.api(p_action,p_payload,p_request_id); $$;
revoke all on function public.rental_api(text,jsonb,uuid) from public,anon;
grant execute on function public.rental_api(text,jsonb,uuid) to authenticated;
-- Private responses are never published; only staff-readable tables generate change events.
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach t in array array['rental_customers','rental_bookings','rental_invoices','rental_ledger','rental_allocations','rental_business'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
 execute format('alter publication supabase_realtime add table public.%I',t);
 end if; end loop; end if;
end $$;
commit;
