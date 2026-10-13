import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const db = new PGlite()
try {
  await db.exec(`create role anon; create role authenticated;
    create table push_deliveries(id integer);
    create table wakes(id integer);
    create function dispatch_pending_push() returns void language sql as $$insert into wakes values(1)$$;`)
  await db.exec(await readFile(new URL('../supabase/migrations/202610130001_immediate_push.sql', import.meta.url), 'utf8'))
  const count = async () => Number((await db.query('select count(*) from wakes')).rows[0].count)
  await db.exec('insert into push_deliveries select 1 where false')
  assert.equal(await count(), 0)
  await db.exec('begin; insert into push_deliveries values(1),(2); insert into push_deliveries values(3); commit;')
  assert.equal(await count(), 1, 'One wake per transaction')
  await db.exec('insert into push_deliveries values(4)')
  assert.equal(await count(), 2, 'Next transaction wakes independently')
  await db.exec('begin; insert into push_deliveries values(5); rollback;')
  assert.equal(await count(), 2, 'Rolled-back events do not dispatch')
  await db.exec(`create or replace function dispatch_pending_push() returns void language plpgsql as $$begin raise exception 'Network unavailable'; end$$;
    insert into push_deliveries values(6);`)
  assert.equal((await db.query('select * from push_deliveries where id=6')).rows.length, 1, 'Failed wake preserves business event for retry')
  console.log('Immediate push batching, rollback and recovery checks passed')
} finally { await db.close() }
