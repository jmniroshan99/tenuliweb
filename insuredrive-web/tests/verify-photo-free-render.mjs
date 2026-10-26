// Server-render checks only: these do not claim browser interaction coverage.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const server = await createServer({ configFile: false, plugins: [react()],
  server: { middlewareMode: true }, appType: 'custom' });
try {
  const { EstimateEditor } = await server.ssrLoadModule('/src/features/Repairs.tsx');
  const legacy = { id: 'test-job', version: 2, revision: 2,
    info: { customer_name: 'Synthetic customer', registration: 'TEST-1191', photo_draft_id: 'old-photo-reference' },
    lines: [{ id: 'line', category: 'Repair Items', description: 'විශේෂ අලුත්වැඩියාව', quantity: 2, unit: 'job', unit_minor: null, discount_minor: 0, tax_bps: 0 }] };
  for (const language of ['en', 'si']) {
    for (const [kind, job] of [['new', {}], ['legacy', legacy]]) {
      const html = renderToStaticMarkup(React.createElement(EstimateEditor, {
        job, language, catalogueScope: 'isolated-render-check', save: async () => {}, close: () => {},
      }));
      assert.doesNotMatch(html, /type="file"|Add Photos|Use camera|photo-drop|photo-grid|vehicle-photos|Local Photo Storage|Loading photo queue/i);
      assert.match(html, /<form/);
      assert.match(html, /role="combobox"/);
      assert.match(html, /M\/R/);
      assert.match(html, /name="customer_name"/);
      assert.match(html, /name="registration"/);
      if (language === 'si') assert.match(html, /පාරිභෝගික විස්තර/);
      if (kind === 'legacy') {
        assert.match(html, /විශේෂ අලුත්වැඩියාව/);
        assert.match(html, /name="reason"/);
      }
      console.log(`PASS estimate render: ${language}, ${kind}, no photo controls; catalogue, M/R, customer/vehicle and revision inputs intact`);
    }
  }
} finally { await server.close(); }
