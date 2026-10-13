import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const db=new PGlite()
try {
 await db.exec(`create role anon;create role authenticated;
 create schema auth;
 create function auth.uid() returns uuid language sql as $$select '00000000-0000-4000-8000-000000000001'::uuid$$;
 create function get_my_role() returns text language sql as $$select current_setting('test.role',true)$$;
 create table clients(id uuid primary key);
 create table client_sessions(id integer primary key,client_id uuid,expires_at timestamptz,last_seen_at timestamptz);
 insert into clients values('00000000-0000-4000-8000-000000000002');`)
 await db.exec(await readFile(new URL('../supabase/migrations/202610130002_client_presence.sql',import.meta.url),'utf8'))
 await db.exec(`set test.role='admin';set role authenticated`)
 assert.equal((await db.query('select * from admin_client_presence()')).rows.length,0)
 await assert.rejects(db.query('select * from client_presence'),/permission denied/)
 await db.exec(`reset role;insert into client_sessions values(1,'00000000-0000-4000-8000-000000000002',now()+interval '1 day',now())`)
 assert.equal((await db.query('select * from admin_client_presence()')).rows[0].is_online,true)
 await db.exec(`update client_sessions set last_seen_at=now()-interval '2 minutes'`)
 assert.equal((await db.query('select * from admin_client_presence()')).rows[0].is_online,false)
 await db.exec(`insert into client_sessions values(2,'00000000-0000-4000-8000-000000000002',now()+interval '1 day',now())`)
 assert.equal((await db.query('select * from admin_client_presence()')).rows[0].is_online,true,'Any active device counts')
 await db.exec(`update client_sessions set expires_at=now()-interval '1 second'`)
 assert.equal((await db.query('select * from admin_client_presence()')).rows[0].is_online,false,'Expired sessions are offline')
 await db.exec('delete from client_sessions')
 assert.ok((await db.query('select * from admin_client_presence()')).rows[0].last_seen_at,'Retain last seen after session cleanup')
 await db.exec(`set role authenticated;set test.role='staff'`)
 await assert.rejects(db.query('select * from admin_client_presence()'),/Administrator access required/)
 await db.exec(`set test.role='client'`)
 await assert.rejects(db.query('select * from admin_client_presence()'),/Administrator access required/)
 console.log('Presence timeout, multi-device, expiry, retention and admin-only access passed')
} finally {await db.close()}
