import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';import {mkdir} from 'node:fs/promises';import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),cwd=fileURLToPath(new URL('../',import.meta.url)),out=process.env.TENULI_QA_DIR||fileURLToPath(new URL('../../tmp/modern-pdf-qa/',import.meta.url));
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4194'],{cwd,stdio:['ignore','pipe','pipe']});let browser;
try{
 await new Promise((resolve,reject)=>{server.stdout.on('data',b=>{if(String(b).includes('4194'))resolve()});server.on('exit',reject)});await mkdir(out,{recursive:true});
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:JSON.parse(process.env.CHROMIUM_ARGS_JSON||'[]')});const page=await browser.newPage({viewport:{width:1440,height:1200}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const language of ['en','si'])for(const [kind,variant] of [['receiving','short'],['receiving','none'],['receiving','details'],['receiving','long'],['invoice','short'],['invoice','sections'],['invoice','long'],['invoice','large'],['invoice','maxrow'],['invoice','paid'],['invoice','refund'],['invoice','revision']]){
  const name=`${kind}-${variant}-${language}`;if(process.env.TENULI_PDF_CASE && name!==process.env.TENULI_PDF_CASE)continue;await page.goto(`http://127.0.0.1:4194/tests/modern-pdf-fixture.html?language=${language}&kind=${kind}&variant=${variant}`);
  await page.locator('[data-modern-ready="true"]').waitFor();
  const pages=page.locator('.tenuli-paper.modern-paper'),count=await pages.count();
  const geometry=await pages.evaluateAll(es=>es.map(el=>{const body=el.querySelector('.modern-page-body').getBoundingClientRect(),footer=el.querySelector('.modern-footer').getBoundingClientRect();return{width:el.scrollWidth,height:el.scrollHeight,bodyBottom:body.bottom,footerTop:footer.top}}));
  assert.ok(geometry.every(d=>d.width<=794&&d.height<=1123&&d.bodyBottom<=d.footerTop-7),`${name}: ${JSON.stringify(geometry)}`);
  assert.equal(await pages.locator('.modern-signatures').count(),1);assert.equal(await pages.locator('.modern-closing').count(),1);
  if((variant==='short'||variant==='none')&&count!==1){console.log('PAGINATION',await page.locator('.modern-measure').evaluate(el=>({header:el.querySelector('.measure-first').getBoundingClientRect().height,blocks:[...el.querySelectorAll('[data-measure-block]')].map(x=>({text:x.innerText.slice(0,70),height:x.getBoundingClientRect().height}))})));await pages.first().screenshot({path:`${out}/${name}-debug.png`});}if(variant==='short'||variant==='none')assert.equal(count,1,name+' should fit one A4');
  if(variant==='long')assert.ok(count>1);
  const text=(await pages.allTextContents()).join('');assert.ok(await pages.locator('.modern-items td:nth-child(n+3), .modern-items tfoot td').evaluateAll(es=>es.every(e=>e.scrollWidth<=e.clientWidth+1)),name+' numeric cell overflow');for(const forbidden of ['subject to approval','supplier','profit','Tax'])assert.equal(text.includes(forbidden),false);
  if(kind==='receiving'&&variant==='none')assert.ok(text.includes(language==='en'?'No advance received':'අත්තිකාරමක් ලැබී නැත'));
  if(kind==='invoice'){
   const nums=(await pages.locator('.modern-items tbody tr td:first-child').allTextContents()).filter(Boolean);assert.deepEqual(nums,Array.from({length:variant==='long'?32:variant==='sections'?4:2},(_,i)=>String(i+1)));
   assert.equal(await pages.locator('.modern-items tfoot').count(),variant==='short'||variant==='large'||variant==='maxrow'||variant==='paid'||variant==='refund'||variant==='revision'?2:4);
   if(variant==='short'){assert.ok(text.includes('20,000.00'));assert.ok(text.includes('15,000.00'))}
   if(variant==='paid')assert.ok(text.includes(language==='en'?'Paid':'ගෙවා ඇත'));
  }
  await pages.first().screenshot({path:`${out}/${name}-first.png`});if(count>1)await pages.last().screenshot({path:`${out}/${name}-last.png`});
  if(['short','none','long','large','maxrow','revision'].includes(variant)){
   const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:language==='en'?'Download PDF':'PDF බාගන්න',exact:true}).click()]);await download.saveAs(`${out}/${name}.pdf`);
   await page.evaluate(()=>{const open=window.open.bind(window);window.open=(...args)=>{const win=open(...args);win.print=()=>{win.document.body.dataset.printCalled='true'};return win}});
   const [popup]=await Promise.all([page.waitForEvent('popup'),page.getByRole('button',{name:language==='en'?'Print':'මුද්‍රණය',exact:true}).click()]);await popup.waitForFunction(()=>document.body.dataset.printCalled==='true');assert.equal(await popup.locator('.modern-measure').count(),0);assert.equal((await popup.locator('.modern-paper').allTextContents()).join(''),text);await popup.pdf({path:`${out}/${name}-print.pdf`,format:'A4',printBackground:true});await popup.close();
  }
  console.log('PASS',name,count,'A4 pages');
 }
 assert.deepEqual(errors,[]);
}finally{await browser?.close();server.kill('SIGTERM')}
