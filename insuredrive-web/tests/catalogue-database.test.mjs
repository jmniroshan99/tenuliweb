import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite(),read=f=>readFile(new URL(f,import.meta.url),'utf8');
for(const f of ['platform','rental','repairs','simple-billing','service-documents','grouped-billing','two-documents','modern-pdfs','pricing-photos'])await db.exec(await read('./fixtures/database/'+f+'.sql'));
const upgrade=await read('../../supabase/TENULI_CATALOGUE_UPGRADE.sql');
await db.exec(upgrade);await db.exec(upgrade);
const admin='00000000-0000-4000-8000-000000000001',owner='00000000-0000-4000-8000-000000000002',officer='00000000-0000-4000-8000-000000000004';
const as=async id=>db.exec(`reset role;set request.jwt.claim.sub='${id}';set role authenticated`);
const rpc=async(action,p={})=>(await db.query('select public.repair_catalogue_api($1,$2::jsonb) r',[action,JSON.stringify(p)])).rows[0].r;
const repair=async(a,p={})=>(await db.query('select public.repair_api($1,$2::jsonb,$3::uuid) r',[a,JSON.stringify(p),crypto.randomUUID()])).rows[0].r;

await as(admin);assert.deepEqual(await rpc('list'),{items:[]});
const custom={category:'Repair Items',description:'  SAMPLE   custom bracket repair  ',unit:'job',unit_minor:999999,customer_name:'PRIVATE CUSTOMER',aliases:['PRIVATE INTERNAL NOTE']};
const saved=await rpc('add',custom);
assert.equal(saved.description,'SAMPLE custom bracket repair');assert.equal(saved.category,'Repair Items');assert.equal(saved.active,true);assert.equal(saved.version,1);
assert.deepEqual(saved.aliases,[]);assert.doesNotMatch(JSON.stringify(saved),/999999|PRIVATE|created_by|created_at/);
const duplicate=await rpc('add',{...custom,description:'sample custom BRACKET repair'});
assert.deepEqual(duplicate,saved);
assert.equal((await rpc('list')).items.length,1);
await assert.rejects(rpc('add',{...custom,category:'Unknown section'}),/Invalid catalogue/);
await assert.rejects(rpc('add',{...custom,description:' '}),/Invalid catalogue/);
await assert.rejects(rpc('add',{...custom,description:'x'.repeat(301)}),/Invalid catalogue/);
await assert.rejects(rpc('add',{...custom,unit:'x'.repeat(41)}),/Invalid catalogue/);
await assert.rejects(rpc('add',{...custom,description:{nested:'object'}}),/Choose a section/);
await assert.rejects(rpc('add',{...custom,unit:null}),/Choose a section/);
await assert.rejects(rpc('delete',{id:saved.id}),/Unknown catalogue/);
await assert.rejects(db.query('select * from repair_private.custom_catalogue'),/permission denied/);
await assert.rejects(db.query("insert into repair_private.custom_catalogue(category,description,unit,created_by) values('Repair Items','Bypass','job',$1)",[admin]),/permission denied/);

// Adding a custom estimate row is separate from sharing it, and saved snapshots
// keep their entered description/price even when a shared suggestion is hidden.
const info={customer_name:'SAMPLE CUSTOMER',registration:'CATALOGUE-TEST',reported_problem:'Bracket damage',requested_work:'Repair bracket'};
const line={id:'custom',category:'Repair Items',description:'One-off custom repair',quantity:2,unit:'job',unit_minor:10000,discount_minor:1000,tax_bps:0};
let job=await repair('save',{info,lines:[line]});
assert.equal((await rpc('list')).items.length,1);
let reopened=(await repair('list')).jobs.find(j=>j.id===job.id);assert.equal(reopened.lines[0].description,line.description);assert.equal(reopened.lines[0].unit_minor,10000);
const note=await repair('arrival_issue',{job_id:job.id,version:job.version,reported_problem:info.reported_problem,requested_work:info.requested_work,received_at:'2026-10-25T10:00:00+05:30'});
const report=await repair('report');const ledger=(await repair('list')).payments;
reopened=(await repair('list')).jobs.find(j=>j.id===job.id);
job=await repair('save',{job_id:job.id,version:reopened.version,reason:'Authorized test revision',info:{...info,requested_work:'Repair and inspect bracket'},lines:[line]});
assert.equal(job.lines[0].description,line.description);assert.equal(job.lines[0].unit_minor,10000);
await db.exec(`reset role;update repair_private.custom_catalogue set active=false,version=version+1 where id='${saved.id}';`);await as(admin);
assert.deepEqual(await rpc('list'),{items:[]});
assert.deepEqual(await repair('service_document',{id:note.id}),note);
assert.deepEqual(await repair('report'),report);assert.deepEqual((await repair('list')).payments,ledger);

// Existing explicit permission denials override administrator role defaults.
await db.exec(`reset role;insert into public.user_permissions values('${admin}','manage_system_settings',false)`);await as(admin);
await assert.rejects(rpc('add',{...custom,description:'Denied admin write'}),/settings permission/);
await db.exec(`reset role;delete from public.user_permissions where user_id='${admin}' and permission_key='manage_system_settings';update repair_private.custom_catalogue set active=true where id='${saved.id}';insert into public.user_permissions values('${officer}','manage_repairs',true)`);
await as(officer);assert.equal((await rpc('list')).items.length,1);await assert.rejects(rpc('add',custom),/settings permission/);
await db.exec(`reset role;update public.user_permissions set allowed=false where user_id='${officer}' and permission_key='manage_repairs'`);await as(officer);
await assert.rejects(rpc('list'),/Repair access denied/);
await as(owner);await assert.rejects(rpc('list'),/Repair access denied/);await assert.rejects(rpc('add',custom),/Repair access denied/);
await db.exec(`reset role;update public.profiles set is_active=false where id='${admin}'`);await as(admin);
await assert.rejects(rpc('list'),/Repair access denied/);await assert.rejects(rpc('add',custom),/Repair access denied/);
await db.exec("reset role;set request.jwt.claim.sub='';set role authenticated");await assert.rejects(rpc('list'),/Repair access denied/);
await db.exec('reset role;set role anon');await assert.rejects(rpc('list'),/permission denied/);await assert.rejects(rpc('add',custom),/permission denied/);
await db.exec(`reset role;update public.profiles set is_active=true where id='${admin}'`);await db.exec(upgrade);await as(admin);
assert.equal((await rpc('list')).items.length,1);assert.equal((await rpc('list')).items[0].id,saved.id);
await db.exec('reset role');assert.equal((await db.query("select count(*) n from public.audit_logs where action='repair_catalogue_add'")).rows[0].n,1);
assert.equal((await db.query("select relrowsecurity from pg_class where oid='repair_private.custom_catalogue'::regclass")).rows[0].relrowsecurity,true);
console.log('PASS shared catalogue: explicit authorized saving, deduplicated retries, validation, read/write isolation, inactive/owner/anonymous denial, no direct access, repeat upgrade and unchanged job prices, payments and snapshots.');
await db.close();
