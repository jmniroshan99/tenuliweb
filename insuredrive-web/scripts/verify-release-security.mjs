import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = new URL('../dist/', import.meta.url);
async function walk(url) {
  const result=[];
  for(const f of await readdir(url,{withFileTypes:true})) {
    const child=new URL(f.name+(f.isDirectory()?'/':''),url);
    result.push(...(f.isDirectory()?await walk(child):[child]));
  }
  return result;
}
for (const f of await walk(root)) {
  assert.doesNotMatch(f.pathname, /(?:pglite|postgres|\.wasm$|\/tests\/|\/fixtures\/|\.map$)/i);
  if(!/\.(?:js|html)$/.test(f.pathname))continue;
  const s=await readFile(f,'utf8');
  assert.doesNotMatch(s,/Open synthetic demo|Demo Administrator|startDemo|Separate browser-memory database|src\/demo/);
  assert.doesNotMatch(s,/sb_secret_[A-Za-z0-9_-]{12,}/);
  for (const jwt of s.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
    let claims;try {claims=JSON.parse(Buffer.from(jwt[0].split('.')[1],'base64url').toString());}catch{continue;}
    assert.notEqual(claims.role,'service_role','Privileged JWT found in release');
  }
}
const headers=await readFile(new URL('_headers',root),'utf8'),html=await readFile(new URL('index.html',root),'utf8');
assert.match(headers,/frame-ancestors 'none'/);assert.match(headers,/X-Content-Type-Options: nosniff/);
assert.match(headers,/script-src 'self';/);assert.doesNotMatch(headers,/unsafe-eval/);
assert.match(html,/http-equiv="Content-Security-Policy"/);
console.log('PASS release: no demo access, test database, WebAssembly, source maps or privileged keys; CSP and security headers present.');
