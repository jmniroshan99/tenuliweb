// Regenerate the reviewable catalogue and counts from the actual application data.
import {mkdir,writeFile} from 'node:fs/promises';
import {BUILT_IN_CATALOGUE,normalizeCatalogueText} from '../src/lib/repair-catalogue.ts';
import {categories} from '../src/lib/repair-model.ts';
const folder=new URL('../../docs/catalogue/',import.meta.url);
await mkdir(folder,{recursive:true});
const counts=categories.map(section=>({section,count:BUILT_IN_CATALOGUE.filter(e=>e.active&&e.category===section).length}));
if(counts.some(x=>x.count<100)||new Set(BUILT_IN_CATALOGUE.map(e=>e.id)).size!==BUILT_IN_CATALOGUE.length||new Set(BUILT_IN_CATALOGUE.map(e=>normalizeCatalogueText(e.description))).size!==BUILT_IN_CATALOGUE.length)throw Error('Catalogue count/uniqueness check failed');
await writeFile(new URL('Tenuli_Repair_Catalogue_600_Items.json',folder),JSON.stringify({version:'1.19.0',total:BUILT_IN_CATALOGUE.length,counts,entries:BUILT_IN_CATALOGUE},null,2)+'\n');
const text='# Tenuli repair catalogue v1.19.0\n\n600 built-in descriptions; no prices or automatic charges. Position variants, aliases and translations are not counted as separate entries.\n\n| Work section | Active entries |\n| --- | ---: |\n'+counts.map(c=>`| ${c.section} | ${c.count} |`).join('\n')+'\n\n'+categories.map(section=>'## '+section+'\n\n'+BUILT_IN_CATALOGUE.filter(e=>e.category===section).map((e,i)=>`${i+1}. ${e.description}`).join('\n')).join('\n\n')+'\n';
await writeFile(new URL('REPAIR_CATALOGUE_AND_COUNTS.md',folder),text);
console.log(JSON.stringify({total:BUILT_IN_CATALOGUE.length,counts},null,2));
