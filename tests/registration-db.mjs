// Disposable embedded PostgreSQL. Install @electric-sql/pglite without saving.
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const db=new PGlite()
try {
 await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema auth;
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
 create function public.get_my_role() returns text language sql as $$ select current_setting('test.role',true) $$;
 create table profiles(id uuid primary key);
 create table clients(id uuid primary key default gen_random_uuid(),full_name text,phone text unique,country text,state text,password_hash text,shipping_mark text unique,created_by uuid);
 insert into profiles values('00000000-0000-4000-8000-000000000001');
 select set_config('test.uid','00000000-0000-4000-8000-000000000001',false);
 select set_config('test.role','admin',false);
 `)
 await db.exec(await readFile(new URL('../supabase/migrations/202610120001_client_registration.sql',import.meta.url),'utf8'))
 const submit=phone=>db.query('select submit_client_registration($1,$2,$3,$4,$5)',['Test Customer',phone,'Nigeria','Lagos','$2b$12$testfixture'])
 await submit('+2348012345678');await submit('+2348012345678')
 assert.equal((await db.query('select * from client_registrations')).rows.length,1)
 assert.equal((await db.query('select * from clients')).rows.length,0,'Pending request must not create client')
 const id=(await db.query('select id from client_registrations')).rows[0].id
 await db.exec("select set_config('test.role','staff',false)")
 await assert.rejects(db.query('select review_client_registration($1,true)',[id]),/Only administrators/)
 await db.exec("select set_config('test.role','admin',false)")
 await db.query('select review_client_registration($1,true)',[id])
 const client=(await db.query('select * from clients')).rows[0]
 assert.equal(client.shipping_mark,'MY-R000001')
 assert.equal(client.phone,'+2348012345678')
 assert.equal((await db.query('select password_hash from client_registrations')).rows[0].password_hash,null)
 await assert.rejects(db.query('select review_client_registration($1,true)',[id]),/already been reviewed/)
 await submit('+2348012345678')
 assert.equal((await db.query('select * from client_registrations')).rows.length,1,'Existing customer cannot reapply')
 await submit('+2348099999999')
 const second=(await db.query("select id from client_registrations where status='pending'")).rows[0].id
 await db.query('select review_client_registration($1,false)',[second])
 assert.equal((await db.query('select * from clients')).rows.length,1,'Rejection must not create client')
 for(let i=0;i<6;i++) assert.equal((await db.query("select registration_allow_attempt('test-ip') as allowed")).rows[0].allowed,i<5)
 await db.exec('set role anon')
 await assert.rejects(db.query('select * from client_registrations'),/permission denied/)
 await assert.rejects(submit('+2348000000000'),/permission denied/)
 await db.exec('reset role; set role authenticated')
 await assert.rejects(db.query('select password_hash from client_registrations'),/permission denied/)
 await db.exec("select set_config('test.role','staff',false)")
 assert.equal((await db.query('select id from client_registrations')).rows.length,0,'Staff cannot read requests')
 console.log('Database migration, admin authorization, approval, rejection, duplicates, secret isolation and rate limits passed')
} finally {await db.close()}
