import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {operationsItems,operationsSummary} from '../src/lib/operations-document.ts';
const db=new PGlite(),read=f=>readFile(new URL(f,import.meta.url),'utf8');
for(const f of ['platform','rental','repairs','simple-billing','service-documents','grouped-billing','two-documents','modern-pdfs','pricing-photos'])await db.exec(await read('./fixtures/database/'+f+'.sql'));
const admin='00000000-0000-4000-8000-000000000001',officer='00000000-0000-4000-8000-000000000004';
const as=async id=>db.exec(`reset role;set request.jwt.claim.sub='${id}';set role authenticated`);
const rpc=async(a,p={},key=crypto.randomUUID())=>(await db.query('select public.repair_api($1,$2::jsonb,$3::uuid) r',[a,JSON.stringify(p),key])).rows[0].r;
const job=async id=>(await rpc('list')).jobs.find(j=>j.id===id);
const info={customer_name:'SAMPLE CUSTOMER',registration:'TEST-118',reported_problem:'Body damage',requested_work:'Repair vehicle',claim_number:'TEST-CLAIM'};
const line=(id,price,category='Repair Items',extra={})=>({id,description:'SAMPLE '+id,quantity:1,unit_minor:price,discount_minor:0,tax_bps:0,category,...extra});
const receive=async j=>rpc('arrival_issue',{job_id:j.id,version:j.version,reported_problem:info.reported_problem,requested_work:info.requested_work,received_at:'2026-01-01T08:00:00+05:30'});
const finish=async j=>{for(const a of ['approve','start','complete'])j=await rpc(a,{job_id:j.id,version:j.version,reason:'Confirmed test action'});return j};
await as(admin);
let old=await rpc('save',{info,lines:[line('historic',10000000)]});
const oldRN=await receive(old);old=await finish(await job(old.id));
const oldInvoice=await rpc('final_issue',{job_id:old.id,version:old.version,work_performed:'Recorded work',due_date:'2027-01-01'}),reportBefore=await rpc('report');
await db.exec('reset role');const upgrade=await read('../../supabase/TENULI_OPERATIONS_BILL_UPGRADE.sql');await db.exec(upgrade);await db.exec(upgrade);await as(admin);
assert.deepEqual(await rpc('service_document',{id:oldRN.id}),oldRN);assert.deepEqual(await rpc('document',{id:oldInvoice.id}),oldInvoice);assert.deepEqual(await rpc('report'),reportBefore);
const whiteJob=await rpc('save',{info,lines:[line('white-history',1000000)]});const whiteRN=await receive(whiteJob);
const blueUpgrade=await read('../../supabase/TENULI_BLUE_LETTERHEAD_UPGRADE.sql');
await db.exec('reset role');await db.exec(blueUpgrade);await db.exec(blueUpgrade);await as(admin);
assert.equal(whiteRN.snapshot.letterhead_style,undefined);assert.deepEqual(await rpc('service_document',{id:whiteRN.id}),whiteRN);
const categories=['Replacement Items','Removal & Refitting Items','Repair Items','Paint Items','Miscellaneous Items','Other Charges'];
let j=await rpc('save',{info,lines:categories.map((c,i)=>line(String(i),i===0?5000000:1000000,c,{position:'Front',internal_note:'SECRET INTERNAL',unverified_note:'SECRET CODE'})).concat(line('excluded',1000000,'Repair Items',{excluded:true}))});
const key=crypto.randomUUID(),arrival={job_id:j.id,version:j.version,reported_problem:info.reported_problem,requested_work:info.requested_work,condition:'Existing paint damage',received_at:'2026-01-01T08:00:00+05:30',advance_minor:2000000,confirm_advance:true,method:'bank',reference:'TEST-ADVANCE'};
const rn=await rpc('arrival_issue',arrival,key);assert.deepEqual(await rpc('arrival_issue',arrival,key),rn);
assert.equal(rn.snapshot.layout_version,'operations-a4-v2');assert.equal(rn.snapshot.settlement.total_minor,10000000);assert.equal(rn.snapshot.settlement.advance_minor,2000000);assert.equal(rn.snapshot.settlement.balance_minor,8000000);
assert.equal(rn.snapshot.calculation.lines.length,6);assert.equal(rn.snapshot.info.claim_number,'TEST-CLAIM');assert.equal(rn.snapshot.payment_details.length,1);
assert.equal(rn.snapshot.letterhead_style,'blue-v1');
assert.deepEqual(operationsItems(rn.snapshot).map(l=>l.row_number),[1,2,3,4,5,6]);assert.doesNotMatch(JSON.stringify(rn.snapshot),/SECRET/);
assert.equal(operationsSummary(rn.snapshot,true).state,'estimate');assert.match(rn.snapshot.business.logo,/^data:image\/png;base64,/);
let pending=await rpc('save',{info,lines:[line('pending',null),line('known',500000)]});const pendingRN=await receive(pending);assert.equal(pendingRN.snapshot.calculation.pending,1);assert.equal(operationsSummary(pendingRN.snapshot,true).pending,true);assert.equal(pendingRN.snapshot.payment_ack.advance_minor,0);
pending=await finish(await job(pending.id));await assert.rejects(rpc('final_issue',{job_id:pending.id,version:pending.version,work_performed:'Done',due_date:'2027-01-01'}),/price-pending/);
j=await finish(await job(j.id));
const inv=await rpc('final_issue',{job_id:j.id,version:j.version,work_performed:'Repairs completed',due_date:'2027-01-01'});
assert.deepEqual(inv.snapshot.calculation,rn.snapshot.calculation);assert.deepEqual(inv.snapshot.receiving_content,rn.snapshot.receiving_content);assert.equal(inv.snapshot.settlement.balance_minor,8000000);assert.equal(operationsSummary(inv.snapshot,false).state,'partial');
assert.equal(inv.snapshot.payment_details[0].reference,'TEST-ADVANCE');
assert.equal(inv.snapshot.letterhead_style,'blue-v1');
const ledgerBefore=(await rpc('list')).payments.length;for(let i=0;i<3;i++){await rpc('document',{id:inv.id});await rpc('service_document',{id:rn.id});}assert.equal((await rpc('list')).payments.length,ledgerBefore);
const p={job_id:j.id,document_id:inv.id,amount_minor:3000000,expected_balance_minor:8000000,method:'cash',confirm:true};await rpc('collect_balance',p);
let copy=await rpc('final_reissue',{job_id:j.id,version:(await job(j.id)).version,document_id:inv.id,copy_revision:0,reason:'Partial payment',work_performed:'Repairs completed'});assert.equal(copy.snapshot.settlement.balance_minor,5000000);assert.equal(copy.snapshot.settlement.paid_minor,5000000);assert.equal(copy.snapshot.payment_details.length,2);assert.deepEqual(copy.snapshot.calculation,inv.snapshot.calculation);const partialCopy=structuredClone(copy);
await rpc('collect_balance',{...p,amount_minor:5000000,expected_balance_minor:5000000});copy=await rpc('final_reissue',{job_id:j.id,version:(await job(j.id)).version,document_id:inv.id,copy_revision:1,reason:'Fully paid',work_performed:'Repairs completed'});assert.equal(copy.snapshot.settlement.balance_minor,0);assert.equal(operationsSummary(copy.snapshot,false).state,'paid');const paidCopy=structuredClone(copy);
assert.deepEqual(await rpc('document',{id:inv.id}),inv);assert.deepEqual(await rpc('service_document',{id:rn.id}),rn);assert.equal((await rpc('list')).handovers.length,0);
await rpc('customer_credit',{document_id:inv.id,amount_minor:100000,reason:'Authorized correction'});await rpc('refund',{job_id:j.id,amount_minor:50000,payer:'customer',method:'bank',reason:'Partial refund'});
copy=await rpc('final_reissue',{job_id:j.id,version:(await job(j.id)).version,document_id:inv.id,copy_revision:2,reason:'Credit and refund statement',work_performed:'Repairs completed'});assert.equal(copy.snapshot.settlement.balance_minor,-50000);assert.equal(operationsSummary(copy.snapshot,false).state,'overpaid');
assert.equal((await rpc('report')).find(x=>x.id===j.id).revenue_minor,9900000);
// Accepted package allocations, original quotes and pending-price semantics survive projection.
let pack=await rpc('save',{info,lines:[line('pack-a',101),line('pack-b',101)]});const proposal=await rpc('price_propose',{job_id:pack.id,version:pack.version,kind:'package',line_ids:['pack-a','pack-b'],proposed_minor:101,reason:'Confirmed package'});pack=(await rpc('price_decide',{job_id:pack.id,version:pack.version,review_id:proposal.review.id,decision:'accepted',reason:'Accepted'})).job;
const packRN=await receive(pack);assert.equal(packRN.snapshot.calculation.total_minor,101);assert.deepEqual(operationsItems(packRN.snapshot).map(x=>x.net_minor),[51,50]);assert.deepEqual(operationsItems(packRN.snapshot).map(x=>x.unit_minor),[101,101]);
// Old issue is retained after a revised vehicle/price entry; next issue captures current details.
let revision=await rpc('save',{info,lines:[line('one',1000000)]});const original=await receive(revision);revision=await job(revision.id);revision=await rpc('save',{job_id:revision.id,version:revision.version,info:{...revision.info,registration:'TEST-REVISED'},lines:[line('one',1200000)],reason:'Authorized estimate revision'});
const revised=await rpc('arrival_issue',{...arrival,job_id:revision.id,version:revision.version,document_revision:1,advance_minor:0,reason:'Updated registration and estimate'});assert.equal(revised.snapshot.info.registration,'TEST-REVISED');assert.equal(revised.snapshot.settlement.total_minor,1200000);assert.deepEqual(await rpc('service_document',{id:original.id}),original);
// Full receiving bills inherit the existing billing restriction even without an advance.
await db.exec(`reset role;insert into public.user_permissions values('${officer}','manage_repairs',true)`);await as(officer);
await assert.rejects(rpc('service_document',{id:pendingRN.id}),/Billing access/);assert.equal((await rpc('list')).service_documents.some(x=>x.id===pendingRN.id),false);
const staff=await rpc('arrival_create',{customer_name:'Staff test',registration:'STAFF-118',reported_problem:'Noise',requested_work:'Inspect'});assert.equal(staff.snapshot.layout_version,'modern-a4-v1');assert.equal(staff.snapshot.calculation,undefined);assert.equal(staff.snapshot.billing,null);
await assert.rejects(rpc('arrival_issue',arrival,key),/Billing access|Payment permission/);
await db.exec('reset role');await assert.rejects(db.query("update repair_private.service_documents set snapshot='{}'"),/immutable/);await db.exec(upgrade);await as(admin);assert.deepEqual(await rpc('document',{id:inv.id}),inv);
// The new default uses the original supplied image bytes.
const image=await readFile(new URL('../public/tenuli-capture-logo.png',import.meta.url));assert.equal(rn.snapshot.business.logo,'data:image/png;base64,'+image.toString('base64'));
assert.equal((await rpc('list')).payments.find(p=>p.job_id===j.id).snapshot.business.logo,rn.snapshot.business.logo);
assert.equal((await rpc('list')).payments.find(p=>p.job_id===j.id).snapshot.letterhead_style,'blue-v1');
// Discounts and an unpaid completion never imply a payment or handover.
let discounted=await rpc('save',{info,lines:[line('discounted',1000000,'Repair Items',{discount_minor:100000})]});
const discountedRN=await receive(discounted);discounted=await finish(await job(discounted.id));
const discountedFinal=await rpc('final_issue',{job_id:discounted.id,version:discounted.version,work_performed:'Confirmed test repairs',due_date:'2027-01-01'});
assert.equal(discountedFinal.total_minor,900000);assert.deepEqual(discountedFinal.snapshot.calculation,discountedRN.snapshot.calculation);assert.equal(operationsSummary(discountedFinal.snapshot,false).state,'unpaid');assert.equal((await rpc('list')).payments.filter(p=>p.job_id===discounted.id).length,0);
// New rental invoices receive the same frozen configured logo without changing rental math.
const rental=async(a,p={})=>(await db.query('select public.rental_api($1,$2::jsonb,$3::uuid) r',[a,JSON.stringify(p),crypto.randomUUID()])).rows[0].r;
const customer=await rental('customer_save',{name:'SAMPLE RENTAL CUSTOMER',phone:'0700000000'});
let booking=await rental('booking_save',{vehicle_id:'10000000-0000-4000-8000-000000000001',customer_id:customer.id,pickup_at:'2027-01-01T09:00:00+05:30',return_at:'2027-01-02T09:00:00+05:30',rate_plan:'daily',rate_minor:1000000,included_km:100,excess_rate_minor:0,extras:[],discount_minor:0});
booking=await rental('confirm',{id:booking.id,version:booking.version});booking=await rental('checkout',{id:booking.id,version:booking.version,odometer_out:1000});booking=await rental('return',{id:booking.id,version:booking.version,odometer_in:1050,actual_return_at:'2027-01-02T09:00:00+05:30'});
const rentalInvoice=await rental('invoice_issue',{id:booking.id,version:booking.version,due_date:'2027-01-03'});assert.equal(rentalInvoice.snapshot.business.logo,rn.snapshot.business.logo);assert.equal(rentalInvoice.total_minor,1000000);
assert.equal(rentalInvoice.snapshot.letterhead_style,'blue-v1');assert.equal(paidCopy.snapshot.letterhead_style,'blue-v1');assert.deepEqual(await rpc('service_document',{id:whiteRN.id}),whiteRN);
console.log('PASS operations bills: shared items, all six sections, advances once, pending prices, partial/full payment, credits/refunds, revisions, immutable history, original logo bytes, package rounding and role isolation.');
if(process.env.TENULI_BILL_FIXTURE_PATH){const {writeFile}=await import('node:fs/promises');await writeFile(process.env.TENULI_BILL_FIXTURE_PATH,JSON.stringify({receiving:rn,invoice:inv,partial:partialCopy,paid:paidCopy,overpaid:copy,pending:pendingRN,package:packRN,legacy:oldInvoice},null,2));}
await db.close();
