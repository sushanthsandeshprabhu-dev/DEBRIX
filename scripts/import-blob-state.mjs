import { get } from '@vercel/blob';
import { importSnapshot } from '../api/postgres-store.mjs';

const candidates=process.argv.slice(2);
if(!candidates.length) candidates.push(process.env.DEBRIX_LEGACY_STATE_PATH||'debrix/state.json','debrix-airwise/state.json');
if(!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('Set BLOB_READ_WRITE_TOKEN to read the existing private DEBRIX snapshot.');
  process.exitCode=1;
} else {
  let state;
  for(const pathname of candidates) {
    try {
      const blob=await get(pathname,{access:'private',useCache:false});
      if(!blob) continue;
      state=JSON.parse(await new Response(blob.stream).text());
      console.log('Read legacy DEBRIX snapshot:',pathname);
      break;
    } catch(error) {
      if(/suspended/i.test(String(error?.message||''))) {
        console.error('The source Vercel Blob store is suspended. Its data was not changed; restore Blob access before retrying this import.');
        process.exitCode=1;
        break;
      }
    }
  }
  if(state&&process.exitCode!==1) {
    const result=await importSnapshot(state);
    console.log('Imported or merged records into Postgres:',JSON.stringify(result));
    console.log('The original Blob snapshot was left unchanged.');
  } else if(process.exitCode!==1) {
    console.error('No legacy state snapshot found. Pass its exact Blob pathname as an argument.');
    process.exitCode=1;
  }
}
