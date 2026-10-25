import test from 'node:test';import assert from 'node:assert/strict';import {notePages} from '../src/lib/service-document-model.ts';
test('long English and Sinhala notes retain every grapheme on bounded pages',()=>{
 const texts=['Long repair description including parts and checks. '.repeat(35),'වාහනයේ අලුත්වැඩියා නිම කර ඇත. '.repeat(60)];
 for(const text of texts){const pages=notePages([{label:'Work',text}]);assert.ok(pages.length>1);assert.equal(pages.flat().map(b=>b.text.replaceAll('\n','')).join(''),text);assert.ok(pages.every(p=>p.reduce((n,b)=>n+b.text.split('\n').length+2,0)<=20));
 const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});assert.deepEqual(pages.flat().flatMap(b=>b.text.split('\n').flatMap(line=>[...segmenter.segment(line)].map(s=>s.segment))),[...segmenter.segment(text)].map(s=>s.segment));}
});
test('blank optional fields are omitted and explicit paragraph breaks are retained',()=>{assert.deepEqual(notePages([{label:'Blank',text:''},{label:'Work',text:'Line one\n\nLine three'}]),[[{label:'Work',text:'Line one\n\nLine three'}]]);});

test('new customer documents wrap words and retain every grapheme across A4 pages',()=>{
 for(const text of ['Inspected the vehicle and replaced the required parts. '.repeat(60),'වාහනය පරීක්ෂා කර අමතර කොටස් මාරු කරන ලදී. '.repeat(60)]){
  const pages=notePages([{label:'Work',text}],14,true);
  assert.ok(pages.length>1);
  assert.equal(pages.flat().map(b=>b.text.replaceAll('\n','')).join(''),text);
  assert.ok(pages.every(p=>p.reduce((n,b)=>n+b.text.split('\n').length+2,0)<=14));
  assert.ok(pages.every(p=>p.length===1));
 }
});
