-- Tenuli Auto Care 1.17: internal pricing reviews and six work categories.
-- Apply after 1.16 or run the generated ENABLE_AUTOMART.sql. Repeatable; no historical rewrites.
begin;
select pg_advisory_xact_lock(hashtextextended('tenuli-repair-finance',0));
create unique index if not exists repair_photo_draft_unique on repair_private.jobs ((info->>'photo_draft_id')) where coalesce(info->>'photo_draft_id','')<>'';
create table if not exists repair_private.price_reviews (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references repair_private.jobs(id),
 parent_id uuid references repair_private.price_reviews(id), kind text not null check(kind in('item','package')),
 status text not null check(status in('pending','accepted','rejected','not_required')),
 source_version integer not null, original_lines jsonb not null, proposed_minor bigint,
 allocations jsonb not null default '[]', reason text not null, supporting_note text not null default '',
 recorded_by uuid not null references auth.users(id), recorded_at timestamptz not null default now(),
 unique(parent_id), check(proposed_minor is null or proposed_minor between 0 and 1000000000000)
);
create index if not exists price_reviews_job on repair_private.price_reviews(job_id,recorded_at);
alter table repair_private.price_reviews enable row level security;
revoke all on repair_private.price_reviews from public,anon,authenticated;
drop trigger if exists price_reviews_immutable on repair_private.price_reviews;
create trigger price_reviews_immutable before update or delete on repair_private.price_reviews for each row execute function repair_private.service_immutable();
create or replace function repair_private.work_section(value text) returns text language sql immutable set search_path='' as $$
 select case lower(trim(coalesce(value,'')))
 when 'replacement items' then 'Replacement Items'
 when 'remove & refit items' then 'Removal & Refitting Items'
 when 'removal & refitting items' then 'Removal & Refitting Items'
 when 'remove and refixed items' then 'Removal & Refitting Items'
 when 'paint items' then 'Paint Items'
 when 'miscellaneous items' then 'Miscellaneous Items'
 when 'other charges' then 'Other Charges' else 'Repair Items' end;
$$;
-- Protected allocations may only be reused for the same job, line and quoted inputs.
create or replace function repair_private.validate_agreements(p jsonb) returns void language plpgsql set search_path='' as $$
declare x jsonb; a jsonb; review repair_private.price_reviews; original jsonb; begin
 for x in select value from jsonb_array_elements(p->'lines') loop
  if x->>'agreed_minor' is not null or x->>'price_review_id' is not null then
   select * into review from repair_private.price_reviews where id=(x->>'price_review_id')::uuid and job_id=(p->>'job_id')::uuid and status='accepted';
   if not found then raise exception 'An accepted price review is required';end if;
   select e into a from jsonb_array_elements(review.allocations) e where e->>'id'=x->>'id';
   select e into original from jsonb_array_elements(review.original_lines) e where e->>'id'=x->>'id';
   if a is null or original is null or (a->>'amount_minor')::bigint is distinct from (x->>'agreed_minor')::bigint or
      (original->'quantity') is distinct from (x->'quantity') or
      (original->'unit_minor') is distinct from (x->'unit_minor') or
      (original->'discount_minor') is distinct from (x->'discount_minor') then
    raise exception 'Agreed pricing changed; clear the agreement and create a new review';end if;
  end if;
 end loop;
end $$;
create or replace function repair_private.calc(input jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare x jsonb; arr jsonb:='[]'; q numeric; price bigint; discount bigint; tax int; base bigint; taxsum bigint:=0; netsum bigint:=0; pending int:=0; excluded boolean; begin
 if jsonb_typeof(input) is distinct from 'array' or jsonb_array_length(input) not between 1 and 200 then raise exception 'Add 1 to 200 items'; end if;
 if exists(select 1 from jsonb_array_elements(input) e group by e->>'id' having count(*)>1) or exists(select 1 from jsonb_array_elements(input) e where length(trim(coalesce(e->>'id','')))=0) then raise exception 'Unique nonempty item IDs required';end if;
 for x in select value from jsonb_array_elements(input) loop
  if length(trim(coalesce(x->>'description',''))) not between 1 and 300 then raise exception 'Item description required (max 300 characters)'; end if;
  q:=(x->>'quantity')::numeric;
  if q is null or q<=0 or q>100000 or q<>round(q,3) then raise exception 'Invalid item quantity'; end if;
  price:=case when x->>'unit_minor' is null then null else repair_private.amount(x,'unit_minor') end;
  discount:=repair_private.amount(x,'discount_minor');tax:=(x->>'tax_bps')::int;excluded:=coalesce((x->>'excluded')::boolean,false);
  if tax is null or tax not between 0 and 10000 then raise exception 'Invalid tax'; end if;
  base:=case when price is null then null else round(q*price)::bigint-discount end;
  if x->>'agreed_minor' is not null then base:=repair_private.amount(x,'agreed_minor');end if;
  if base<0 then raise exception 'Discount exceeds line price'; end if;
  if not excluded then
   if base is null then pending:=pending+1; else netsum:=netsum+base;taxsum:=taxsum+round(base*tax/10000.0)::bigint;end if;
  end if;
  arr:=arr||jsonb_build_array(jsonb_build_object('id',coalesce(x->>'id',md5(x::text||jsonb_array_length(arr)::text)),'category',left(coalesce(x->>'category','Repair Items'),100),'description',trim(x->>'description'),'quantity',q,'unit',left(coalesce(x->>'unit','item'),30),'unit_minor',price,'discount_minor',discount,'tax_bps',tax,'excluded',excluded,'notes',left(coalesce(x->>'notes',''),500),'position',left(coalesce(x->>'position',''),60),'internal_note',left(coalesce(x->>'internal_note',''),1000),'unverified_note',left(coalesce(x->>'unverified_note',''),500),'agreed_minor',case when x->>'agreed_minor' is null then null else base end,'price_review_id',x->>'price_review_id','net_minor',case when excluded then 0 else base end,'tax_minor',case when excluded then 0 when base is null then null else round(base*tax/10000.0)::bigint end));
 end loop;
 if netsum>1000000000000 then raise exception 'Total too large'; end if;
 return jsonb_build_object('lines',arr,'net_minor',netsum,'tax_minor',taxsum,'total_minor',netsum+taxsum,'pending',pending);
end $$;
create or replace function repair_private.api(action text,p jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
<<repair_body>>
declare uid uuid:=auth.uid(); jid uuid; bid uuid; sid uuid; j repair_private.jobs; b repair_private.bills; d repair_private.documents; prior repair_private.requests;
 result jsonb; cal jsonb; info jsonb; k text; perm text; reason text:=trim(coalesce(p->>'reason','')); amount bigint; tax bigint; total bigint; paid bigint; q numeric; allocated numeric; count_rows int; new_id uuid; due date; existing bigint; oldqty numeric; billflag boolean; remaining_net bigint; remaining_tax bigint; split jsonb;
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
  return jsonb_build_object('simple_billing',true,'business',(select to_jsonb(v) from repair_private.business v),'jobs',(select coalesce(jsonb_agg(to_jsonb(v)-'costs_complete' order by v.updated_at desc),'[]') from repair_private.jobs v),
   'documents',(select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at desc),'[]') from repair_private.documents v where billflag or v.kind='estimate'),
   'payments',(select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at desc),'[]') from repair_private.payments v where billflag),
   'events',(select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at desc),'[]') from repair_private.events v where v.action in('save','send','approve','reject','start','complete','cancel','insurer_decision')));
 elsif action='document' then
  select * into strict d from repair_private.documents where id=(p->>'id')::uuid;
  if d.kind<>'estimate' and not billflag then raise exception 'Billing access denied';end if;
  return to_jsonb(d);
 elsif action='shop_list' then
  return jsonb_build_object('simple_billing',true,'suppliers',(select coalesce(jsonb_agg(to_jsonb(v)),'[]') from repair_private.suppliers v),'bills',(select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at desc),'[]') from repair_private.bills v),'allocations',(select coalesce(jsonb_agg(to_jsonb(v)),'[]') from repair_private.cost_parts v),'credits',(select coalesce(jsonb_agg(to_jsonb(v)),'[]') from repair_private.cost_credits v),'payments',(select coalesce(jsonb_agg(to_jsonb(v)),'[]') from repair_private.supplier_payments v),'jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'number',coalesce(v.job_number,v.number),'customer',v.info->>'customer_name','vehicle',v.info->>'registration','costs_complete',v.costs_complete,'lines',v.lines)),'[]') from repair_private.jobs v));
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
  perform repair_private.validate_agreements(p);
  if exists(select 1 from jsonb_array_elements(p->'lines') x where coalesce((x->>'tax_bps')::int,0)<>0) then
   raise exception 'Use simple pricing: reopen the estimate in the updated app before saving';end if;
  cal:=repair_private.calc((select jsonb_agg(x||jsonb_build_object('tax_bps',0)) from jsonb_array_elements(p->'lines') x));info:='{}';
  foreach k in array array['customer_name','phone','address','registration','make_model','vehicle_id','accident_date','insurance','policy_number','claim_number','valid_until','advisor','expected_date','notes','reported_problem','requested_work','assessor_details','chassis_number','manufacture_notes','photo_draft_id'] loop
   info:=info||jsonb_build_object(k,left(coalesce(p->'info'->>k,''),case when k in('notes','address') then 1000 else 200 end));
  end loop;
  if trim(info->>'customer_name')='' or trim(info->>'registration')='' then raise exception 'Customer and vehicle registration required';end if;
  foreach k in array array['accident_date','valid_until','expected_date'] loop perform nullif(info->>k,'')::date;end loop;
  if coalesce(info->>'vehicle_id','')<>'' and not exists(select 1 from public.vehicles where id=(info->>'vehicle_id')::uuid) then raise exception 'Vehicle not found';end if;
  info:=info||jsonb_build_object('expected_customer_minor',repair_private.amount(jsonb_build_object('expected_customer_minor',coalesce(p->'info'->>'expected_customer_minor','0')),'expected_customer_minor'),'expected_insurer_minor',repair_private.amount(jsonb_build_object('expected_insurer_minor',coalesce(p->'info'->>'expected_insurer_minor','0')),'expected_insurer_minor'));
  if jid is not null and coalesce(j.info->>'photo_draft_id','')<>'' then info:=info||jsonb_build_object('photo_draft_id',j.info->'photo_draft_id');end if;
  if jid is null then
   if coalesce(info->>'photo_draft_id','')<>'' and exists(select 1 from repair_private.jobs where jobs.info->>'photo_draft_id'=repair_body.info->>'photo_draft_id') then raise exception 'This photo draft already belongs to a saved estimate. Reopen that estimate; do not create it again.';end if;
   insert into repair_private.jobs(info,lines,created_by) values(info,cal->'lines',uid) returning * into j;jid:=j.id;
  else
   if exists(select 1 from repair_private.documents where job_id=jid and kind='invoice' and status='issued') then raise exception 'Issued invoice exists; use credit or void before revising';end if;
   if j.status='cancelled' or reason='' then raise exception 'Revision reason required; cancelled jobs cannot change';end if;
   update repair_private.jobs set info=repair_body.info,lines=cal->'lines',version=version+1,revision=revision+1,status='draft',customer_approval='pending',insurer_approval='not_requested',updated_at=now() where id=jid and version=(p->>'version')::int returning * into j;
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
  if (cal->>'tax_minor')::bigint<>0 then raise exception 'Revise this older estimate using simple pricing, then approve and complete it before issuing a new invoice';end if;
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
   if p ? 'amount_minor' then
    select d.net_minor-coalesce(sum(net_minor),0),d.tax_minor-coalesce(sum(tax_minor),0) into remaining_net,remaining_tax from repair_private.documents where parent_id=d.id;
    split:=repair_private.split_credit(repair_private.amount(p,'amount_minor'),remaining_net,remaining_tax);
    amount:=(split->>'net')::bigint;tax:=(split->>'tax')::bigint;
   else amount:=repair_private.amount(p,'net_minor');tax:=repair_private.amount(p,'tax_minor');end if;
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
  amount:=repair_private.amount(p,'estimated_minor');total:=case when p->>'actual_minor' is null then null else repair_private.amount(p,'actual_minor') end;tax:=0;
  if coalesce((p->>'tax_minor')::bigint,0)<>0 then raise exception 'Use simple pricing: record the full shop cost as one amount';end if;
  insert into repair_private.bills(supplier_id,description,category,quantity,unit,estimated_minor,actual_minor,tax_minor,reference,purchase_date,due_date,terms)
   values(nullif(p->>'supplier_id','')::uuid,left(p->>'description',300),left(coalesce(p->>'category','Parts'),100),q,left(coalesce(p->>'unit','item'),30),amount,total,tax,left(coalesce(p->>'reference',''),200),(p->>'purchase_date')::date,nullif(p->>'due_date','')::date,left(coalesce(p->>'terms',''),500)) returning to_jsonb(bills) into result;
 elsif action='bill_confirm' then
  if b.id is null or b.actual_minor is not null or b.version is distinct from (p->>'version')::int or reason='' then raise exception 'Unconfirmed bill, current version and reason required';end if;
  if p ? 'amount_minor' then
   total:=repair_private.amount(p,'amount_minor');tax:=b.tax_minor;amount:=total-tax;
   if amount<0 then raise exception 'Confirmed cost is below the original adjustment; review this historical bill';end if;
  else
   amount:=repair_private.amount(p,'actual_minor');tax:=b.tax_minor;
   if coalesce((p->>'tax_minor')::bigint,0)<>tax then raise exception 'Original bill adjustment must be preserved';end if;
  end if;
  update repair_private.bills set actual_minor=amount,tax_minor=tax,version=version+1 where id=bid returning to_jsonb(bills) into result;
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
  if p ? 'amount_minor' then
   if jid is not null then
    select cp.actual_minor into remaining_net from repair_private.cost_parts cp where cp.bill_id=bid and cp.job_id=jid;
    if not found then raise exception 'Choose a job allocated to this bill';end if;
    select (round(b.tax_minor*a.cum/b.quantity)-round(b.tax_minor*(a.cum-a.quantity)/b.quantity))::bigint into remaining_tax
    from (select z.*,sum(quantity) over(order by created_at,id) as cum from repair_private.allocations z where z.bill_id=bid) a where a.job_id=jid;
   else
    select b.actual_minor-coalesce(sum(actual_minor),0) into remaining_net from repair_private.cost_parts where bill_id=bid;
    select b.tax_minor-round(b.tax_minor*coalesce(sum(quantity),0)/b.quantity)::bigint into remaining_tax from repair_private.allocations where bill_id=bid;
   end if;
   select remaining_net-coalesce(sum(net_minor),0),remaining_tax-coalesce(sum(tax_minor),0) into remaining_net,remaining_tax from repair_private.cost_credits where bill_id=bid and job_id is not distinct from jid;
   split:=repair_private.split_credit(repair_private.amount(p,'amount_minor'),remaining_net,remaining_tax);
   amount:=(split->>'net')::bigint;tax:=(split->>'tax')::bigint;
  else amount:=repair_private.amount(p,'net_minor');tax:=repair_private.amount(p,'tax_minor');end if;
  q:=coalesce((p->>'quantity')::numeric,0);
  if amount+tax<=0 or q<0 or q<>round(q,3) then raise exception 'Invalid credit amount / quantity';end if;
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
create or replace function repair_private.snapshot(j repair_private.jobs) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('business',(select data from repair_private.business),'info',j.info,
 'calculation',jsonb_set(repair_private.calc(j.lines),'{lines}',
  (select jsonb_agg(x-'internal_note'-'unverified_note'-'price_review_id') from jsonb_array_elements(repair_private.calc(j.lines)->'lines') x)),
 'estimate_number',j.number,'job_number',j.job_number,'revision',j.revision,
 'customer_approval',j.customer_approval,'insurer_approval',j.insurer_approval);
$$;
-- Allocate known quotations only. M/R must be resolved explicitly before package pricing.
create or replace function repair_private.package_allocations(lines jsonb,total bigint) returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb; denominator numeric; begin
 if total is null or total<0 or total>1000000000000 then raise exception 'Invalid package amount';end if;
 if exists(select 1 from jsonb_array_elements(lines) x where x->>'net_minor' is null or coalesce((x->>'excluded')::boolean,false)) then raise exception 'Confirm all selected prices; M/R cannot be used as a package weight';end if;
 select sum((x->>'net_minor')::numeric) into denominator from jsonb_array_elements(lines) x;
 if denominator is null or denominator<=0 then raise exception 'Package quotations must have a positive total';end if;
 with weights as(select x->>'id' id,(x->>'net_minor')::numeric*total/denominator exact from jsonb_array_elements(lines) x),
 parts as(select id,floor(exact)::bigint base,exact-floor(exact) rem from weights),
 ranked as(select *,row_number() over(order by rem desc,id collate "C") n,total-sum(base) over() remainder from parts)
 select jsonb_agg(jsonb_build_object('id',id,'amount_minor',base+case when n<=remainder then 1 else 0 end) order by id collate "C") into result from ranked;
 return result;
end $$;
create or replace function repair_private.price_api(action text,p jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); j repair_private.jobs; prior repair_private.requests; review repair_private.price_reviews;
 rec repair_private.price_reviews; rows jsonb; allocations jsonb; result jsonb; decision text; target bigint; reason text:=trim(coalesce(p->>'reason','')); begin
 if not repair_private.can('manage_repairs') then raise exception 'Permission required: manage_repairs' using errcode='42501';end if;
 if request_id is null then raise exception 'Request ID required';end if;
 perform pg_advisory_xact_lock(hashtextextended('repair:'||uid::text||request_id::text,0));
 select * into prior from repair_private.requests r where r.actor=uid and r.request_id=price_api.request_id;
 if found then
  if prior.action<>price_api.action or prior.payload_hash<>md5(p::text) then raise exception 'Request key reused with different data';end if;
  return prior.response;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('tenuli-repair-finance',0));
 select * into strict j from repair_private.jobs where id=(p->>'job_id')::uuid for update;
 if j.version is distinct from (p->>'version')::int then raise exception 'Job changed; reload before reviewing' using errcode='40001';end if;
 if j.status='cancelled' or exists(select 1 from repair_private.documents where job_id=j.id and kind='invoice' and status='issued') or exists(select 1 from repair_private.handovers where job_id=j.id) then raise exception 'Use the existing correction workflow; issued or handed-over jobs cannot change';end if;
 if length(reason) not between 1 and 1000 or length(coalesce(p->>'supporting_note',''))>2000 then raise exception 'Review reason required (max 1000); supporting note max 2000';end if;
 if action='price_propose' then
  if p->>'kind' not in('item','package') or jsonb_typeof(p->'line_ids') is distinct from 'array' then raise exception 'Select included items';end if;
  select jsonb_agg(x) into rows from jsonb_array_elements(repair_private.calc(j.lines)->'lines') x where p->'line_ids' ? (x->>'id') and not coalesce((x->>'excluded')::boolean,false);
  if rows is null or jsonb_array_length(rows)<>jsonb_array_length(p->'line_ids') or (p->>'kind'='item' and jsonb_array_length(rows)<>1) or (p->>'kind'='package' and jsonb_array_length(rows)<2) then raise exception 'Select distinct included items';end if;
  decision:=case when p->>'status'='not_required' then 'not_required' else 'pending' end;
  target:=case when decision='not_required' then null else repair_private.amount(p,'proposed_minor') end;
  allocations:=case when decision='not_required' then '[]'::jsonb when p->>'kind'='package' then repair_private.package_allocations(rows,target) else jsonb_build_array(jsonb_build_object('id',rows->0->>'id','amount_minor',target)) end;
  insert into repair_private.price_reviews(job_id,kind,status,source_version,original_lines,proposed_minor,allocations,reason,supporting_note,recorded_by)
   values(j.id,p->>'kind',decision,j.version,rows,target,allocations,reason,coalesce(p->>'supporting_note',''),uid) returning * into rec;
 elsif action='price_decide' then
  select * into strict review from repair_private.price_reviews where id=(p->>'review_id')::uuid and job_id=j.id and status='pending';
  if exists(select 1 from repair_private.price_reviews where parent_id=review.id) then raise exception 'Review already decided';end if;
  decision:=p->>'decision';if decision is null or decision not in('accepted','rejected') then raise exception 'Explicit accept or reject required';end if;
  if decision='accepted' and review.source_version<>j.version then raise exception 'Quote revised; create a new proposal';end if;
  insert into repair_private.price_reviews(job_id,parent_id,kind,status,source_version,original_lines,proposed_minor,allocations,reason,supporting_note,recorded_by)
   values(j.id,review.id,review.kind,decision,j.version,review.original_lines,review.proposed_minor,review.allocations,reason,coalesce(p->>'supporting_note',''),uid) returning * into rec;
  if decision='accepted' then
   select jsonb_agg(case when a is null then x else x||jsonb_build_object('agreed_minor',(a->>'amount_minor')::bigint,'price_review_id',rec.id) end order by ord) into rows
    from jsonb_array_elements(j.lines) with ordinality e(x,ord)
    left join lateral(select v a from jsonb_array_elements(rec.allocations) v where v->>'id'=x->>'id') q on true;
   update repair_private.jobs set lines=repair_private.calc(rows)->'lines',version=version+1,revision=revision+1,status='draft',customer_approval='pending',insurer_approval='not_requested',updated_at=now() where id=j.id returning * into j;
  end if;
 else raise exception 'Unknown price action';end if;
 insert into repair_private.events(job_id,actor,action,reason) values(j.id,uid,action,reason);
 result:=jsonb_build_object('job',to_jsonb(j)-'costs_complete','review',to_jsonb(rec));
 insert into repair_private.requests(actor,request_id,action,payload_hash,response) values(uid,request_id,action,md5(p::text),result);
 return result;
end $$;
-- Freeze issued accounting snapshots, allowing only the existing void status transition.
create or replace function repair_private.accounting_document_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Issued document is immutable';end if;
 if (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') or not(old.status='issued' and new.status='void') then raise exception 'Issued document snapshot is immutable';end if;
 return new;
end $$;
drop trigger if exists accounting_document_guard on repair_private.documents;
create trigger accounting_document_guard before update or delete on repair_private.documents for each row execute function repair_private.accounting_document_guard();
create or replace function public.repair_api(p_action text,p_payload jsonb default '{}',p_request_id uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;begin
 if p_action in('price_propose','price_decide') then return repair_private.price_api(p_action,p_payload,p_request_id);end if;
 result:=case when p_action in('list','bill_status','arrival_create','arrival_issue','final_issue','final_reissue','collect_balance','final_handover') then repair_private.two_document_api(p_action,p_payload,p_request_id)
 when p_action in('document_copy','document_reissue') then repair_private.grouped_api(p_action,p_payload,p_request_id)
 when p_action in('service_document','receiving_create','receiving_issue','completion_issue','handover') then repair_private.service_api(p_action,p_payload,p_request_id)
 else repair_private.api(p_action,p_payload,p_request_id) end;
 if p_action='list' then result:=result||repair_private.price_list();end if;
 return result;
end $$;
create or replace function repair_private.price_list() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not(repair_private.can('view_repairs') or repair_private.can('manage_repairs') or repair_private.can('view_repair_billing') or repair_private.can('manage_repair_payments')) then raise exception 'Repair access denied' using errcode='42501';end if;
 return jsonb_build_object('price_reviews',(select coalesce(jsonb_agg(to_jsonb(r) order by recorded_at desc),'[]') from repair_private.price_reviews r),'pricing_reviews',true);
end $$;
revoke all on function repair_private.validate_agreements(jsonb),repair_private.calc(jsonb),repair_private.snapshot(repair_private.jobs),repair_private.work_section(text),repair_private.package_allocations(jsonb,bigint),repair_private.accounting_document_guard(),repair_private.price_api(text,jsonb,uuid),repair_private.price_list() from public,anon,authenticated;
grant execute on function repair_private.price_api(text,jsonb,uuid),repair_private.price_list() to authenticated;
revoke all on function public.repair_api(text,jsonb,uuid) from public,anon;
grant execute on function public.repair_api(text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
