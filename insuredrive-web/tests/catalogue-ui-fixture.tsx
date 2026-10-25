// Isolated UI verification. No real backend/customer data; excluded from production.
import {useState} from 'react';import{createRoot}from'react-dom/client';
import GroupedRepairEditor from '../src/features/GroupedRepairEditor';import{categories,type RepairLine}from'../src/lib/repair-model';import '../src/style.css';
function Fixture(){
 const[language,setLanguage]=useState('en'),[saved,setSaved]=useState<RepairLine[]|null>(null),[lines,setLines]=useState<RepairLine[]>([{id:'test-row',category:categories[0],description:'',quantity:1,unit:'item',unit_minor:null,discount_minor:0,tax_bps:0}]);
 const[canManage,setManage]=useState(false),[shared,setShared]=useState<any[]>([]);
 const mobile=new URLSearchParams(location.search).get('mobile')==='1';
 return <main style={{maxWidth:mobile?390:1040,margin:'auto',padding:mobile?10:24}}><h1>Catalogue verification</h1><p>Synthetic only — 600 built-in suggestions, no job history.</p>
 <button onClick={()=>setLanguage(l=>l==='en'?'si':'en')}>English / සිංහල</button>{' '}<button onClick={()=>setManage(v=>!v)}>Toggle catalogue administrator</button>
 <form onSubmit={e=>{e.preventDefault();setSaved(structuredClone(lines));}}>
 <GroupedRepairEditor lines={lines} setLines={setLines} jobs={[]} language={language} sharedCatalogue={shared} saveSharedItem={canManage?async line=>setShared(s=>[...s,{id:'custom-'+s.length,description:line.description,category:line.category,unit:line.unit,aliases:[],active:true}]):undefined}/>
 <button type="submit">Save fixture</button>{' '}{saved&&<button type="button" onClick={()=>setLines(structuredClone(saved))}>Reopen saved fixture</button>}</form><pre aria-label="Saved fixture">{saved?JSON.stringify(saved,null,2):'Not saved'}</pre></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
