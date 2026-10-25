import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB,IDBObjectStore} from 'fake-indexeddb';
import {activatePhotoAccount,readPhoto,saveQueue,loadQueues,bindQueue,savePhotos,safeSegment,jobPhotoPath,buildPhotoZIP,supportsDirectoryAccess,checksum,recoverLocalGallery,disconnectDestination,destination} from '../src/lib/local-photos.ts';
globalThis.indexedDB=indexedDB;
const png=(name='../CON?.png',body='original pixels')=>new File([new Uint8Array([137,80,78,71,13,10,26,10]),body],name,{type:'image/png'});
function mockDisk(){
 const control={permission:'granted',fail:'',beforeClose:null,writes:[],files:new Map(),dirs:new Set([''])};
 function dir(path=''){return {async *entries(){const prefix=path?path+'/':'';for(const p of control.dirs){const tail=p.slice(prefix.length);if(p.startsWith(prefix)&&tail&&!tail.includes('/'))yield [tail,{kind:'directory'}];}for(const p of control.files.keys()){const tail=p.slice(prefix.length);if(p.startsWith(prefix)&&tail&&!tail.includes('/'))yield [tail,{kind:'file'}];}},name:path.split('/').at(-1)||'Chosen folder',queryPermission:async()=>control.permission,requestPermission:async()=>control.permission,
  async getDirectoryHandle(name,{create=false}={}){const p=path?path+'/'+name:name;if(!control.dirs.has(p)&&!create)throw new DOMException('Missing','NotFoundError');control.dirs.add(p);return dir(p)},
  async getFileHandle(name,{create=false}={}){const key=path+'/'+name;if(!control.files.has(key)){if(!create)throw new DOMException('Missing','NotFoundError');control.files.set(key,new Blob())}
   return {getFile:async()=>new File([control.files.get(key)],name),createWritable:async()=>{let staged;return{write:async b=>{if(control.fail&&key.includes(control.fail))throw new DOMException('Disk full','QuotaExceededError');staged=b;if(control.beforeClose)control.beforeClose()},close:async()=>{control.files.set(key,new Blob([staged]));control.writes.push(key)},abort:async()=>{}}}}},
  async removeEntry(name){control.files.delete(path+'/'+name)}
 }}return{control,target:{id:crypto.randomUUID(),handle:dir()}};
}
async function queue(scope='staff-a'){activatePhotoAccount(scope);const q={id:crypto.randomUUID(),scope,createdAt:new Date().toISOString(),photos:[await readPhoto(png('front.png','first')),await readPhoto(png('rear.png','second'))]};q.photos[0].label='Front';q.photos[0].caption='Bumper damage';await saveQueue(q);await bindQueue(q,{id:'12345678-1234-4000-8000-123456789abc',created_at:'2026-01-31T19:00:00Z',number:'EST-1',info:{registration:'CON?/ABC.'}});return q}
test('Windows names, reserved words, stable UUID and Colombo grouping',()=>{for(const bad of ['CON','nul.txt','LPT1','COM¹.txt','A/B:C?*','..','ABC. '])assert.doesNotMatch(safeSegment(bad),/[<>:"/\\|?*]|[. ]$/);assert.equal(safeSegment('CON.txt'),'_CON.txt');assert.match(jobPhotoPath({id:'stable-id',created_at:'2026-01-31T19:00:00Z',info:{registration:'A/B'}}),/2026\/02\/JOB-stable-id_A_B\/Photos$/)});
test('multiple originals, caption, ordering, stable folder revisions and duplicate retries',async()=>{
 const q=await queue(),{control,target}=mockDisk();await savePhotos(q,target);assert.equal(q.manifestDestination,target.id);assert.equal(q.saving,false);assert.equal(q.photos.every(p=>p.savedAt&&!p.error),true);
 const before=control.writes.filter(p=>p.endsWith('.png')).length,path=q.path;await savePhotos(q,target);assert.equal(control.writes.filter(p=>p.endsWith('.png')).length,before);
 for(const p of q.photos)assert.equal(await checksum(control.files.get(q.path+'/'+p.filename)),p.checksum);
 q.photos.reverse();q.photos[0].caption='Updated caption';await bindQueue(q,{id:q.jobId,created_at:'2027-03-01T00:00:00Z',number:'EST-1-R2',info:{registration:'CHANGED'}});assert.equal(q.path,path);await savePhotos(q,target);
 const manifest=JSON.parse(await control.files.get(q.path+'/manifest.json').text());assert.equal(manifest.estimate_reference,'EST-1-R2');assert.equal(manifest.photos[0].ordering,1);assert.equal(manifest.photos[0].caption,'Updated caption');assert.equal(control.writes.filter(p=>p.endsWith('.png')).length,before);
 const recovered=(await loadQueues(q.scope)).find(x=>x.id===q.id);assert.equal(recovered.photos.length,2);
});
test('failed writes preserve successful photos, identify failures and retry only missing bytes',async()=>{
 const q=await queue(),{control,target}=mockDisk();control.fail=q.photos[1].id;await assert.rejects(savePhotos(q,target),/attention/);assert.equal(q.photos[0].savedDestination,target.id);assert.match(q.photos[1].error,/Disk full/);assert.equal(q.manifestDestination,undefined);
 control.fail='';await savePhotos(q,target);assert.equal(q.manifestDestination,target.id);assert.equal(control.writes.filter(x=>x.endsWith('.png')).length,2);
});
test('permission revoked and destination failure do not claim success',async()=>{
 const q=await queue(),{control,target}=mockDisk();control.permission='denied';await assert.rejects(savePhotos(q,target),/permission/);assert.equal(control.writes.length,0);assert.equal(q.manifestDestination,undefined);assert.match(q.error,/permission/);
 control.permission='granted';control.fail='manifest.json';await assert.rejects(savePhotos(q,target),/Disk full/);assert.equal(q.manifestDestination,undefined);assert.equal(q.photos.filter(p=>p.savedAt).length,2);control.fail='';await savePhotos(q,target);assert.equal(control.writes.filter(x=>x.endsWith('.png')).length,2);
});
test('filename collision never overwrites another photo',async()=>{
 const q=await queue(),{control,target}=mockDisk();q.photos[0].filename='collision.png';control.files.set(q.path+'/collision.png',new Blob(['someone else']));await savePhotos(q,target);assert.equal(await control.files.get(q.path+'/collision.png').text(),'someone else');assert.notEqual(q.photos[0].filename,'collision.png');
});
test('restart recovers account-scoped blobs; another account cannot read or write queue',async()=>{
 const q=await queue('restart-account');activatePhotoAccount(null);activatePhotoAccount('staff-b');assert.equal((await loadQueues('staff-b')).length,0);await assert.rejects(loadQueues('restart-account'),/Account changed/);await assert.rejects(saveQueue(q),/Account changed/);
 activatePhotoAccount('restart-account');const restored=(await loadQueues('restart-account')).find(x=>x.id===q.id);assert.equal(await checksum(restored.photos[0].blob),q.photos[0].checksum);assert.equal(restored.path,q.path);
});
test('account switch aborts a pending write',async()=>{
 const q=await queue(),{control,target}=mockDisk();control.beforeClose=()=>activatePhotoAccount('different-account');await assert.rejects(savePhotos(q,target),/Account changed/);assert.equal(control.writes.length,0);
});
test('storage quota preserves in-memory queue and reports recovery not durable',async()=>{
 const q=await queue('quota-account'),put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('Quota','QuotaExceededError')};
 try{q.photos.push(await readPhoto(png('third.png','third')));assert.equal(await saveQueue(q),false);assert.equal(q.durable,false);assert.equal((await loadQueues(q.scope)).find(x=>x.id===q.id).photos.length,3)}finally{IDBObjectStore.prototype.put=put}
});
test('unsupported browsers get organized ZIP retaining exact original bytes and metadata',async()=>{
 assert.equal(supportsDirectoryAccess(),false);const q=await queue(),zip=new Uint8Array(await(await buildPhotoZIP(q)).arrayBuffer()),files=new Map();let offset=0;
 while(new DataView(zip.buffer,offset).getUint32(0,true)===0x04034b50){const v=new DataView(zip.buffer,offset),size=v.getUint32(18,true),n=v.getUint16(26,true),name=new TextDecoder().decode(zip.slice(offset+30,offset+30+n));files.set(name,zip.slice(offset+30+n,offset+30+n+size));offset+=30+n+size;}
 assert.equal(files.size,3);assert.ok([...files.keys()].every(p=>p.startsWith(q.path+'/')));assert.equal(await checksum(new Blob([[...files.values()][0]])),q.photos[0].checksum);const manifest=JSON.parse(new TextDecoder().decode(files.get(q.path+'/manifest.json')));assert.match(manifest.export,/extraction/);assert.equal(manifest.photos[0].original_filename,'front.png');assert.equal(q.manifestDestination,undefined);
});
test('validation rejects incorrect file types, empty and oversized files; missing originals block ZIP',async()=>{
 await assert.rejects(readPhoto(new File(['<svg/>'],'a.svg',{type:'image/svg+xml'})),/only valid/);await assert.rejects(readPhoto(new File([],'empty.jpg',{type:'image/jpeg'})),/nonempty/);await assert.rejects(readPhoto(new File([new Uint8Array(10*1024*1024+1)],'huge.png',{type:'image/png'})),/10 MB/);
 const q=await queue();delete q.photos[0].blob;await assert.rejects(buildPhotoZIP(q),/missing original/);
});

test('recover gallery from original folder even after registration changes; reject unsafe manifest paths',async()=>{
 const q=await queue('recover-user'),{control,target}=mockDisk();await savePhotos(q,target);activatePhotoAccount(null);activatePhotoAccount('recover-user');const job={id:q.jobId,created_at:'2027-03-01T00:00:00Z',number:'EST-R3',info:{registration:'NEW-REG'}};const recovered=await recoverLocalGallery('recover-user',job,target);assert.equal(recovered.path,q.path);assert.equal(recovered.photos.length,2);assert.equal(recovered.photos[0].checksum,q.photos[0].checksum);assert.equal(recovered.manifestDestination,target.id);
 const manifest=JSON.parse(await control.files.get(q.path+'/manifest.json').text());manifest.photos[0].saved_filename='../outside.png';control.files.set(q.path+'/manifest.json',new Blob([JSON.stringify(manifest)]));await assert.rejects(recoverLocalGallery('recover-user',job,target),/Unsafe/);
});

test('disconnect stops an in-flight write and forgets the destination for this tab',async()=>{const q=await queue('disconnect-user'),{control,target}=mockDisk();let stopped;control.beforeClose=()=>{stopped=disconnectDestination(q.scope)};await assert.rejects(savePhotos(q,target),/connection changed/);await stopped;assert.equal(control.writes.length,0);assert.equal(await destination(q.scope),undefined);});

test('another authorized account appends to the same job folder after registration changes without losing exported photos',async()=>{
 const first=await queue('shared-folder-a'),{control,target}=mockDisk();await savePhotos(first,target);activatePhotoAccount('shared-folder-b');const next={id:crypto.randomUUID(),scope:'shared-folder-b',photos:[await readPhoto(png('later.png','later'))],createdAt:new Date().toISOString()};await bindQueue(next,{id:first.jobId,created_at:'2026-01-31T19:00:00Z',number:'EST-R2',info:{registration:'CHANGED'}});assert.notEqual(next.path,first.path);await savePhotos(next,target);assert.equal(next.path,first.path);assert.equal(next.photos.length,3);assert.equal(control.writes.filter(x=>x.endsWith('.png')).length,3);assert.equal(JSON.parse(await control.files.get(first.path+'/manifest.json').text()).photos.length,3);assert.equal((await loadQueues('shared-folder-b')).some(q=>q.id===first.id),false);
});
test('explicit gallery removal updates the manifest without deleting exported files or resurrecting removed entries',async()=>{
 const q=await queue('removal-user'),{control,target}=mockDisk();await savePhotos(q,target);const names=q.photos.map(p=>p.filename);q.removedPhotoIds=q.photos.map(p=>p.id);q.photos=[];await savePhotos(q,target);assert.equal(JSON.parse(await control.files.get(q.path+'/manifest.json').text()).photos.length,0);assert.ok(names.every(name=>control.files.has(q.path+'/'+name)));await savePhotos(q,target);assert.equal(q.photos.length,0);
});
