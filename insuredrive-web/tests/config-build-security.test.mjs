import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
test('Vite fails before bundling secret public configuration without logging key values',()=>{
  const secret='sb_secret_test_only_do_not_ship_this';
  for(const env of [
    {VITE_SUPABASE_PUBLISHABLE_KEY:secret},
    {VITE_SERVICE_ROLE_KEY:secret},
    {VITE_SUPABASE_URL:'http://unsafe.example'},
  ]) {
    const run=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{
      cwd,encoding:'utf8',env:{...process.env,...env},timeout:30000,
    });
    assert.equal(run.status,1);assert.doesNotMatch(run.stdout+run.stderr,new RegExp(secret));
    assert.match(run.stdout+run.stderr,/public|publishable|HTTPS|privileged/i);
  }
});
