import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureState } from '../api/postgres-store.mjs';

test('hosted storage fails clearly when Neon is not configured',async()=>{
  const names=['POSTGRES_URL','DATABASE_URL','NEON_DATABASE_URL'];
  const previous=names.map(name=>process.env[name]);
  for(const name of names) delete process.env[name];
  try {
    await assert.rejects(
      ()=>ensureState(()=>({bookings:[],events:[],products:[],orders:[]}),state=>state),
      error=>error.status===503&&error.code==='DEBRIX_DATABASE_UNAVAILABLE'&&error.message.includes('Connect Neon')
    );
  } finally {
    names.forEach((name,index)=>{if(previous[index]===undefined)delete process.env[name];else process.env[name]=previous[index];});
  }
});
