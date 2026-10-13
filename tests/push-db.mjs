import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const db=new PGlite()
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',admin='00000000-0000-4000-8000-000000000003',staff='00000000-0000-4000-8000-000000000004'
try {
 await db.exec(`
 create role anon;create role authenticated;create role service_role;
 create table clients(id uuid primary key);
 create table profiles(id uuid primary key,role text);
 create table client_sessions(id uuid primary key,client_id uuid,expires_at timestamptz);
 create table goods(id uuid primary key,client_id uuid,status text,container_id uuid);
 create table containers(id uuid primary key,status text);
 create table messages(id uuid primary key,client_id uuid,sender text);
 create table receipts(id uuid primary key,client_id uuid);
 create table store_orders(id uuid primary key,client_id uuid);
 create table client_registrations(id uuid primary key);
 insert into clients values('${a}'),('${b}');
 insert into profiles values('${admin}','admin'),('${staff}','staff');
 insert into client_sessions values('${a}','${a}',now()+interval '1 day'),('${b}','${b}',now()+interval '1 day');
 `)
 await db.exec(await readFile(new URL('../supabase/migrations/202610120002_web_push.sql',import.meta.url),'utf8'))
 const save=(endpoint,client,staffId,session)=>db.query('select save_push_subscription($1,$2,$3,$4,$5,$6,now()+interval \'1 day\')',[endpoint,'testkey','testauth',client,staffId,session])
 await save('https://push.example/a',a,null,a)
 await save('https://push.example/b',b,null,b)
 await save('https://push.example/admin',null,admin,null)
 await assert.rejects(save('https://push.example/a',b,null,b),/another account/)
 await assert.rejects(save('https://push.example/staff',null,staff,null),/Invalid administrator/)
 await assert.rejects(save('https://push.example/wrong-session',a,null,b),/Invalid client session/)
 await db.query("insert into goods(id,client_id,status) values(gen_random_uuid(),$1,'received')",[a])
 let jobs=(await db.query('select d.*,s.client_id,s.staff_id from push_deliveries d join push_subscriptions s on d.subscription_id=s.id')).rows
 assert.equal(jobs.length,1);assert.equal(jobs[0].client_id,a)
 await db.query("update goods set status='received'")
 assert.equal((await db.query('select * from push_deliveries')).rows.length,1,'Same status must not notify')
 await db.query("update goods set status='in_transit'")
 assert.equal((await db.query('select * from push_deliveries')).rows.length,2)
 await db.query("insert into containers values($1,'loading')",[admin])
 await db.query('update goods set container_id=$1',[admin])
 await db.query("update containers set status='in_transit'")
 assert.equal((await db.query("select s.client_id from push_deliveries d join push_subscriptions s on d.subscription_id=s.id where title='Shipment update'")).rows[0].client_id,a)
 await db.query("insert into messages values(gen_random_uuid(),$1,'client')",[b])
 jobs=(await db.query("select s.staff_id from push_deliveries d join push_subscriptions s on d.subscription_id=s.id where title='New message'")).rows
 assert.deepEqual(jobs,[{staff_id:admin}])
 await db.query("insert into messages values(gen_random_uuid(),$1,'staff')",[b])
 assert.equal((await db.query("select s.client_id from push_deliveries d join push_subscriptions s on d.subscription_id=s.id where title='New message' and s.client_id is not null")).rows[0].client_id,b)
 const batch=(await db.query('select * from claim_push_deliveries()')).rows
 assert.equal(batch.length,5)
 assert.ok(batch.every(j=>j.attempts===1&&j.lease_token))
 assert.equal((await db.query('select * from claim_push_deliveries()')).rows.length,0,'Active leases cannot be claimed twice')
 await db.exec("update push_deliveries set available_at=now()-interval '1 minute',attempts=5")
 assert.equal((await db.query('select * from claim_push_deliveries()')).rows.length,0,'Exhausted retries stop')
 assert.equal((await db.query("select * from push_deliveries where status='failed'")).rows.length,5)
 await db.exec("update client_sessions set expires_at=now()-interval '1 day';update profiles set role='staff'")
 await db.query("insert into receipts values(gen_random_uuid(),$1)",[a])
 await db.exec('insert into client_registrations values(gen_random_uuid())')
 assert.equal((await db.query('select * from push_deliveries')).rows.length,5,'Expired sessions and former admins receive no new deliveries')
 await db.exec('set role authenticated')
 await assert.rejects(db.query('select * from push_subscriptions'),/permission denied/)
 await assert.rejects(db.query('select * from push_deliveries'),/permission denied/)
 await assert.rejects(db.query('select * from claim_push_deliveries()'),/permission denied/)
 await assert.rejects(save('https://push.example/forged',a,null,a),/permission denied/)
 console.log('Push ownership, triggers, expired sessions, role revocation, leases, retry limits and privileges passed')
}finally{await db.close()}
