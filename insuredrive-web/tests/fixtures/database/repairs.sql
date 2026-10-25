-- Tenuli Auto Care: additive repair billing and private shop-cost accounting.
-- Apply once AFTER the existing rental upgrade. No existing table is dropped.
begin;
do $$ begin
 if to_regclass('public.rental_business') is null or to_regprocedure('public.get_effective_permissions()') is null then
  raise exception 'Run PRECHECK_RENTALS and install the rental module first';
 end if;
end $$;
create schema repair_private;
revoke all on schema repair_private from public,anon;
grant usage on schema repair_private to authenticated;
insert into public.permissions(permission_key,name,category,description,admin_only) values
 ('view_repairs','View repair jobs','Repairs','Read estimates and job details',false),
 ('manage_repairs','Manage repair jobs','Repairs','Edit estimates and approve repair work',false),
 ('view_repair_billing','View repair billing','Repairs','Read invoices and receipts',false),
 ('manage_repair_payments','Manage repair billing','Repairs','Issue invoices, payments, credits and refunds',false),
 ('manage_shop_costs','Manage shop costs','Repairs','Suppliers, private attachments, purchases and payments',false),
 ('view_job_profit','View job profit','Repairs','Internal job profitability and costs',false),
 ('export_repair_reports','Export internal reports','Repairs','Export authorized internal profit reports',false)
on conflict(permission_key) do nothing;
insert into public.role_permissions(role,permission_key,allowed)
 select 'administrator'::public.app_role,permission_key,true from public.permissions where category='Repairs'
on conflict(role,permission_key) do nothing;
alter function public.permission_allowed_for_role(public.app_role,text) set schema repair_private;
alter function repair_private.permission_allowed_for_role(public.app_role,text) rename to previous_permission_allowed_for_role;
create function public.permission_allowed_for_role(target_role public.app_role,target_permission_key text)
returns boolean language sql stable set search_path='' as $$
 select repair_private.previous_permission_allowed_for_role(target_role,target_permission_key)
 or (target_role in ('administrator','insurance_officer') and target_permission_key in
 ('view_repairs','manage_repairs','view_repair_billing','manage_repair_payments','manage_shop_costs','view_job_profit','export_repair_reports'));
$$;
create function repair_private.can(p text) returns boolean language sql stable set search_path='' as $$
 select auth.uid() is not null and public.current_user_is_active() and public.current_user_role() in ('administrator','insurance_officer') and public.has_permission(p);
$$;
create sequence repair_private.estimate_no;
create sequence repair_private.job_no;
create sequence repair_private.document_no;
create sequence repair_private.receipt_no;
create table repair_private.business(id boolean primary key default true check(id),version int not null default 1,data jsonb not null);
insert into repair_private.business(data) values('{"name":"Tenuli Auto Care","address":"No-172/1-B, Keselwathugoda, Yakkala.","phone":"0715882903","email":"tenulicabsautocare@gmail.com","notes":"Vehicle Repairs, Painting & Rent a Car","logo":"/tenuli-logo.svg"}');
-- Only replace the old default branding, preserving deliberately customized settings.
update public.rental_business set name='Tenuli Auto Care',address=case when address='' then 'No-172/1-B, Keselwathugoda, Yakkala.' else address end,phone=case when phone='' then '0715882903' else phone end,version=version+1 where name='InsureDrive';
create table repair_private.jobs(
 id uuid primary key default gen_random_uuid(), number text not null unique default ('TAC-EST-'||nextval('repair_private.estimate_no')),job_number text unique,
 version int not null default 1,revision int not null default 1,status text not null default 'draft' check(status in('draft','sent','approved','rejected','in_progress','completed','cancelled')),
 customer_approval text not null default 'pending',insurer_approval text not null default 'not_requested',
 info jsonb not null, lines jsonb not null, costs_complete boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),created_by uuid not null references auth.users(id)
);
create table repair_private.documents(
 id uuid primary key default gen_random_uuid(),job_id uuid not null references repair_private.jobs(id),number text not null unique,
 kind text not null check(kind in('estimate','invoice','credit')),parent_id uuid references repair_private.documents(id),
 status text not null default 'issued' check(status in('issued','void')),snapshot jsonb not null,
 net_minor bigint not null check(net_minor>=0),tax_minor bigint not null check(tax_minor>=0),total_minor bigint not null check(total_minor=net_minor+tax_minor),
 created_at timestamptz not null default now(),created_by uuid not null references auth.users(id)
);
create unique index repair_active_invoice on repair_private.documents(job_id) where kind='invoice' and status='issued';
create table repair_private.payments(
 id uuid primary key default gen_random_uuid(),job_id uuid not null references repair_private.jobs(id),number text not null unique default ('TAC-RCT-'||nextval('repair_private.receipt_no')),
 kind text not null check(kind in('payment','refund')),amount_minor bigint not null check(amount_minor>0),payer text not null check(payer in('customer','insurer','other')),
 method text not null check(method in('cash','bank','card')),reference text not null default '',reason text not null,snapshot jsonb not null,
 created_at timestamptz not null default now(),created_by uuid not null references auth.users(id)
);
create table repair_private.suppliers(id uuid primary key default gen_random_uuid(),version int not null default 1,data jsonb not null);
create table repair_private.bills(
 id uuid primary key default gen_random_uuid(),supplier_id uuid references repair_private.suppliers(id),version int not null default 1,
 description text not null,category text not null,quantity numeric(12,3) not null check(quantity>0),unit text not null default 'item',
 estimated_minor bigint not null check(estimated_minor>=0),actual_minor bigint check(actual_minor>=0),tax_minor bigint not null default 0 check(tax_minor>=0),
 reference text not null default '',purchase_date date not null,due_date date,terms text not null default '',attachment_path text,
 created_at timestamptz not null default now()
);
create table repair_private.allocations(
 id uuid primary key default gen_random_uuid(),bill_id uuid not null references repair_private.bills(id),job_id uuid not null references repair_private.jobs(id),
 line_id text,quantity numeric(12,3) not null check(quantity>0),created_at timestamptz not null default now(),unique(bill_id,job_id)
);
create table repair_private.cost_credits(
 id uuid primary key default gen_random_uuid(),bill_id uuid not null references repair_private.bills(id),job_id uuid references repair_private.jobs(id),
 net_minor bigint not null check(net_minor>0),tax_minor bigint not null default 0 check(tax_minor>=0),quantity numeric(12,3) not null default 0 check(quantity>=0),
 reason text not null,created_at timestamptz not null default now()
);
create table repair_private.supplier_payments(
 id uuid primary key default gen_random_uuid(),bill_id uuid not null references repair_private.bills(id),kind text not null check(kind in('payment','refund')),
 amount_minor bigint not null check(amount_minor>0),method text not null,reference text not null default '',reason text not null,created_at timestamptz not null default now()
);
create table repair_private.events(id uuid primary key default gen_random_uuid(),job_id uuid references repair_private.jobs(id),actor uuid not null,action text not null,reason text not null,created_at timestamptz not null default now());
create table repair_private.requests(actor uuid not null,request_id uuid not null,action text not null,payload_hash text not null,response jsonb not null,primary key(actor,request_id));
create index repair_documents_job on repair_private.documents(job_id);
create index repair_payments_job on repair_private.payments(job_id);
create index repair_allocations_job on repair_private.allocations(job_id);
create index repair_credits_bill on repair_private.cost_credits(bill_id);
create index repair_supplier_payments_bill on repair_private.supplier_payments(bill_id);
-- No private table is directly exposed, including to authenticated clients.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='repair_private' loop
 execute format('alter table repair_private.%I enable row level security',t.tablename);
 end loop;
end $$;
revoke all on all tables in schema repair_private from public,anon,authenticated;
revoke all on all sequences in schema repair_private from public,anon,authenticated;
create function repair_private.amount(p jsonb,k text) returns bigint language plpgsql immutable set search_path='' as $$
declare n numeric; begin
 if not coalesce(p->>k,'') ~ '^\d{1,13}$' then raise exception 'Invalid money field: %',k; end if;
 n:=(p->>k)::numeric; if n>1000000000000 then raise exception 'Amount too large'; end if; return n::bigint;
end $$;
create function repair_private.calc(input jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare x jsonb; arr jsonb:='[]'; q numeric; price bigint; discount bigint; tax int; base bigint; taxsum bigint:=0; netsum bigint:=0; pending int:=0; excluded boolean; begin
 if jsonb_typeof(input) is distinct from 'array' or jsonb_array_length(input) not between 1 and 200 then raise exception 'Add 1 to 200 items'; end if;
 for x in select value from jsonb_array_elements(input) loop
  if length(trim(coalesce(x->>'description',''))) not between 1 and 300 then raise exception 'Item description required (max 300 characters)'; end if;
  q:=(x->>'quantity')::numeric;
  if q is null or q<=0 or q>100000 or q<>round(q,3) then raise exception 'Invalid item quantity'; end if;
  price:=case when x->>'unit_minor' is null then null else repair_private.amount(x,'unit_minor') end;
  discount:=repair_private.amount(x,'discount_minor');tax:=(x->>'tax_bps')::int;excluded:=coalesce((x->>'excluded')::boolean,false);
  if tax is null or tax not between 0 and 10000 then raise exception 'Invalid tax'; end if;
  base:=case when price is null then null else round(q*price)::bigint-discount end;
  if base<0 then raise exception 'Discount exceeds line price'; end if;
  if not excluded then
   if price is null then pending:=pending+1; else netsum:=netsum+base;taxsum:=taxsum+round(base*tax/10000.0)::bigint;end if;
  end if;
  arr:=arr||jsonb_build_array(jsonb_build_object('id',coalesce(x->>'id',md5(x::text||jsonb_array_length(arr)::text)),'category',left(coalesce(x->>'category','Repair Items'),100),'description',trim(x->>'description'),'quantity',q,'unit',left(coalesce(x->>'unit','item'),30),'unit_minor',price,'discount_minor',discount,'tax_bps',tax,'excluded',excluded,'notes',left(coalesce(x->>'notes',''),500),'net_minor',case when excluded then 0 else base end,'tax_minor',case when excluded then 0 when base is null then null else round(base*tax/10000.0)::bigint end));
 end loop;
 if netsum>1000000000000 then raise exception 'Total too large'; end if;
 return jsonb_build_object('lines',arr,'net_minor',netsum,'tax_minor',taxsum,'total_minor',netsum+taxsum,'pending',pending);
end $$;
create function repair_private.snapshot(j repair_private.jobs) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('business',(select data from repair_private.business),'info',j.info,'calculation',repair_private.calc(j.lines),'estimate_number',j.number,'job_number',j.job_number,'revision',j.revision,'customer_approval',j.customer_approval,'insurer_approval',j.insurer_approval);
$$;
create function repair_private.paid(j uuid) returns bigint language sql stable set search_path='' as $$
 select coalesce(sum(case kind when 'refund' then -amount_minor else amount_minor end),0)::bigint from repair_private.payments where job_id=j;
$$;
create function repair_private.bill_paid(b uuid) returns bigint language sql stable set search_path='' as $$
 select coalesce(sum(case kind when 'refund' then -amount_minor else amount_minor end),0)::bigint from repair_private.supplier_payments where bill_id=b;
$$;
-- Cumulative rounding preserves every cent across allocations, including the last allocation.
create view repair_private.cost_parts as
select a.*,b.supplier_id,b.description,b.category,b.actual_minor is not null as confirmed,
 (round(b.estimated_minor*a.cum/b.quantity)-round(b.estimated_minor*(a.cum-a.quantity)/b.quantity))::bigint as estimated_minor,
 case when b.actual_minor is null then null else (round(b.actual_minor*a.cum/b.quantity)-round(b.actual_minor*(a.cum-a.quantity)/b.quantity))::bigint end as actual_minor,
 (round(repair_private.bill_paid(b.id)*a.cum/b.quantity)-round(repair_private.bill_paid(b.id)*(a.cum-a.quantity)/b.quantity))::bigint as cash_paid_minor
from (select a.*,sum(quantity) over(partition by bill_id order by created_at,id) as cum from repair_private.allocations a) a join repair_private.bills b on b.id=a.bill_id;
create function repair_private.profit(j repair_private.jobs) returns jsonb language plpgsql stable set search_path='' as $$
declare revenue bigint:=0; tax bigint:=0; estimate bigint; cost bigint; estimated_cost bigint; credit bigint; cash bigint; invdate timestamptz; complete boolean; paid bigint:=repair_private.paid(j.id); begin
 select coalesce(sum(d.net_minor),0),coalesce(sum(d.tax_minor),0),max(d.created_at) into revenue,tax,invdate from repair_private.documents d where d.job_id=j.id and d.kind='invoice' and d.status='issued';
 select coalesce(sum(c.net_minor),0) into credit from repair_private.documents c join repair_private.documents i on i.id=c.parent_id where c.job_id=j.id and c.kind='credit' and i.status='issued';
 revenue:=revenue-credit;
 select tax-coalesce(sum(c.tax_minor),0) into tax from repair_private.documents c join repair_private.documents i on i.id=c.parent_id where c.job_id=j.id and c.kind='credit' and i.status='issued';
 select coalesce(sum(actual_minor),0),coalesce(sum(estimated_minor),0),coalesce(bool_and(confirmed),true),coalesce(sum(cash_paid_minor),0) into cost,estimated_cost,complete,cash from repair_private.cost_parts where job_id=j.id;
 select coalesce(sum(net_minor),0) into credit from repair_private.cost_credits where job_id=j.id;
 cost:=cost-credit;estimated_cost:=greatest(0,estimated_cost-credit);complete:=complete and j.costs_complete;
 estimate:=(repair_private.calc(j.lines)->>'net_minor')::bigint;
 return jsonb_build_object('id',j.id,'number',coalesce(j.job_number,j.number),'customer',j.info->>'customer_name','vehicle',j.info->>'registration','status',j.status,'invoice_date',invdate,'created_at',j.created_at,'revenue_minor',revenue,'tax_minor',tax,'direct_cost_minor',cost,'estimated_cost_minor',estimated_cost,'estimated_revenue_minor',estimate,'price_pending',(repair_private.calc(j.lines)->>'pending')::int,'estimated_profit_minor',estimate-estimated_cost,'profit_minor',revenue-cost,'margin',case when revenue<>0 then round((revenue-cost)*100.0/revenue,2) end,'markup',case when cost>0 then round((revenue-cost)*100.0/cost,2) end,'complete',complete,'collected_minor',paid,'receivable_minor',revenue+tax-paid,'cash_paid_minor',cash,'cash_movement_minor',paid-cash);
end $$;
create function repair_private.api(action text,p jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); jid uuid; bid uuid; sid uuid; j repair_private.jobs; b repair_private.bills; d repair_private.documents; prior repair_private.requests;
 result jsonb; cal jsonb; info jsonb; k text; perm text; reason text:=trim(coalesce(p->>'reason','')); amount bigint; tax bigint; total bigint; paid bigint; q numeric; allocated numeric; count_rows int; new_id uuid; due date; existing bigint; oldqty numeric; billflag boolean;
begin
 if uid is null or not public.current_user_is_active() or public.current_user_role() not in('administrator','insurance_officer') then raise exception 'Active staff account required' using errcode='42501';end if;
 if action in('list','document') then
  if not (repair_private.can('view_repairs') or repair_private.can('manage_repairs') or repair_private.can('view_repair_billing') or repair_private.can('manage_repair_payments')) then raise exception 'Repair access denied' using errcode='42501';end if;
 elsif action in('shop_list','attachment_get') then
  if not(repair_private.can('manage_shop_costs') or repair_private.can('view_job_profit')) then raise exception 'Shop access denied' using errcode='42501';end if;
 elsif action in('report','report_export') then
  if not repair_private.can('view_job_profit') or (action='report_export' and not repair_private.can('export_repair_reports')) then raise exception 'Profit/report access denied' using errcode='42501';end if;
 else
  perm:=case when action in('supplier_save','bill_save','bill_confirm','allocation','cost_credit','supplier_payment','supplier_refund','costs_complete','attachment_link') then 'manage_shop_costs'
   when action in('invoice_issue','invoice_void','customer_credit','payment','refund') then 'manage_repair_payments'
   when action='business_save' then 'manage_system_settings' else 'manage_repairs' end;
  if not repair_private.can(perm) then raise exception 'Permission required: %',perm using errcode='42501';end if;
 end if;
 billflag:=repair_private.can('view_repair_billing') or repair_private.can('manage_repair_payments');
 if action='list' then
  return jsonb_build_object('business',(select to_jsonb(v) from repair_private.business v),'jobs',(select coalesce(jsonb_agg(to_jsonb(v)-'costs_complete' order by v.updated_at desc),'[]') from repair_private.jobs v),
   'documents',(select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at desc),'[]') from repair_private.documents v where billflag or v.kind='estimate'),
   'payments',(select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at desc),'[]') from repair_private.payments v where billflag),
   'events',(select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at desc),'[]') from repair_private.events v where v.action in('save','send','approve','reject','start','complete','cancel','insurer_decision')));
 elsif action='document' then
  select * into strict d from repair_private.documents where id=(p->>'id')::uuid;
  if d.kind<>'estimate' and not billflag then raise exception 'Billing access denied';end if;
  return to_jsonb(d);
 elsif action='shop_list' then
  return jsonb_build_object('suppliers',(select coalesce(jsonb_agg(to_jsonb(v)),'[]') from repair_private.suppliers v),'bills',(select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at desc),'[]') from repair_private.bills v),'allocations',(select coalesce(jsonb_agg(to_jsonb(v)),'[]') from repair_private.cost_parts v),'credits',(select coalesce(jsonb_agg(to_jsonb(v)),'[]') from repair_private.cost_credits v),'payments',(select coalesce(jsonb_agg(to_jsonb(v)),'[]') from repair_private.supplier_payments v),'jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'number',coalesce(v.job_number,v.number),'customer',v.info->>'customer_name','vehicle',v.info->>'registration','costs_complete',v.costs_complete,'lines',v.lines)),'[]') from repair_private.jobs v));
 elsif action in('report','report_export') then
  return (select coalesce(jsonb_agg(v),'[]') from (select repair_private.profit(r) as v from repair_private.jobs r where r.status<>'cancelled') s
   where coalesce((v->>'invoice_date')::timestamptz,(v->>'created_at')::timestamptz) at time zone 'Asia/Colombo'>=coalesce(nullif(p->>'from','')::date,'1900-01-01'::date)
   and coalesce((v->>'invoice_date')::timestamptz,(v->>'created_at')::timestamptz) at time zone 'Asia/Colombo'<coalesce(nullif(p->>'to','')::date,'9998-12-31'::date)+1);
 end if;
 if request_id is null then raise exception 'Request ID required';end if;
 perform pg_advisory_xact_lock(hashtextextended('repair:'||uid::text||request_id::text,0));
 select * into prior from repair_private.requests r where r.actor=uid and r.request_id=api.request_id;
 if found then
  if prior.action<>api.action or prior.payload_hash<>md5(p::text) then raise exception 'Request key reused with different data';end if;
  return prior.response;
 end if;
 -- Financial operations serialize within this single-business module, preventing crossed job/bill lock order.
 perform pg_advisory_xact_lock(hashtextextended('tenuli-repair-finance',0));
 jid:=nullif(p->>'job_id','')::uuid;bid:=nullif(p->>'bill_id','')::uuid;
 if jid is not null then select * into strict j from repair_private.jobs where id=jid for update;end if;
 if bid is not null then select * into strict b from repair_private.bills where id=bid for update;end if;
 if length(reason)>1000 then raise exception 'Reason too long';end if;
 if action='save' then
  cal:=repair_private.calc(p->'lines');info:='{}';
  foreach k in array array['customer_name','phone','address','registration','make_model','vehicle_id','accident_date','insurance','policy_number','claim_number','valid_until','advisor','expected_date','notes'] loop
   info:=info||jsonb_build_object(k,left(coalesce(p->'info'->>k,''),case when k in('notes','address') then 1000 else 200 end));
  end loop;
  if trim(info->>'customer_name')='' or trim(info->>'registration')='' then raise exception 'Customer and vehicle registration required';end if;
  foreach k in array array['accident_date','valid_until','expected_date'] loop perform nullif(info->>k,'')::date;end loop;
  if coalesce(info->>'vehicle_id','')<>'' and not exists(select 1 from public.vehicles where id=(info->>'vehicle_id')::uuid) then raise exception 'Vehicle not found';end if;
  info:=info||jsonb_build_object('expected_customer_minor',repair_private.amount(p->'info','expected_customer_minor'),'expected_insurer_minor',repair_private.amount(p->'info','expected_insurer_minor'));
  if jid is null then
   insert into repair_private.jobs(info,lines,created_by) values(info,cal->'lines',uid) returning * into j;jid:=j.id;
  else
   if exists(select 1 from repair_private.documents where job_id=jid and kind='invoice' and status='issued') then raise exception 'Issued invoice exists; use credit or void before revising';end if;
   if j.status='cancelled' or reason='' then raise exception 'Revision reason required; cancelled jobs cannot change';end if;
   update repair_private.jobs set info=api.info,lines=cal->'lines',version=version+1,revision=revision+1,status='draft',customer_approval='pending',insurer_approval='not_requested',updated_at=now() where id=jid and version=(p->>'version')::int returning * into j;
   if not found then raise exception 'Job changed; reload before editing' using errcode='40001';end if;
  end if;
  result:=to_jsonb(j)-'costs_complete';
 elsif action in('send','approve','reject','start','complete','cancel','insurer_decision') then
  if j.id is null or j.version is distinct from (p->>'version')::int then raise exception 'Job changed; reload' using errcode='40001';end if;
  if reason='' then raise exception 'Reason / approval reference required';end if;
  if action='send' then
   if j.status<>'draft' then raise exception 'Only draft estimates can be sent';end if;
   cal:=repair_private.calc(j.lines);
   insert into repair_private.documents(job_id,number,kind,snapshot,net_minor,tax_minor,total_minor,created_by) values(jid,j.number||'-R'||j.revision,'estimate',repair_private.snapshot(j), (cal->>'net_minor')::bigint,(cal->>'tax_minor')::bigint,(cal->>'total_minor')::bigint,uid);
   j.status:='sent';
  elsif action='approve' then if j.status not in('draft','sent') then raise exception 'Estimate is not awaiting approval';end if;j.status:='approved';j.customer_approval:='approved';j.job_number:=coalesce(j.job_number,'TAC-JOB-'||nextval('repair_private.job_no'));
  elsif action='reject' then if j.status not in('draft','sent') then raise exception 'Estimate is not awaiting approval';end if;j.status:='rejected';j.customer_approval:='rejected';
  elsif action='start' then if j.status<>'approved' then raise exception 'Approve estimate first';end if;j.status:='in_progress';
  elsif action='complete' then if j.status<>'in_progress' then raise exception 'Start the job first';end if;j.status:='completed';
  elsif action='cancel' then
   if exists(select 1 from repair_private.documents where job_id=jid and kind='invoice' and status='issued') or repair_private.paid(jid)<>0 or exists(select 1 from repair_private.cost_parts where job_id=jid and (not confirmed or cash_paid_minor<>0)) or coalesce((select sum(actual_minor) from repair_private.cost_parts where job_id=jid),0)<>coalesce((select sum(net_minor) from repair_private.cost_credits where job_id=jid),0) then raise exception 'Settle/refund billing, credit allocated costs and settle supplier cash before cancellation';end if;j.status:='cancelled';
  else if j.status='cancelled' or p->>'decision' not in('pending','approved','rejected','not_requested') or p->>'decision' is null then raise exception 'Invalid insurer decision';end if;j.insurer_approval:=p->>'decision';end if;
  update repair_private.jobs set status=j.status,customer_approval=j.customer_approval,insurer_approval=j.insurer_approval,job_number=j.job_number,version=version+1,updated_at=now() where id=jid returning * into j;
  result:=to_jsonb(j)-'costs_complete';
 elsif action='invoice_issue' then
  if j.id is null or j.version is distinct from (p->>'version')::int or j.status<>'completed' or j.customer_approval<>'approved' then raise exception 'Complete the approved job and reload before invoicing';end if;
  cal:=repair_private.calc(j.lines);if (cal->>'pending')::int>0 then raise exception 'Resolve or explicitly exclude every price-pending item';end if;
  due:=(p->>'due_date')::date;if due is null then raise exception 'Due date required';end if;
  if repair_private.paid(jid)>(cal->>'total_minor')::bigint then raise exception 'Refund excess advance before issuing';end if;
  insert into repair_private.documents(job_id,number,kind,snapshot,net_minor,tax_minor,total_minor,created_by) values(jid,'TAC-INV-'||nextval('repair_private.document_no'),'invoice',repair_private.snapshot(j)||jsonb_build_object('due_date',due),(cal->>'net_minor')::bigint,(cal->>'tax_minor')::bigint,(cal->>'total_minor')::bigint,uid) returning to_jsonb(documents) into result;
 elsif action in('invoice_void','customer_credit') then
  select * into strict d from repair_private.documents where id=(p->>'document_id')::uuid and kind='invoice' and status='issued' for update;jid:=d.job_id;
  if reason='' then raise exception 'Correction reason required';end if;
  if action='invoice_void' then
   if repair_private.paid(jid)<>0 then raise exception 'Refund received money before voiding';end if;
   update repair_private.documents set status='void' where id=d.id;result:=jsonb_build_object('voided',d.id);
  else
   amount:=repair_private.amount(p,'net_minor');tax:=repair_private.amount(p,'tax_minor');
   if amount+tax<=0 or amount+coalesce((select sum(net_minor) from repair_private.documents where parent_id=d.id),0)>d.net_minor or tax+coalesce((select sum(tax_minor) from repair_private.documents where parent_id=d.id),0)>d.tax_minor then raise exception 'Credit exceeds invoice';end if;
   insert into repair_private.documents(job_id,number,kind,parent_id,snapshot,net_minor,tax_minor,total_minor,created_by) values(jid,'TAC-CR-'||nextval('repair_private.document_no'),'credit',d.id,jsonb_build_object('business',d.snapshot->'business','info',d.snapshot->'info','original_number',d.number,'reason',reason,'calculation',jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('description',reason,'category','Credit','quantity',1,'net_minor',amount,'tax_minor',tax,'unit_minor',amount)),'net_minor',amount,'tax_minor',tax,'total_minor',amount+tax,'pending',0)),amount,tax,amount+tax,uid) returning to_jsonb(documents) into result;
  end if;
 elsif action in('payment','refund') then
  if j.id is null then raise exception 'Choose a job';end if;
  amount:=repair_private.amount(p,'amount_minor');paid:=repair_private.paid(jid);
  if amount<=0 or reason='' then raise exception 'Positive amount and reason required';end if;
  if action='refund' then if amount>paid then raise exception 'Refund exceeds amount received';end if;
  else
   if j.status in('cancelled','rejected') then raise exception 'Job cannot receive payments';end if;
   select * into d from repair_private.documents where job_id=jid and kind='invoice' and status='issued';
   if found then total:=d.total_minor-coalesce((select sum(total_minor) from repair_private.documents where parent_id=d.id),0);if paid+amount>total then raise exception 'Payment exceeds balance';end if;end if;
  end if;
  insert into repair_private.payments(job_id,kind,amount_minor,payer,method,reference,reason,snapshot,created_by) values(jid,action,amount,p->>'payer',p->>'method',left(coalesce(p->>'reference',''),200),reason,repair_private.snapshot(j),uid) returning to_jsonb(payments) into result;
 elsif action='supplier_save' then
  info:='{}';foreach k in array array['name','contact','phone','address','terms'] loop info:=info||jsonb_build_object(k,left(coalesce(p->>k,''),500));end loop;
  if trim(info->>'name')='' then raise exception 'Supplier name required';end if;sid:=nullif(p->>'id','')::uuid;
  if sid is null then insert into repair_private.suppliers(data) values(info) returning id into sid;
  else update repair_private.suppliers set data=info,version=version+1 where id=sid and version=(p->>'version')::int;if not found then raise exception 'Supplier changed; reload';end if;end if;
  result:=jsonb_build_object('id',sid);
 elsif action='bill_save' then
  q:=(p->>'quantity')::numeric;if q is null or q<=0 or q>100000 or q<>round(q,3) then raise exception 'Invalid quantity';end if;
  if trim(coalesce(p->>'description',''))='' then raise exception 'Description required';end if;
  amount:=repair_private.amount(p,'estimated_minor');total:=case when p->>'actual_minor' is null then null else repair_private.amount(p,'actual_minor') end;tax:=repair_private.amount(p,'tax_minor');
  insert into repair_private.bills(supplier_id,description,category,quantity,unit,estimated_minor,actual_minor,tax_minor,reference,purchase_date,due_date,terms)
   values(nullif(p->>'supplier_id','')::uuid,left(p->>'description',300),left(coalesce(p->>'category','Parts'),100),q,left(coalesce(p->>'unit','item'),30),amount,total,tax,left(coalesce(p->>'reference',''),200),(p->>'purchase_date')::date,nullif(p->>'due_date','')::date,left(coalesce(p->>'terms',''),500)) returning to_jsonb(bills) into result;
 elsif action='bill_confirm' then
  if b.id is null or b.actual_minor is not null or b.version is distinct from (p->>'version')::int or reason='' then raise exception 'Unconfirmed bill, current version and reason required';end if;
  update repair_private.bills set actual_minor=repair_private.amount(p,'actual_minor'),tax_minor=repair_private.amount(p,'tax_minor'),version=version+1 where id=bid returning to_jsonb(bills) into result;
  update repair_private.jobs set costs_complete=false where id in(select job_id from repair_private.allocations where bill_id=bid);
 elsif action='allocation' then
  if b.id is null or j.id is null or j.status='cancelled' then raise exception 'Choose a bill and active job';end if;
  q:=(p->>'quantity')::numeric;if q is null or q<=0 or q<>round(q,3) then raise exception 'Invalid quantity';end if;
  select coalesce(sum(quantity),0) into allocated from repair_private.allocations where bill_id=bid;
  if exists(select 1 from repair_private.cost_credits where bill_id=bid and job_id is null) then raise exception 'This bill has unused-stock credits. Reverse the remaining unused stock on this bill before recording its adjusted replacement purchase';end if;
  if allocated+q>b.quantity then raise exception 'Allocation exceeds purchased quantity';end if;
  if coalesce(p->>'line_id','')<>'' and not exists(select 1 from jsonb_array_elements(j.lines) x where x->>'id'=p->>'line_id') then raise exception 'Invalid repair line';end if;
  insert into repair_private.allocations(bill_id,job_id,line_id,quantity) values(bid,jid,nullif(p->>'line_id',''),q) returning to_jsonb(allocations) into result;
  update repair_private.jobs set costs_complete=false where id=jid;
 elsif action='cost_credit' then
  if b.id is null or b.actual_minor is null or reason='' then raise exception 'Confirmed bill and reason required';end if;
  amount:=repair_private.amount(p,'net_minor');tax:=repair_private.amount(p,'tax_minor');q:=coalesce((p->>'quantity')::numeric,0);
  if amount<=0 or q<0 or q<>round(q,3) then raise exception 'Invalid credit amount / quantity';end if;
  select coalesce(sum(net_minor),0) into existing from repair_private.cost_credits where bill_id=bid;
  if existing+amount>b.actual_minor or tax+coalesce((select sum(tax_minor) from repair_private.cost_credits where bill_id=bid),0)>b.tax_minor then raise exception 'Credit exceeds purchase';end if;
  if jid is not null then
   select actual_minor,quantity into total,oldqty from repair_private.cost_parts where bill_id=bid and job_id=jid;
   if not found or amount+coalesce((select sum(net_minor) from repair_private.cost_credits where bill_id=bid and job_id=jid),0)>total or q+coalesce((select sum(quantity) from repair_private.cost_credits where bill_id=bid and job_id=jid),0)>oldqty then raise exception 'Credit exceeds job allocation';end if;
  else
   total:=b.actual_minor-coalesce((select sum(actual_minor) from repair_private.cost_parts where bill_id=bid),0);oldqty:=b.quantity-coalesce((select sum(quantity) from repair_private.allocations where bill_id=bid),0);
   if amount+coalesce((select sum(net_minor) from repair_private.cost_credits where bill_id=bid and job_id is null),0)>total or q+coalesce((select sum(quantity) from repair_private.cost_credits where bill_id=bid and job_id is null),0)>oldqty then raise exception 'Choose the allocated job for this credit';end if;
  end if;
  insert into repair_private.cost_credits(bill_id,job_id,net_minor,tax_minor,quantity,reason) values(bid,jid,amount,tax,q,reason) returning to_jsonb(cost_credits) into result;
 elsif action in('supplier_payment','supplier_refund') then
  if b.id is null or b.actual_minor is null or reason='' then raise exception 'Confirmed bill and reason required';end if;
  amount:=repair_private.amount(p,'amount_minor');paid:=repair_private.bill_paid(bid);total:=b.actual_minor+b.tax_minor-coalesce((select sum(net_minor+tax_minor) from repair_private.cost_credits where bill_id=bid),0);
  if amount<=0 or (action='supplier_payment' and paid+amount>total) or (action='supplier_refund' and amount>greatest(0,paid-total)) then raise exception 'Payment/refund exceeds supplier balance';end if;
  if p->>'method' not in('cash','bank','card') or p->>'method' is null then raise exception 'Payment method required';end if;
  insert into repair_private.supplier_payments(bill_id,kind,amount_minor,method,reference,reason) values(bid,case action when 'supplier_payment' then 'payment' else 'refund' end,amount,p->>'method',left(coalesce(p->>'reference',''),200),reason) returning to_jsonb(supplier_payments) into result;
 elsif action='costs_complete' then
  if j.id is null or reason='' or exists(select 1 from repair_private.cost_parts where job_id=jid and not confirmed) then raise exception 'Confirm all costs and enter a reason';end if;
  update repair_private.jobs set costs_complete=true where id=jid;result:=jsonb_build_object('saved',true);
 elsif action='attachment_link' then
  if b.id is null or not coalesce(p->>'path','') ~ ('^'||bid::text||'/[0-9a-f-]+\.(pdf|png|jpg|webp)$') then raise exception 'Invalid attachment path';end if;
  update repair_private.bills set attachment_path=p->>'path',version=version+1 where id=bid;result:=jsonb_build_object('saved',true);
 elsif action='business_save' then
  if public.current_user_role()<>'administrator' then raise exception 'Administrator required';end if;
  info:='{}';foreach k in array array['name','address','phone','email','notes','logo'] loop info:=info||jsonb_build_object(k,coalesce(p->>k,''));end loop;
  if length(info::text)>400000 or trim(info->>'name')='' or not ((info->>'logo')='/tenuli-logo.svg' or (info->>'logo') ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$') then raise exception 'Use a name and PNG/JPEG/WebP logo smaller than 280 KB';end if;
  update repair_private.business set data=info,version=version+1 where version=(p->>'version')::int;if not found then raise exception 'Business settings changed; reload';end if;
  result:=jsonb_build_object('saved',true);
 else raise exception 'Unknown repair action';end if;
 insert into repair_private.events(job_id,actor,action,reason) values(jid,uid,action,reason);
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(uid,'repair_'||action,'repair',coalesce(jid,bid,sid)::text,jsonb_build_object('reason',reason));
 insert into repair_private.requests values(uid,request_id,action,md5(p::text),result);
 return result;
end $$;
revoke all on all functions in schema repair_private from public,anon,authenticated;
grant execute on function repair_private.previous_permission_allowed_for_role(public.app_role,text),repair_private.can(text),repair_private.api(text,jsonb,uuid) to authenticated;
create function public.repair_api(p_action text,p_payload jsonb default '{}',p_request_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select repair_private.api(p_action,p_payload,p_request_id); $$;
revoke all on function public.repair_api(text,jsonb,uuid),public.permission_allowed_for_role(public.app_role,text) from public,anon;
grant execute on function public.repair_api(text,jsonb,uuid),public.permission_allowed_for_role(public.app_role,text) to authenticated;
-- Supabase Storage is optional for local PGlite tests. Live bucket stays private.
do $$ begin if to_regclass('storage.buckets') is not null then
 insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('tenuli-shop-bills','tenuli-shop-bills',false,5242880,array['application/pdf','image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
 execute $policy$create policy tenuli_bills_read on storage.objects for select to authenticated using(bucket_id='tenuli-shop-bills' and (repair_private.can('manage_shop_costs') or repair_private.can('view_job_profit')))$policy$;
 execute $policy$create policy tenuli_bills_insert on storage.objects for insert to authenticated with check(bucket_id='tenuli-shop-bills' and repair_private.can('manage_shop_costs'))$policy$;
 end if;end $$;
commit;
