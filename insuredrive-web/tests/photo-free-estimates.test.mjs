import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('photo-free estimates create, reopen and revise without altering legacy data or permission checks', async () => {
  const db = new PGlite();
  try {
    for (const file of ['platform', 'rental', 'repairs', 'simple-billing', 'service-documents', 'grouped-billing', 'two-documents', 'modern-pdfs', 'pricing-photos'])
      await db.exec(await readFile(new URL(`./fixtures/database/${file}.sql`, import.meta.url), 'utf8'));
    const as = async id => db.exec(`reset role; set request.jwt.claim.sub='${id}'; set role authenticated`);
    const rpc = async (action, payload = {}) => (await db.query(
      'select public.repair_api($1,$2::jsonb,$3::uuid) r',
      [action, JSON.stringify(payload), crypto.randomUUID()],
    )).rows[0].r;
    await as('00000000-0000-4000-8000-000000000001');
    const info = { customer_name: 'Photo-free regression', registration: 'TEST-NO-PHOTOS', expected_customer_minor: 0, expected_insurer_minor: 0 };
    const lines = [
      { id: 'priced', category: 'Replacement Items', description: 'Headlamp assembly', position: 'LHS', quantity: 2, unit: 'item', unit_minor: 10000, discount_minor: 1000, tax_bps: 0 },
      { id: 'custom', category: 'Repair Items', description: 'විශේෂ අලුත්වැඩියාව', quantity: 1, unit: 'job', unit_minor: null, discount_minor: 0, tax_bps: 0 },
    ];
    const first = await rpc('save', { info, lines });
    const second = await rpc('save', { info: { ...info, registration: 'TEST-NO-PHOTOS-2' }, lines });
    assert.notEqual(first.id, second.id);
    assert.equal(first.info.photo_draft_id || '', '');
    let reopened = (await rpc('list')).jobs.find(job => job.id === first.id);
    assert.deepEqual(reopened.lines, first.lines);
    const edited = await rpc('save', { job_id: first.id, version: reopened.version, reason: 'Authorized description revision', info: { ...reopened.info, reported_problem: 'Updated without a photo queue' }, lines: reopened.lines });
    assert.ok(edited.version > reopened.version);
    reopened = (await rpc('list')).jobs.find(job => job.id === first.id);
    assert.equal(reopened.info.reported_problem, 'Updated without a photo queue');
    assert.deepEqual(reopened.lines, first.lines);
    assert.equal(reopened.info.photo_draft_id || '', '');
    const marker = crypto.randomUUID();
    const legacy = await rpc('save', { info: { ...info, photo_draft_id: marker }, lines });
    const retained = await rpc('save', { job_id: legacy.id, version: legacy.version, reason: 'Preserve old photo metadata', info: legacy.info, lines: legacy.lines });
    assert.equal(retained.info.photo_draft_id, marker);
    await as('00000000-0000-4000-8000-000000000002');
    await assert.rejects(rpc('save', { job_id: first.id, version: edited.version, reason: 'Unauthorized revision', info, lines }), /permission|denied|required/i);
  } finally { await db.close(); }
});
