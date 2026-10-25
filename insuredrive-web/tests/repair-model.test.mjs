import test from 'node:test';
import assert from 'node:assert/strict';
import {previewRepair,documentGroups} from '../src/lib/repair-model.ts';
const line=(overrides={})=>({id:'test',category:'Repair Items',description:'Test',quantity:1,unit:'item',unit_minor:100,discount_minor:0,tax_bps:0,...overrides});
test('repair preview uses per-line half-up cents, separate tax and pending values',()=>{assert.deepEqual(previewRepair([line({quantity:0.5,unit_minor:101,tax_bps:1000}),line({unit_minor:null}),line({unit_minor:null,excluded:true})]),{net_minor:51,tax_minor:5,total_minor:56,pending:1});assert.throws(()=>previewRepair([line({discount_minor:101})]));});
test('large documents preserve all rows and bound page density',()=>{const lines=Array.from({length:80},(_,i)=>line({id:String(i),description:'Long repair description '.repeat(12),notes:'Customer note '.repeat(20)}));const pages=documentGroups(lines);assert.ok(pages.length>1);assert.deepEqual(pages.flat(),lines);assert.ok(pages.every(p=>p.length<=8));});
