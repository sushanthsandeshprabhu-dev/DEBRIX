import postgres from 'postgres';

const MIGRATION_VERSION=1;
const LOCK_KEY=72402026;
let client;

function unavailable(message='Persistent DEBRIX database is unavailable.') {
  const error=new Error(message);
  error.status=503;
  error.code='DEBRIX_DATABASE_UNAVAILABLE';
  return error;
}

export function getDatabase() {
  const url=process.env.POSTGRES_URL||process.env.DATABASE_URL||process.env.NEON_DATABASE_URL;
  if(!url) throw unavailable('DEBRIX Postgres is not configured. Connect Neon and set POSTGRES_URL or DATABASE_URL.');
  if(!client) client=postgres(url,{max:1,prepare:false,idle_timeout:15,connect_timeout:10});
  return client;
}

export async function assertDatabaseReady(db=getDatabase()) {
  try {
    const rows=await db`SELECT version FROM debrix_schema_migrations WHERE version=${MIGRATION_VERSION}`;
    if(!rows.length) throw unavailable('DEBRIX Postgres migrations are missing. Run npm run db:migrate.');
  } catch(error) {
    if(error?.code==='DEBRIX_DATABASE_UNAVAILABLE') throw error;
    if(error?.code==='42P01') throw unavailable('DEBRIX Postgres migrations are missing. Run npm run db:migrate.');
    throw error;
  }
}

async function lock(tx) {
  await tx`SELECT pg_advisory_xact_lock(${LOCK_KEY})`;
}

function rowsToJson(rows) {
  return rows.map(row=>typeof row.payload==='string'?JSON.parse(row.payload):row.payload);
}

async function loadState(tx) {
  const bookings=await tx`SELECT payload FROM debrix_bookings ORDER BY created_at DESC`;
  const events=await tx`SELECT payload FROM debrix_events ORDER BY occurred_at ASC,id ASC`;
  const products=await tx`SELECT payload FROM debrix_products ORDER BY id ASC`;
  const orders=await tx`SELECT payload FROM debrix_orders ORDER BY created_at DESC`;
  const metadata=await tx`SELECT payload FROM debrix_metadata WHERE key='workflow'`;
  if(!bookings.length&&!events.length&&!products.length&&!orders.length&&!metadata.length) return null;
  const meta=metadata[0]?.payload||{};
  return {version:meta.version||3,updated_at:meta.updated_at||null,bookings:rowsToJson(bookings),events:rowsToJson(events),products:rowsToJson(products),orders:rowsToJson(orders)};
}

async function writeState(tx,state) {
  for(const row of state.bookings||[]) {
    await tx`INSERT INTO debrix_bookings(id,status,created_at,quantity_tonnes,access_token_hash,demo,payload)
      VALUES(${row.id},${row.status||'requested'},${row.created_at||new Date().toISOString()},${Number(row.quantity_tonnes)},${row.access_token_hash||null},${Boolean(row.demo)},${JSON.stringify(row)}::jsonb)
      ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,created_at=EXCLUDED.created_at,quantity_tonnes=EXCLUDED.quantity_tonnes,access_token_hash=EXCLUDED.access_token_hash,demo=EXCLUDED.demo,payload=EXCLUDED.payload`;
  }
  for(const row of state.products||[]) {
    const stock=Number(row.inventory_tonnes||0);
    await tx`INSERT INTO debrix_products(id,inventory_tonnes,available,demo,payload)
      VALUES(${row.id},${stock},${row.available!==false},${Boolean(row.demo)},${JSON.stringify(row)}::jsonb)
      ON CONFLICT(id) DO UPDATE SET inventory_tonnes=EXCLUDED.inventory_tonnes,available=EXCLUDED.available,demo=EXCLUDED.demo,payload=EXCLUDED.payload`;
  }
  for(const row of state.events||[]) {
    await tx`INSERT INTO debrix_events(id,booking_id,occurred_at,event_type,demo,payload)
      VALUES(${row.id},${row.booking_id},${row.at},${row.event_type||'updated'},${Boolean(row.demo)},${JSON.stringify(row)}::jsonb)
      ON CONFLICT(id) DO UPDATE SET booking_id=EXCLUDED.booking_id,occurred_at=EXCLUDED.occurred_at,event_type=EXCLUDED.event_type,demo=EXCLUDED.demo,payload=EXCLUDED.payload`;
  }
  for(const row of state.orders||[]) {
    await tx`INSERT INTO debrix_orders(id,product_id,status,created_at,quantity_tonnes,demo,payload)
      VALUES(${row.id},${row.product_id||null},${row.status||'requested'},${row.created_at||new Date().toISOString()},${Number(row.quantity_tonnes)},${Boolean(row.demo)},${JSON.stringify(row)}::jsonb)
      ON CONFLICT(id) DO UPDATE SET product_id=EXCLUDED.product_id,status=EXCLUDED.status,created_at=EXCLUDED.created_at,quantity_tonnes=EXCLUDED.quantity_tonnes,demo=EXCLUDED.demo,payload=EXCLUDED.payload`;
  }
  const metadata={version:state.version||3,updated_at:state.updated_at||new Date().toISOString()};
  await tx`INSERT INTO debrix_metadata(key,payload) VALUES('workflow',${JSON.stringify(metadata)}::jsonb)
    ON CONFLICT(key) DO UPDATE SET payload=EXCLUDED.payload`;
}

export async function readState(normalise) {
  const db=getDatabase();
  await assertDatabaseReady(db);
  return db.begin(async tx=>{
    await tx`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
    const state=await loadState(tx);
    return state?{state:normalise(state)}:null;
  });
}

export async function ensureState(seedState,normalise) {
  const db=getDatabase();
  await assertDatabaseReady(db);
  return db.begin(async tx=>{
    await lock(tx);
    let state=await loadState(tx);
    if(!state) {
      state=seedState();
      await writeState(tx,state);
    }
    return {state:normalise(state)};
  });
}

export async function mutate(change,seedState,normalise) {
  const db=getDatabase();
  await assertDatabaseReady(db);
  return db.begin(async tx=>{
    await lock(tx);
    const stored=await loadState(tx);
    const draft=structuredClone(normalise(stored||seedState()));
    const result=change(draft);
    draft.updated_at=new Date().toISOString();
    await writeState(tx,draft);
    return result;
  });
}

export async function insertEvidence({id,bookingId,name,contentType,bytes,addedAt}) {
  const db=getDatabase();
  await assertDatabaseReady(db);
  await db`INSERT INTO debrix_evidence(id,booking_id,file_name,content_type,size_bytes,added_at,file_bytes)
    VALUES(${id},${bookingId},${name},${contentType},${bytes.length},${addedAt},${bytes})`;
}

export async function readEvidence(bookingId,id) {
  const db=getDatabase();
  await assertDatabaseReady(db);
  const rows=await db`SELECT file_name,content_type,size_bytes,file_bytes FROM debrix_evidence WHERE id=${id} AND booking_id=${bookingId}`;
  if(!rows.length) return null;
  return {...rows[0],file_bytes:Buffer.from(rows[0].file_bytes)};
}

export async function deleteEvidence(bookingId,id) {
  const db=getDatabase();
  await assertDatabaseReady(db);
  await db`DELETE FROM debrix_evidence WHERE id=${id} AND booking_id=${bookingId}`;
}

export async function importSnapshot(incoming) {
  const db=getDatabase();
  await assertDatabaseReady(db);
  return db.begin(async tx=>{
    await lock(tx);
    const existing=await loadState(tx)||{version:3,updated_at:null,bookings:[],events:[],products:[],orders:[]};
    for(const key of ['bookings','events','products','orders']) {
      const byId=new Map((existing[key]||[]).map(item=>[item.id,item]));
      for(const item of incoming[key]||[]) {
        const current=byId.get(item.id);
        if(!current||(current.demo&&!item.demo)) byId.set(item.id,item);
      }
      existing[key]=[...byId.values()];
    }
    existing.version=3;
    existing.updated_at=new Date().toISOString();
    await writeState(tx,existing);
    return {bookings:existing.bookings.length,events:existing.events.length,products:existing.products.length,orders:existing.orders.length};
  });
}

export async function closeDatabase() {
  if(client) {
    const db=client;
    client=null;
    await db.end({timeout:5});
  }
}
