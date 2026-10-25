import test from 'node:test';
import assert from 'node:assert/strict';
import {decimalMinor,colomboISO,uuid,balanceFor,depositFor} from '../src/lib/format.ts';
test('minor units reject excessive decimal precision and negative money',()=>{assert.equal(decimalMinor('0.01'),1);assert.equal(decimalMinor('33000.00'),3300000);assert.throws(()=>decimalMinor('1.005'));assert.throws(()=>decimalMinor('-1'));assert.throws(()=>decimalMinor('900719925474099999'));});
test('Colombo wall time is interpreted independent of workstation timezone',()=>{assert.equal(colomboISO('2026-10-24T09:00'),'2026-10-24T03:30:00.000Z');});
test('request identifiers have RFC 4122 version/variant bits',()=>{const ids=Array.from({length:1000},()=>uuid());assert.equal(new Set(ids).size,1000);assert.ok(ids.every(x=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x)));});
test('advance and refundable deposit never double reduce invoice',()=>{const d={allocations:[{invoice_id:'i',amount_minor:1000000}],ledger:[{booking_id:'b',kind:'deposit',amount_minor:1500000}]};assert.equal(balanceFor({id:'i',total_minor:3300000},d),2300000);assert.equal(depositFor('b',d),1500000);});
