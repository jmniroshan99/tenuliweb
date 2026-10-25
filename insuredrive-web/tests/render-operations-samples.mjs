// Optional sample export: node tests/render-operations-samples.mjs <output-dir>
// Then render the two HTML files with WeasyPrint. Not needed by the application.
import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const out=resolve(process.argv[2]||'sample-export');
await mkdir(out,{recursive:true});
const fixtures=JSON.parse(await readFile('tests/fixtures/operations-documents.json','utf8'));
const css=(await readFile('src/operations-documents.css','utf8'))+'\n'+await readFile('src/letterhead.css','utf8');
const font=pathToFileURL(resolve('public/fonts/NotoSansSinhala.ttf')).href;
const server=await createServer({server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
try {
  const {default:Document,buildOperationsBlocks}=await server.ssrLoadModule('/src/features/OperationsCustomerDocument.tsx');
  for(const [kind,name] of [['receiving','Advance'],['paid','Final']]) {
    const doc=structuredClone(fixtures[kind]),s=doc.snapshot;
    s.sample_data=true;s.prepared_by='SAMPLE OPERATOR';
    doc.number=`SAMPLE-${name.toUpperCase()}-001`;
    s.info.customer_name='SAMPLE CUSTOMER';s.info.phone='0700000000';
    s.info.make_model='SAMPLE vehicle';delete s.info.claim_number;
    s.receiving_content={reported_problem:'Damage to the vehicle body.',requested_work:'Repair and paint damaged body panels.'};
    if(s.completion)s.completion.content={work_performed:'Recorded repairs completed.'};
    s.calculation.lines=s.calculation.lines.slice(0,4);
    s.calculation.lines[0].unit_minor=7000000;s.calculation.lines[0].net_minor=7000000;
    s.calculation.lines.forEach((l,i)=>l.description=['Front bumper replacement','Remove and refit body panels','Body panel repair','Prepare and paint repaired panels'][i]);
    const blocks=buildOperationsBlocks(doc,'en');
    const markup=renderToStaticMarkup(createElement(Document,{doc,language:'en',initialPages:[blocks.map((_,i)=>i)]}));
    const reset=`@page{size:A4;margin:0} @font-face{font-family:NotoSinhala;src:url('${font}')} *{box-sizing:border-box} html,body{margin:0;padding:0;background:white} .operations-measure{display:none!important} article.operations-paper:last-child{break-after:auto}`;
    await writeFile(resolve(out,`Tenuli_Sample_${name}_Bill_v1.18.html`),`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Tenuli ${name} bill — SAMPLE DATA</title><style>${css}\n${reset}</style></head><body>${markup}</body></html>`);
    console.log(`Rendered shared template: ${name}`);
  }
} finally {await server.close();}
