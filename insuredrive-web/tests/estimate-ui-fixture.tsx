// Isolated synthetic UI fixture. Excluded from production routes and build.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EstimateEditor } from '../src/features/Repairs';
import type { Row } from '../src/lib/types';
import '../src/style.css';

const scope = 'isolated-ui-test-account';
const storageKey = 'tenuli-estimate-ui-fixture-v1191';
const sample: Row = {
  id: '12345678-1234-4000-8000-123456789abc', number: 'TEST-EST-117',
  version: 1, revision: 1, created_at: '2026-10-25T00:00:00Z',
  info: {
    customer_name: 'Synthetic customer', registration: 'TEST-117',
    reported_problem: 'Brake noise', requested_work: 'Inspect and repair',
    expected_customer_minor: 0, expected_insurer_minor: 0,
    photo_draft_id: 'legacy-photo-marker-preserved',
  },
  lines: [
    { id: 'a', category: 'Replacement Items', description: 'Front brake pads', position: 'Front', quantity: 1, unit: 'item', unit_minor: 10000, discount_minor: 0, tax_bps: 0 },
    { id: 'b', category: 'Repair Items', description: 'Brake inspection', quantity: 1, unit: 'job', unit_minor: null, discount_minor: 0, tax_bps: 0 },
  ],
};

function Fixture() {
  const [language, setLanguage] = useState('en');
  const [job, setJob] = useState<Row>(() => JSON.parse(localStorage.getItem(storageKey) || 'null') || structuredClone(sample));
  const [saved, setSaved] = useState(false);
  const [payload, setPayload] = useState<Row>();
  const [editorKey, setEditorKey] = useState(0);
  return <main style={{ maxWidth: 1100, margin: 'auto', padding: 20 }}>
    <h1>Tenuli Auto Care · UI test fixture</h1>
    <p>Synthetic records only. Persistence here is a fixture, not a live backend.</p>
    <button onClick={() => setLanguage(x => x === 'en' ? 'si' : 'en')}>English / සිංහල</button>
    <button onClick={() => {
      setJob({ info: {}, lines: [] }); setSaved(false); setPayload(undefined);
      setEditorKey(x => x + 1);
    }}>New fixture estimate</button>
    <button onClick={() => {
      setJob(structuredClone(sample)); setSaved(false); setPayload(undefined);
      setEditorKey(x => x + 1);
    }}>Open legacy fixture</button>
    {saved ? <>
      <p role="status">Estimate saved (fixture)</p>
      <button onClick={() => { setSaved(false); setEditorKey(x => x + 1); }}>Revise fixture</button>
    </> : <EstimateEditor key={editorKey} job={job} catalogueScope={scope}
      jobs={job.id ? [job] : []} language={language} close={() => {}}
      save={async p => {
        const next = { ...job, id: job.id || crypto.randomUUID(), version: (job.version || 0) + 1,
          revision: (job.revision || 0) + 1, info: p.info, lines: p.lines };
        localStorage.setItem(storageKey, JSON.stringify(next));
        setPayload(p); setJob(next); setSaved(true);
      }} />}
    <output data-testid="saved-payload" hidden>{JSON.stringify(payload || job)}</output>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
