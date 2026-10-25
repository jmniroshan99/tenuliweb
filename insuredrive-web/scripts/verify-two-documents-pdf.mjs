import {fileURLToPath} from'node:url';import{spawn}from'node:child_process';import{mkdir}from'node:fs/promises';import assert from'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const cwd=fileURLToPath(new URL('../',import.meta.url)),out=process.env.TENULI_QA_DIR||fileURLToPath(new URL('../../tmp/two-doc-pdf/',import.meta.url));
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4190'],{cwd,stdio:['ignore','pipe','pipe']});let browser;
try{
 await new Promise((resolve,reject)=>{server.stdout.on('data',b=>{if(String(b).includes('4190'))resolve()});server.on('exit',reject)});await mkdir(out,{recursive:true});
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:JSON.parse(process.env.CHROMIUM_ARGS_JSON||'[]')});
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const language of ['en','si'])for(const kind of ['receiving','invoice']){
  const name=`${kind}-${language}`;await page.goto(`http://127.0.0.1:4190/tests/two-documents-pdf-fixture.html?language=${language}&kind=${kind}`);await page.locator('.tenuli-paper').first().waitFor();await page.evaluate(()=>document.fonts.ready);
  const dimensions=await page.locator('.tenuli-paper').evaluateAll(es=>es.map(e=>({width:e.scrollWidth,height:e.scrollHeight})));
  assert.ok(dimensions.length>1);assert.ok(dimensions.every(d=>d.width===794&&d.height<=1124),`${name}: ${JSON.stringify(dimensions)}`);
  await page.locator('.tenuli-paper').first().screenshot({path:`${out}/${name}-first.png`});await page.locator('.tenuli-paper').last().screenshot({path:`${out}/${name}-last.png`});
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:language==='en'?'Download PDF':'PDF බාගන්න',exact:true}).click()]);await download.saveAs(`${out}/${name}.pdf`);
  await page.evaluate(()=>{const open=window.open.bind(window);window.open=(...args)=>{const win=open(...args);win.print=()=>{win.document.body.dataset.printCalled='true'};return win;};});
  const [popup]=await Promise.all([page.waitForEvent('popup'),page.getByRole('button',{name:language==='en'?'Print':'මුද්‍රණය',exact:true}).click()]);await popup.waitForFunction(()=>document.body.dataset.printCalled==='true');await popup.pdf({path:`${out}/${name}-print.pdf`,format:'A4',printBackground:true});await popup.close();
  console.log(`PASS ${name}: ${dimensions.length} A4 pages, no overflow, download and print`);
 }
 assert.deepEqual(errors,[]);
}finally{await browser?.close();server.kill('SIGTERM')}
