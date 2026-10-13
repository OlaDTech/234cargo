import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const listeners={};const notifications=[];const opened=[]
const self={
 addEventListener:(name,handler)=>listeners[name]=handler,
 skipWaiting:()=>{},location:{origin:'https://234cargos.pages.dev'},
 registration:{showNotification:async(title,options)=>notifications.push({title,...options})},
 clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async url=>opened.push(url)},
}
vm.runInNewContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),{self,URL})
let pending
listeners.push({data:{json:()=>({title:'New message',body:'Open 234Cargo',tag:'test',url:'https://attacker.test'})},waitUntil:p=>pending=p})
await pending
assert.equal(notifications[0].tag,'test')
assert.equal(notifications[0].data.url,'/')
listeners.push({data:{json:()=>{throw new Error('Invalid JSON')}},waitUntil:p=>pending=p})
await pending
assert.equal(notifications[1].title,'234Cargo')
listeners.notificationclick({notification:{close:()=>{}},waitUntil:p=>pending=p})
await pending
assert.deepEqual(opened,['/'])
assert.equal(listeners.fetch,undefined,'Service worker must not cache private requests')
const updates=[]
self.clients.matchAll=async()=>[{postMessage:value=>updates.push(value.type)}]
listeners.push({data:{json:()=>({title:'New message'})},waitUntil:p=>pending=p})
await pending
assert.deepEqual(updates,['234cargo-update'],'Push must refresh the open conversation')
console.log('Service worker notification, fallback, safe click target and no-cache checks passed')
