import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
const platform=await read('./fixtures/database/platform.sql'),rental=await read('../../supabase/RENTALS_UPGRADE.sql'),repair=await read('../../supabase/TENULI_REPAIRS_UPGRADE.sql'),install=await read('../../supabase/ENABLE_AUTOMART.sql');
for(const mode of ['insurance-only','rentals-installed','all-installed']){
 const db=new PGlite();await db.exec(platform);
 if(mode!=='insurance-only')await db.exec(rental);if(mode==='all-installed')await db.exec(repair);
 await db.exec(install);
 const admin='00000000-0000-4000-8000-000000000001';
 await db.exec(`set request.jwt.claim.sub='${admin}';set role authenticated`);
 let access=await db.query('select * from public.get_effective_permissions()');assert.ok(access.rows.some(r=>r.permission_key==='manage_repairs'));assert.ok(access.rows.some(r=>r.permission_key==='manage_shop_costs'));
 const saved=(await db.query('select public.repair_api($1,$2::jsonb,$3::uuid) as r',['save',JSON.stringify({info:{customer_name:'Preserved install test',registration:'INSTALL-TEST',expected_customer_minor:0,expected_insurer_minor:0},lines:[{id:'line1',category:'Service',description:'Service test',quantity:1,unit_minor:10000,discount_minor:0,tax_bps:0}]}),crypto.randomUUID()])).rows[0].r;
 await db.exec(`reset role;insert into public.user_permissions values('${admin}','manage_shop_costs',false);update public.role_permissions set allowed=false where role='administrator' and permission_key='export_repair_reports'`);
 await db.exec(install);await db.exec(install);
 await db.exec(`set request.jwt.claim.sub='${admin}';set role authenticated`);
 const result=(await db.query("select public.repair_api('list') as r")).rows[0].r;assert.equal(result.jobs.length,1);assert.equal(result.jobs[0].id,saved.id);
 access=await db.query('select * from public.get_effective_permissions()');assert.ok(!access.rows.some(r=>r.permission_key==='manage_shop_costs'));assert.ok(!access.rows.some(r=>r.permission_key==='export_repair_reports'));
 await db.exec('reset role');const seq=(await db.query('select last_value from repair_private.estimate_no')).rows[0].last_value;assert.equal(Number(seq),1);
 console.log('PASS installer',mode,'+ repeated runs preserve jobs, sequences and permission denials');await db.close();
}
const empty=new PGlite();await assert.rejects(empty.exec(install),/security setup is incomplete/);await empty.exec('rollback');assert.equal((await empty.query("select to_regnamespace('repair_private') as s")).rows[0].s,null);await empty.close();console.log('PASS absent prerequisites fail without partial installation');
assert.equal(await read('../public/setup/ENABLE_AUTOMART.sql'),install);
