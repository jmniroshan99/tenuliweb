-- Tenuli Auto Care v1.11.0: simple billing; no historical balances are rewritten.
-- Run after Rentals + Repairs, or use the combined ENABLE_AUTOMART.sql installer.
begin;
select pg_advisory_xact_lock(hashtextextended('tenuli-repair-finance',0));
-- Keep legacy fields for immutable snapshots and correctly bounded reversals.
alter table repair_private.cost_credits drop constraint if exists cost_credits_net_minor_check;
alter table repair_private.cost_credits add constraint cost_credits_net_minor_check check(net_minor>=0);
alter table repair_private.cost_credits drop constraint if exists cost_credits_positive_total;
alter table repair_private.cost_credits add constraint cost_credits_positive_total check(net_minor+tax_minor>0);
create or replace function repair_private.split_credit(total bigint,remaining_net bigint,remaining_tax bigint)
returns jsonb language plpgsql immutable set search_path='' as $$
declare tax bigint;begin
 if total is null or total<=0 or remaining_net is null or remaining_tax is null or remaining_net<0 or remaining_tax<0 or total>remaining_net+remaining_tax then raise exception 'Credit exceeds remaining amount';end if;
 tax:=round(total::numeric*remaining_tax/(remaining_net+remaining_tax))::bigint;
 return jsonb_build_object('net',total-tax,'tax',tax);
end $$;
revoke all on function repair_private.split_credit(bigint,bigint,bigint) from public,anon,authenticated;
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
  if exists(select 1 from jsonb_array_elements(p->'lines') x where coalesce((x->>'tax_bps')::int,0)<>0) then
   raise exception 'Use simple pricing: reopen the estimate in the updated app before saving';end if;
  cal:=repair_private.calc((select jsonb_agg(x||jsonb_build_object('tax_bps',0)) from jsonb_array_elements(p->'lines') x));info:='{}';
  foreach k in array array['customer_name','phone','address','registration','make_model','vehicle_id','accident_date','insurance','policy_number','claim_number','valid_until','advisor','expected_date','notes'] loop
   info:=info||jsonb_build_object(k,left(coalesce(p->'info'->>k,''),case when k in('notes','address') then 1000 else 200 end));
  end loop;
  if trim(info->>'customer_name')='' or trim(info->>'registration')='' then raise exception 'Customer and vehicle registration required';end if;
  foreach k in array array['accident_date','valid_until','expected_date'] loop perform nullif(info->>k,'')::date;end loop;
  if coalesce(info->>'vehicle_id','')<>'' and not exists(select 1 from public.vehicles where id=(info->>'vehicle_id')::uuid) then raise exception 'Vehicle not found';end if;
  info:=info||jsonb_build_object('expected_customer_minor',repair_private.amount(jsonb_build_object('expected_customer_minor',coalesce(p->'info'->>'expected_customer_minor','0')),'expected_customer_minor'),'expected_insurer_minor',repair_private.amount(jsonb_build_object('expected_insurer_minor',coalesce(p->'info'->>'expected_insurer_minor','0')),'expected_insurer_minor'));
  if jid is null then
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

create or replace function rental_private.api(p_action text,p_payload jsonb,p_request_id uuid) returns jsonb
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
  if coalesce((p_payload->>'tax_bps')::int,0)<>0 then raise exception 'Use simple pricing in the updated app';end if;
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
   if coalesce((p_payload->>'tax_bps')::int,0)<>0 then raise exception 'Use simple pricing in the updated app';end if;
   b.extras:=coalesce(p_payload->'extras',b.extras);b.discount_minor:=coalesce((p_payload->>'discount_minor')::bigint,b.discount_minor);b.tax_bps:=0;
   perform rental_private.quote(b);
   update public.rental_bookings set extras=b.extras,discount_minor=b.discount_minor,tax_bps=b.tax_bps,version=version+1,updated_at=now() where rental_bookings.id=b.id returning * into b;
   result:=to_jsonb(b);
  elsif p_action='invoice_issue' then
   if b.version is distinct from (p_payload->>'version')::integer then raise exception 'Booking changed. Reopen the quote' using errcode='40001'; end if;
   if b.status<>'completed' then raise exception 'Record return before issuing the final invoice'; end if;
   if exists(select 1 from public.rental_invoices where booking_id=b.id and status='issued') then raise exception 'An issued invoice already exists'; end if;
   if b.tax_bps<>0 then raise exception 'Use Adjust final charges to review this older booking with simple pricing before invoicing';end if;
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
-- Existing guards, RLS, grants, immutable snapshots and retry records are retained.
notify pgrst, 'reload schema';
commit;
