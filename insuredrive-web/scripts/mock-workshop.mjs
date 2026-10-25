// Test runner only: intercept Supabase requests and execute SQL in Node PGlite.
// The production application has no demo import, switch, route or fake identity.
import assert from 'node:assert/strict';
import * as fixture from '../tests/fixtures/database/database.mjs';
export async function signInTestWorkshop(page, origin) {
  await fixture.init();
  const records = await fixture.legacy();
  const profile = records.profiles.find(p => p.role === 'administrator');
  const user = {id:profile.id, email:profile.email, aud:'authenticated', role:'authenticated',
    app_metadata:{provider:'email'}, user_metadata:{}, is_anonymous:false};
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:user.id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})}.testonly`;
  const mapping = { vehicles:'vehicles', profiles:'profiles', insurance_policies:'policies',
    vehicle_revenue_licences:'revenue',vehicle_emission_certificates:'emission',vehicle_fitness_certificates:'fitness',
    vehicle_latest_location:'locations',vehicle_trips:'trips',notification_history:'notifications',audit_logs:'audit'};
  await page.routeWebSocket('wss://**', ws => ws.close());
  await page.route('**/*', async route => {
    const req=route.request(),url=new URL(req.url());
    if(url.origin===origin || url.protocol==='blob:' || url.protocol==='data:')return route.continue();
    if(!url.hostname.endsWith('.supabase.co'))return route.abort();
    const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'x-supabase-api-version':'2024-01-01'},body:JSON.stringify(body)});
    if(url.pathname==='/auth/v1/token'){
      assert.equal(req.postDataJSON().password,'local-qa-only');
      return json({user,access_token:token,refresh_token:'qa-only-refresh',expires_in:3600,token_type:'bearer'});
    }
    if(url.pathname==='/auth/v1/user')return json(user);
    if(url.pathname==='/auth/v1/logout')return json({});
    if(url.pathname==='/rest/v1/rpc/get_effective_permissions')return json(await fixture.permissions());
    if(url.pathname.startsWith('/rest/v1/rpc/')){
      const p=req.postDataJSON(),name=url.pathname.split('/').at(-1);
      try {
        const fn=name==='repair_api'?fixture.repairRPC:name==='rental_api'?fixture.rpc:null;
        if(!fn)throw Error('Unexpected RPC in test');
        return json(await fn(p.p_action,p.p_payload,p.p_request_id));
      } catch(e){return json({code:e.code||'P0001',message:e.message},400);}
    }
    if(url.pathname==='/rest/v1/profiles' && req.headers().accept?.includes('vnd.pgrst.object'))return json(profile);
    if(url.pathname.startsWith('/rest/v1/'))return json(records[mapping[url.pathname.split('/').at(-1)]]||[]);
    return route.abort();
  });
  await page.goto(origin);
  assert.equal(await page.getByRole('button',{name:/Open synthetic demo/}).count(),0);
  await page.getByLabel('Email address',{exact:true}).fill(user.email);
  await page.getByLabel('Password',{exact:true}).fill('local-qa-only');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.locator('.app-layout').waitFor({timeout:60000});
}
export const closeTestWorkshop = () => fixture.close();
