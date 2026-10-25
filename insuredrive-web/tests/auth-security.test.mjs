import test from 'node:test';
import assert from 'node:assert/strict';
import { publicAuthConfig } from '../src/lib/auth-config.ts';
import { createSessionStorage, authStorageKey } from '../src/lib/session-storage.ts';
const jwt=role=>`${btoa('{}')}.${btoa(JSON.stringify({role}))}.synthetic`;
test('public auth configuration accepts publishable/anon and rejects privileged or malformed keys',()=>{
  for(const key of ['sb_publishable_synthetic',jwt('anon')])assert.equal(publicAuthConfig('https://test.supabase.co',key).valid,true);
  for(const key of ['sb_secret_synthetic',jwt('service_role'),jwt('authenticated'),'broken'])assert.equal(publicAuthConfig('https://test.supabase.co',key).valid,false);
  assert.equal(publicAuthConfig().valid,false);
});
test('public config requires a secure origin except local loopback',()=>{
  const key='sb_publishable_synthetic';
  for(const url of ['http://workshop.example','https://user:password@example.com','https://example.com/path','https://example.com?token=bad','javascript:alert(1)'])assert.equal(publicAuthConfig(url,key).valid,false);
  for(const url of ['http://127.0.0.1:54321','http://localhost:54321','https://custom-auth.example'])assert.equal(publicAuthConfig(url,key).valid,true);
});
const storage=()=>{const map=new Map();return{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
test('session upgrade removes only this project persistent token and uses tab storage',()=>{
  const local=storage(),session=storage(),url='https://test.supabase.co',key=authStorageKey(url);
  globalThis.window={localStorage:local,sessionStorage:session};
  local.setItem(key,'old-token');local.setItem(key+'-user','old-user');local.setItem('insuredrive-language','si');local.setItem('other-app','keep');
  const adapter=createSessionStorage(url);assert.equal(local.getItem(key),null);assert.equal(local.getItem(key+'-user'),null);
  adapter.setItem(key,'new-token');assert.equal(local.getItem(key),null);assert.equal(session.getItem(key),'new-token');
  assert.equal(adapter.getItem(key),'new-token');session.removeItem(key);assert.equal(adapter.getItem(key),null,'external removal must not resurrect a memory token');
  assert.equal(local.getItem('insuredrive-language'),'si');assert.equal(local.getItem('other-app'),'keep');
  adapter.removeItem(key);delete globalThis.window;
});
test('blocked browser storage falls back to memory and logout clears it',()=>{
  const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}};
  globalThis.window={localStorage:blocked,sessionStorage:blocked};
  const adapter=createSessionStorage('https://test.supabase.co');adapter.setItem('key','test');assert.equal(adapter.getItem('key'),'test');adapter.removeItem('key');assert.equal(adapter.getItem('key'),null);delete globalThis.window;
});
