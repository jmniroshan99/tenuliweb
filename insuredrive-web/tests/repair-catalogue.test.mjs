import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILT_IN_CATALOGUE,catalogueSuggestions,searchCatalogue,catalogueSelection,normalizeCatalogueText} from '../src/lib/repair-catalogue.ts';
import {categories,previewRepair} from '../src/lib/repair-model.ts';
test('600 active entries: 100 distinct per section, stable IDs and no prices',()=>{
 assert.equal(BUILT_IN_CATALOGUE.length,600);assert.equal(new Set(BUILT_IN_CATALOGUE.map(x=>x.id)).size,600);
 assert.equal(new Set(BUILT_IN_CATALOGUE.map(x=>normalizeCatalogueText(x.description))).size,600);
 for(const category of categories){const entries=BUILT_IN_CATALOGUE.filter(x=>x.category===category&&x.active);assert.equal(entries.length,100);assert.equal(catalogueSuggestions(category).length,100);assert.ok(entries.every(e=>e.description.length<=300&&e.aliases.length>0&&e.unit));}
 for(const entry of BUILT_IN_CATALOGUE){assert.doesNotMatch(entry.description,/^(item|service|part|option)\s*\d|\b(LHS|RHS)\b/i);assert.equal(Object.keys(entry).some(k=>/price|minor|amount|discount/.test(k)),false);}
});
test('section-specific aliases, AC abbreviation and Sinhala search work',()=>{
 const parts=catalogueSuggestions(categories[0]);assert.equal(searchCatalogue(parts,'head light')[0].description,'Headlamp assembly');
 const ac=searchCatalogue(parts,'AC');assert.ok(ac.some(e=>e.description==='Air-conditioning compressor'));assert.ok(!ac.some(e=>/Accessory|actuator/i.test(e.description)));
 assert.equal(searchCatalogue(parts,'බම්පර්')[0].description,'Bumper cover');assert.equal(searchCatalogue(parts,'not-a-real-part-999').length,0);
 for(const category of categories)assert.ok(catalogueSuggestions(category).every(e=>e.category===category));
});
test('authorized descriptions merge without metadata, duplicates or mutation; real use ranks first',()=>{
 const jobs=[{info:{customer_name:'PRIVATE NAME',registration:'PRIVATE REG'},lines:[{category:categories[0],description:' head light ',unit:'item',unit_minor:99999,internal_note:'PRIVATE NOTE'},{category:categories[0],description:'Headlamp assembly',unit:'item'},{category:categories[0],description:'Custom mounting bracket',unit:'item'}]},{lines:[{category:categories[0],description:'HEADLAMP ASSEMBLY',unit:'item'}]}];
 const original=structuredClone(jobs);const shared=[{id:'shared',category:categories[0],description:'CUSTOM mounting bracket',aliases:[],unit:'item',active:true},{id:'hidden',category:categories[0],description:'Hidden catalogue entry',aliases:[],unit:'item',active:false}];
 const entries=catalogueSuggestions(categories[0],jobs,shared);assert.equal(entries.length,101);assert.equal(entries[0].description,'Headlamp assembly');assert.equal(entries[0].uses,2);assert.equal(entries.filter(e=>normalizeCatalogueText(e.description)==='custom mounting bracket').length,1);
 assert.doesNotMatch(JSON.stringify(entries),/PRIVATE|99999|unit_minor|internal_note|Hidden catalogue/);assert.deepEqual(jobs,original);assert.equal(catalogueSuggestions(categories[0]).length,100);
});
test('selection changes description only; pending prices, discounts and allocations stay intact',()=>{
 const base={id:'row',category:categories[0],description:'Old description',unit:'item',quantity:2,unit_minor:10000,discount_minor:1000,tax_bps:0,position:'LHS',excluded:false};const suggestion=catalogueSuggestions(categories[0])[0];
 assert.deepEqual(previewRepair([{...base,...catalogueSelection(suggestion)}]),previewRepair([base]));
 assert.equal(previewRepair([{...base,unit_minor:null,...catalogueSelection(suggestion)}]).pending,1);
 const allocated={...base,agreed_minor:51,price_review_id:'accepted'};assert.deepEqual(previewRepair([{...allocated,...catalogueSelection(suggestion)}]),previewRepair([allocated]));assert.deepEqual(Object.keys(catalogueSelection(suggestion)),['description']);
});
