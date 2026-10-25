import test from 'node:test';
import assert from 'node:assert/strict';
import {changeOwnPassword} from '../src/lib/password-flow.ts';
function fixture(opts={}) {
 const calls=[];let created=0,actors=0;
 const user={id:'admin',email:'admin@example.invalid'};
 const deps={actor:async()=>({...user,role:opts.role||'administrator',active:true,id:opts.changed && ++actors>1?'other':user.id}),createClient:()=>{
  const index=created++;
  return {auth:{
   signInWithPassword:async p=>{calls.push(['login',index,p]);if(opts.wrong && index===0)return{data:{},error:{code:'invalid_credentials'}};if(opts.verifyFail && index===1)return{data:{},error:{code:'over_request_rate_limit'}};return{data:{user,session:{}},error:null};},
   updateUser:async p=>{calls.push(['update',p]);return{data:{user},error:opts.weak?{code:'weak_password',message:'At least 12 characters required'}:null};},
   signOut:async p=>{calls.push(['logout',index,p]);return{error:null};},
  }};
 }};return{deps,calls};
}
test('current password proof precedes update; new login verified; temp sessions locally revoked',async()=>{const{deps,calls}=fixture();assert.deepEqual(await changeOwnPassword('old-test','new-test','new-test',deps),{verified:true});assert.equal(calls[0][0],'login');assert.deepEqual(calls[1],['update',{password:'new-test',current_password:'old-test'}]);assert.equal(calls[2][2].password,'new-test');assert.equal(calls.filter(c=>c[0]==='logout'&&c[2].scope==='local').length,2);});
test('mismatch and identical password never contact auth',async()=>{const{deps,calls}=fixture();await assert.rejects(changeOwnPassword('old','new','other',deps),{code:'mismatch'});await assert.rejects(changeOwnPassword('old','old','old',deps),{code:'same_password'});assert.equal(calls.length,0);});
test('wrong current password cannot update; cleanup still runs',async()=>{const{deps,calls}=fixture({wrong:true});await assert.rejects(changeOwnPassword('bad','new','new',deps),{code:'current_password'});assert.equal(calls.some(c=>c[0]==='update'),false);assert.equal(calls.at(-1)[0],'logout');});
test('provider password policy failure is surfaced without claiming success',async()=>{const{deps,calls}=fixture({weak:true});await assert.rejects(changeOwnPassword('old','weak','weak',deps),{code:'weak_password',message:'At least 12 characters required'});assert.equal(calls.filter(c=>c[0]==='login').length,1);});
test('post-update verification failure does not claim the password update failed',async()=>{const{deps}=fixture({verifyFail:true});assert.deepEqual(await changeOwnPassword('old','new','new',deps),{verified:false});});
test('nonadmin and changed identities cannot update another account',async()=>{for(const opts of [{role:'vehicle_owner'},{changed:true}]){const{deps,calls}=fixture(opts);await assert.rejects(changeOwnPassword('old','new','new',deps));assert.equal(calls.some(c=>c[0]==='update'),false);}});
