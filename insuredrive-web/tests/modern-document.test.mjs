import test from 'node:test';import assert from 'node:assert/strict';import {paginateMeasured,textChunks} from '../src/lib/modern-document.ts';
test('measured A4 pagination repeats section/table header budget and keeps atomic summaries together',()=>{
 const blocks=[{height:80},{height:120,group:'Repair',start:50},{height:120,group:'Repair',start:50},{height:120,group:'Repair',start:50},{height:260}];
 assert.deepEqual(paginateMeasured(blocks,410,550),[[0,1,2],[3,4]]);
 assert.deepEqual(paginateMeasured([{height:100},{height:420}],450,550),[[0],[1]]);
 assert.throws(()=>paginateMeasured([{height:900}],700,850),/too tall/);
});
test('long text splits without losing whitespace, paragraphs or Sinhala graphemes',()=>{
 for(const text of ['Work and parts.\n\nInspect brakes. '.repeat(120),'වාහනය පරීක්ෂා කර අමතර කොටස් මාරු කරන ලදී.\n'.repeat(120),'A'.repeat(1000)]){
  const chunks=textChunks(text);assert.ok(chunks.length>1);assert.equal(chunks.join(''),text);
  const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});assert.ok(chunks.every(s=>[...segmenter.segment(s)].length<=480));
 }
});

test('oversized item fragments keep original text and money only on the first visual row',async()=>{
 const {itemFragments}=await import('../src/lib/modern-document.ts');const source={id:'x',description:'W'.repeat(300),notes:'N'.repeat(500),row_number:3,net_minor:2000000};const parts=itemFragments(source);assert.ok(parts.length>1);assert.equal(parts.map(p=>p.description).join(''),source.description);assert.equal(parts.map(p=>p.notes).join(''),source.notes);assert.equal(parts[0]._continuation,false);assert.ok(parts.slice(1).every(p=>p._continuation));
});
