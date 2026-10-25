-- Tenuli 1.14: two customer documents, atomic receiving advances and final-bill copies.
-- Additive: existing documents, payments and financial totals are never rewritten.
begin;
do $$ begin
 if to_regprocedure('repair_private.grouped_api(text,jsonb,uuid)') is null then raise exception 'Install grouped billing first, or run ENABLE_AUTOMART.sql';end if;
end $$;
alter table repair_private.jobs add column if not exists completion_details jsonb not null default '{}';
alter table repair_private.payments add column if not exists purpose text check(purpose in('advance','balance'));
alter table repair_private.handovers alter column completion_document_id drop not null;
alter table repair_private.handovers add column if not exists final_document_id uuid references repair_private.documents(id);

create or replace function repair_private.payment_purpose() returns trigger language plpgsql set search_path='' as $$
begin
 new.purpose:=case when exists(select 1 from repair_private.documents where job_id=new.job_id and kind='invoice' and status='issued') then 'balance' else 'advance' end;
 return new;
end $$;
drop trigger if exists payment_purpose on repair_private.payments;
create trigger payment_purpose before insert on repair_private.payments for each row execute function repair_private.payment_purpose();

create or replace function repair_private.payment_summary(jid uuid,invoice_id uuid,invoice_total bigint) returns jsonb language sql stable set search_path='' as $$
 with amounts as (
  select coalesce(sum(amount_minor) filter(where kind='payment' and coalesce(purpose,case when created_at<=coalesce((select min(created_at) from repair_private.documents where job_id=jid and kind='invoice'),'infinity') then 'advance' else 'balance' end)='advance'),0)::bigint as advance,
   coalesce(sum(amount_minor) filter(where kind='payment' and coalesce(purpose,case when created_at<=coalesce((select min(created_at) from repair_private.documents where job_id=jid and kind='invoice'),'infinity') then 'advance' else 'balance' end)='balance'),0)::bigint as other,
   coalesce(sum(amount_minor) filter(where kind='refund'),0)::bigint as refunds
  from repair_private.payments where job_id=jid
 ), credit as (select coalesce(sum(total_minor),0)::bigint as total from repair_private.documents where parent_id=invoice_id and kind='credit' and status='issued')
 select jsonb_build_object('total_minor',invoice_total,'advance_minor',a.advance,'other_payments_minor',a.other,'refund_minor',a.refunds,'paid_minor',a.advance+a.other-a.refunds,'credit_minor',c.total,'balance_minor',invoice_total-c.total-a.advance-a.other+a.refunds,'as_of',now()) from amounts a cross join credit c;
$$;
create or replace function repair_private.receiving_ack_insert() returns trigger language plpgsql set search_path='' as $$
declare ack jsonb;begin
 if new.kind='receiving' then
  select jsonb_build_object('advance_minor',coalesce(sum(amount_minor),0),'payments',coalesce(jsonb_agg(jsonb_build_object('number',number,'amount_minor',amount_minor,'created_at',created_at,'method',method,'reference',reference) order by created_at,number),'[]')) into ack
  from repair_private.payments where job_id=new.job_id and kind='payment' and coalesce(purpose,case when created_at<=coalesce((select min(created_at) from repair_private.documents where job_id=new.job_id and kind='invoice'),'infinity') then 'advance' else 'balance' end)='advance';
  if (ack->>'advance_minor')::bigint>0 and not (repair_private.can('view_repair_billing') or repair_private.can('manage_repair_payments')) then raise exception 'Billing access is required for a receiving note with an advance';end if;
  new.snapshot:=new.snapshot||jsonb_build_object('template_version','receiving-advance-v1','payment_ack',ack);
  -- Existing service-document authorization also protects the advance snapshot.
  if (ack->>'advance_minor')::bigint>0 then new.snapshot:=new.snapshot||jsonb_build_object('billing',ack);end if;
 end if;
 return new;
end $$;
drop trigger if exists receiving_ack_insert on repair_private.service_documents;
create trigger receiving_ack_insert before insert on repair_private.service_documents for each row execute function repair_private.receiving_ack_insert();

create or replace function repair_private.final_snapshot(s jsonb,jid uuid,invoice_id uuid,invoice_total bigint) returns jsonb language plpgsql stable set search_path='' as $$
declare j repair_private.jobs;completion jsonb;begin
 select * into strict j from repair_private.jobs where id=jid;
 completion:=case when (j.completion_details->>'job_revision')::int=j.revision then j.completion_details else s->'completion' end;
 if coalesce(completion->'content'->>'work_performed','')='' then return s;end if;
 return s||jsonb_build_object('template_version','final-bill-v1','completion',completion,'settlement',repair_private.payment_summary(jid,invoice_id,invoice_total));
end $$;
create or replace function repair_private.final_document_insert() returns trigger language plpgsql set search_path='' as $$
begin
 new.snapshot:=new.snapshot||jsonb_build_object('customer_document_policy','two-a4-v1');
 if new.kind='invoice' then new.snapshot:=repair_private.final_snapshot(new.snapshot,new.job_id,new.id,new.total_minor);end if;
 return new;
end $$;
drop trigger if exists two_document_insert on repair_private.documents;
create trigger two_document_insert before insert on repair_private.documents for each row execute function repair_private.final_document_insert();
create or replace function repair_private.final_copy_insert() returns trigger language plpgsql set search_path='' as $$
begin
 new.snapshot:=new.snapshot||jsonb_build_object('customer_document_policy','two-a4-v1');
 if new.kind='invoice' then new.snapshot:=repair_private.final_snapshot(new.snapshot,new.job_id,new.source_document_id,new.total_minor);end if;
 return new;
end $$;
drop trigger if exists two_copy_insert on repair_private.document_copies;
create trigger two_copy_insert before insert on repair_private.document_copies for each row execute function repair_private.final_copy_insert();

create or replace function repair_private.two_document_api(action text,p jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid();billflag boolean:=repair_private.can('view_repair_billing') or repair_private.can('manage_repair_payments');
 j repair_private.jobs;d repair_private.documents;prior repair_private.requests;hand repair_private.handovers;
 result jsonb;res jsonb;info jsonb:='{}';content jsonb:='{}';payload jsonb;summary jsonb;completion jsonb;
 k text;v text;reason text:=trim(coalesce(p->>'reason',''));advance bigint:=0;amount bigint;completed timestamptz;
begin
 if not (repair_private.can('view_repairs') or repair_private.can('manage_repairs') or billflag) then raise exception 'Repair access denied';end if;
 if action='list' then
  return repair_private.grouped_api('list',p,null)||jsonb_build_object('two_document_workflow',true,'workflow_events',(select coalesce(jsonb_agg(to_jsonb(e) order by created_at desc),'[]') from repair_private.events e where e.action in('arrival_create','arrival_issue','final_issue','final_reissue','collect_balance','final_handover')));
 elsif action='bill_status' then
  if not billflag then raise exception 'Billing access denied';end if;
  select * into strict d from repair_private.documents where id=(p->>'document_id')::uuid and kind='invoice';
  return repair_private.payment_summary(d.job_id,d.id,d.total_minor)||jsonb_build_object('invoice_id',d.id,'invoice_number',d.number,'invoice_status',d.status,'job_id',d.job_id);
 end if;
 if action in('arrival_create','arrival_issue') then
  if not repair_private.can('manage_repairs') then raise exception 'Manage repairs permission required';end if;
  advance:=case when p ? 'advance_minor' then repair_private.amount(p,'advance_minor') else 0 end;
  if advance>0 and not repair_private.can('manage_repair_payments') then raise exception 'Payment permission required to receive an advance';end if;
 elsif action in('final_issue','final_reissue','collect_balance') then
  if not repair_private.can('manage_repair_payments') then raise exception 'Payment permission required';end if;
 elsif action='final_handover' then
  if not repair_private.can('manage_repairs') or not billflag then raise exception 'Repair management and billing access required';end if;
 else raise exception 'Unknown two-document action';end if;
 if request_id is null then raise exception 'Request ID required';end if;
 perform pg_advisory_xact_lock(hashtextextended('repair:'||uid::text||request_id::text,0));
 select * into prior from repair_private.requests r where r.actor=uid and r.request_id=two_document_api.request_id;
 if found then
  if prior.action<>two_document_api.action or prior.payload_hash<>md5(p::text) then raise exception 'Request key reused with different data';end if;
  if action in('arrival_create','arrival_issue') and prior.response->'snapshot'->'billing'<>'null'::jsonb and not billflag then raise exception 'Billing access denied';end if;
  return prior.response;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('tenuli-repair-finance',0));
 if length(reason)>1000 then raise exception 'Reason too long';end if;
 if action='arrival_create' then
  foreach k in array array['customer_name','phone','registration','make_model'] loop
   v:=trim(coalesce(p->>k,''));if length(v)>200 then raise exception '% is too long',k;end if;info:=info||jsonb_build_object(k,v);
  end loop;
  res:=repair_private.api('save',jsonb_build_object('info',info,'lines',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'description',left(coalesce(p->>'requested_work','Inspection / diagnosis'),300),'category','Repair Items','quantity',1,'unit','job','unit_minor',null,'discount_minor',0,'tax_bps',0))),gen_random_uuid());
  select * into strict j from repair_private.jobs where id=(res->>'id')::uuid;
 else
  select * into strict j from repair_private.jobs where id=(p->>'job_id')::uuid for update;
  if action<>'collect_balance' and j.version is distinct from (p->>'version')::int then raise exception 'Job changed; reload and try again';end if;
 end if;
 if action in('arrival_create','arrival_issue') then
  if advance>0 then
   if coalesce(p->>'confirm_advance','')<>'true' then raise exception 'Confirm that the advance was actually received';end if;
   if exists(select 1 from repair_private.documents where job_id=j.id and kind='invoice' and status='issued') or exists(select 1 from repair_private.handovers where job_id=j.id) then raise exception 'Use Collect Balance for invoiced jobs';end if;
   if coalesce(p->>'method','') not in('cash','bank','card') then raise exception 'Select a payment method';end if;
   if length(coalesce(p->>'reference',''))>200 then raise exception 'Payment reference is too long';end if;
   perform repair_private.api('payment',jsonb_build_object('job_id',j.id,'amount_minor',advance,'payer','customer','method',p->>'method','reference',coalesce(p->>'reference',''),'reason','Advance at vehicle receiving'),gen_random_uuid());
  end if;
  result:=repair_private.service_api('receiving_issue',p||jsonb_build_object('job_id',j.id,'version',j.version),gen_random_uuid());
 elsif action in('final_issue','final_reissue') then
  if j.status<>'completed' then raise exception 'Complete the job before issuing a final bill';end if;
  completed:=coalesce(j.completed_at,(select max(created_at) from repair_private.events where job_id=j.id and events.action='complete'),nullif(p->>'completed_at','')::timestamptz);
  if completed is null or completed>now() or completed<j.received_at then raise exception 'Enter the actual completion date and time';end if;
  foreach k in array array['work_performed','parts_replaced','recommendations','warranty','checks','notes'] loop
   v:=trim(coalesce(p->>k,''));if length(v)>2000 then raise exception '% is too long (maximum 2000 characters)',k;end if;content:=content||jsonb_build_object(k,v);
  end loop;
  if content->>'work_performed'='' then raise exception 'Work performed is required';end if;
  completion:=jsonb_build_object('content',content,'completed_at',completed,'job_revision',j.revision);
  update repair_private.jobs set completion_details=completion,completed_at=completed,version=version+1,updated_at=now() where id=j.id returning * into j;
  if action='final_issue' then
   result:=repair_private.api('invoice_issue',p||jsonb_build_object('job_id',j.id,'version',j.version),gen_random_uuid());
  else
   select * into strict d from repair_private.documents where id=(p->>'document_id')::uuid and job_id=j.id and kind='invoice' and status='issued';
   result:=repair_private.grouped_api('document_reissue',p||jsonb_build_object('document_id',d.id),gen_random_uuid());
  end if;
 elsif action='collect_balance' then
  if coalesce(p->>'confirm','')<>'true' then raise exception 'Confirm that payment was actually received';end if;
  if coalesce(p->>'method','') not in('cash','bank','card') then raise exception 'Select a payment method';end if;
  if length(coalesce(p->>'reference',''))>200 then raise exception 'Payment reference is too long';end if;
  select * into strict d from repair_private.documents where id=(p->>'document_id')::uuid and job_id=j.id and kind='invoice' and status='issued' for update;
  summary:=repair_private.payment_summary(j.id,d.id,d.total_minor);
  if (summary->>'balance_minor')::bigint is distinct from (p->>'expected_balance_minor')::bigint then raise exception 'Balance changed; refresh before collecting payment';end if;
  amount:=repair_private.amount(p,'amount_minor');
  if amount<=0 or amount>(summary->>'balance_minor')::bigint then raise exception 'Payment must be positive and cannot exceed the balance';end if;
  res:=repair_private.api('payment',p||jsonb_build_object('reason',case when reason='' then 'Final bill balance payment' else reason end,'payer',coalesce(nullif(p->>'payer',''),'customer')),gen_random_uuid());
  result:=jsonb_build_object('payment_id',res->'id','invoice_id',d.id,'settlement',repair_private.payment_summary(j.id,d.id,d.total_minor));
 elsif action='final_handover' then
  if j.status<>'completed' then raise exception 'Complete the job before handover';end if;
  if coalesce(p->>'confirm','')<>'true' then raise exception 'Confirm the vehicle has actually been returned';end if;
  if p ? 'handed_over_at' then raise exception 'Handover time is recorded by the server';end if;
  if exists(select 1 from repair_private.handovers where job_id=j.id) then raise exception 'Vehicle handover already recorded';end if;
  select * into strict d from repair_private.documents where job_id=j.id and kind='invoice' and status='issued';
  if d.snapshot->>'template_version' is distinct from 'final-bill-v1' and not exists(select 1 from repair_private.document_copies where source_document_id=d.id and snapshot->>'template_version'='final-bill-v1') then raise exception 'Issue the combined final bill first';end if;
  v:=trim(coalesce(p->>'recipient',''));
  if v='' or length(v)>200 or length(coalesce(p->>'handover_notes',''))>1000 then raise exception 'Enter recipient (up to 200 characters) and notes up to 1000 characters';end if;
  insert into repair_private.handovers(job_id,final_document_id,recipient,notes,created_by) values(j.id,d.id,v,coalesce(p->>'handover_notes',''),uid) returning * into hand;
  update repair_private.jobs set version=version+1,updated_at=now() where id=j.id;
  result:=to_jsonb(hand);reason:='Vehicle returned to '||v;
 end if;
 insert into repair_private.events(job_id,actor,action,reason) values(j.id,uid,action,case when reason='' then coalesce(result->>'number',action) else reason end);
 insert into repair_private.requests values(uid,request_id,action,md5(p::text),result);
 return result;
end $$;
revoke all on function repair_private.payment_purpose(),repair_private.payment_summary(uuid,uuid,bigint),repair_private.receiving_ack_insert(),repair_private.final_snapshot(jsonb,uuid,uuid,bigint),repair_private.final_document_insert(),repair_private.final_copy_insert(),repair_private.two_document_api(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function repair_private.two_document_api(text,jsonb,uuid) to authenticated;
create or replace function public.repair_api(p_action text,p_payload jsonb default '{}',p_request_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$
 select case when p_action in('list','bill_status','arrival_create','arrival_issue','final_issue','final_reissue','collect_balance','final_handover') then repair_private.two_document_api(p_action,p_payload,p_request_id)
 when p_action in('document_copy','document_reissue') then repair_private.grouped_api(p_action,p_payload,p_request_id)
 when p_action in('service_document','receiving_create','receiving_issue','completion_issue','handover') then repair_private.service_api(p_action,p_payload,p_request_id)
 else repair_private.api(p_action,p_payload,p_request_id) end;
$$;
revoke all on function public.repair_api(text,jsonb,uuid) from public,anon;
grant execute on function public.repair_api(text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
