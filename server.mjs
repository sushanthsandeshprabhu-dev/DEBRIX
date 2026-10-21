import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const DATA_DIR = join(ROOT, 'data');
mkdirSync(DATA_DIR, { recursive: true });

function loadDotEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}
loadDotEnv();

const db = new DatabaseSync(join(DATA_DIR, 'debrix-airwise.sqlite'));
db.exec(`PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS bookings (
 id TEXT PRIMARY KEY, created_at TEXT NOT NULL, citizen_name TEXT NOT NULL, phone TEXT NOT NULL,
 address TEXT NOT NULL, locality TEXT NOT NULL, waste_type TEXT NOT NULL, quantity_tonnes REAL NOT NULL,
 preferred_date TEXT NOT NULL, status TEXT NOT NULL, operator_name TEXT, vehicle_id TEXT, pickup_at TEXT,
 received_tonnes REAL, facility_id TEXT, received_at TEXT, sort_notes TEXT, recycled_tonnes REAL,
 reused_tonnes REAL, residual_tonnes REAL, residual_destination TEXT, evidence_ref TEXT, verified_at TEXT,
 demo INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, booking_id TEXT NOT NULL REFERENCES bookings(id), at TEXT NOT NULL,
 actor_role TEXT NOT NULL, actor_name TEXT NOT NULL, event_type TEXT NOT NULL, note TEXT NOT NULL,
 evidence_ref TEXT, demo INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS air_observations (
 id INTEGER PRIMARY KEY AUTOINCREMENT, fetched_at TEXT NOT NULL, location_id INTEGER NOT NULL,
 location_name TEXT NOT NULL, locality TEXT, latitude REAL, longitude REAL, parameter TEXT NOT NULL,
 value REAL NOT NULL, unit TEXT, observed_at TEXT NOT NULL, source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_booking ON events(booking_id, at);
CREATE INDEX IF NOT EXISTS idx_air_latest ON air_observations(fetched_at);`);

const isoAgo = (hours) => new Date(Date.now() - hours * 3600000).toISOString();
function seed() {
  if (db.prepare('SELECT count(*) AS n FROM bookings').get().n) return;
  const records = [
    { id:'DBX-2048', created_at:isoAgo(24), citizen_name:'Ananya Rao', phone:'98••• 2104', address:'14th Cross, HSR Layout, Sector 2', locality:'HSR Layout', waste_type:'Concrete & brick', quantity_tonnes:1.8, preferred_date:new Date(Date.now()+86400000).toISOString().slice(0,10), status:'assigned', operator_name:'Kiran S.', vehicle_id:'KA 03 MN 4821', demo:1 },
    { id:'DBX-2047', created_at:isoAgo(48), citizen_name:'R. Menon', phone:'98••• 7302', address:'8th Main, Indiranagar', locality:'Indiranagar', waste_type:'Mixed C&D', quantity_tonnes:2.4, preferred_date:new Date(Date.now()-86400000).toISOString().slice(0,10), status:'in_transit', operator_name:'Meera P.', vehicle_id:'KA 05 AB 1186', pickup_at:isoAgo(3), demo:1 },
    { id:'DBX-2046', created_at:isoAgo(96), citizen_name:'S. Kumar', phone:'98••• 9190', address:'BTM 2nd Stage, Tavarekere Road', locality:'BTM Layout', waste_type:'Tiles & ceramics', quantity_tonnes:1.2, preferred_date:new Date(Date.now()-3*86400000).toISOString().slice(0,10), status:'processing', operator_name:'Ravi N.', vehicle_id:'KA 51 C 9042', pickup_at:isoAgo(52), received_tonnes:1.15, facility_id:'FAC-01', received_at:isoAgo(30), demo:1 }
  ];
  const insert = db.prepare(`INSERT INTO bookings (id,created_at,citizen_name,phone,address,locality,waste_type,quantity_tonnes,preferred_date,status,operator_name,vehicle_id,pickup_at,received_tonnes,facility_id,received_at,demo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of records) insert.run(r.id,r.created_at,r.citizen_name,r.phone,r.address,r.locality,r.waste_type,r.quantity_tonnes,r.preferred_date,r.status,r.operator_name??null,r.vehicle_id??null,r.pickup_at??null,r.received_tonnes??null,r.facility_id??null,r.received_at??null,r.demo);
  const ev = db.prepare('INSERT INTO events (booking_id,at,actor_role,actor_name,event_type,note,demo) VALUES (?,?,?,?,?,?,1)');
  ev.run('DBX-2048',isoAgo(24),'citizen','Ananya Rao','registered','Pickup request submitted; demo seed record.');
  ev.run('DBX-2048',isoAgo(22),'operator','Dispatch desk','assigned','Assigned vehicle KA 03 MN 4821; demo seed record.');
  ev.run('DBX-2047',isoAgo(48),'citizen','R. Menon','registered','Pickup request submitted; demo seed record.');
  ev.run('DBX-2047',isoAgo(40),'operator','Meera P.','picked_up','Load collected; demo seed record.');
  ev.run('DBX-2047',isoAgo(36),'operator','Meera P.','in_transit','En route to facility; demo seed record.');
  ev.run('DBX-2046',isoAgo(96),'citizen','S. Kumar','registered','Pickup request submitted; demo seed record.');
  ev.run('DBX-2046',isoAgo(70),'operator','Ravi N.','picked_up','Load collected; demo seed record.');
  ev.run('DBX-2046',isoAgo(60),'facility','GreenLoop Facility','received','Facility receipt recorded; demo seed record.');
  ev.run('DBX-2046',isoAgo(52),'facility','GreenLoop Facility','processing','Sorting started; demo seed record.');
}
seed();
function seedRecoveryDemo() {
  if (db.prepare('SELECT 1 FROM bookings WHERE id=?').get('DBX-2045')) return;
  const receivedAt=isoAgo(116),verifiedAt=isoAgo(92);
  db.prepare(`INSERT INTO bookings (id,created_at,citizen_name,phone,address,locality,waste_type,quantity_tonnes,preferred_date,status,operator_name,vehicle_id,pickup_at,received_tonnes,facility_id,received_at,sort_notes,recycled_tonnes,reused_tonnes,residual_tonnes,residual_destination,evidence_ref,verified_at,demo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`)
    .run('DBX-2045',isoAgo(144),'Ananya Rao','98••• 2104','6th Block, Koramangala','Koramangala','Concrete & brick',1.6,new Date(Date.now()-5*86400000).toISOString().slice(0,10),'recovered','Ravi N.','KA 03 MN 4821',isoAgo(130),1.55,'FAC-01',receivedAt,'Crushed aggregate and reusable masonry separated.',0.85,0.45,0.25,'Authorized inert waste facility · demo','DEMO-FAC-TICKET-2045',verifiedAt);
  const ev=db.prepare('INSERT INTO events (booking_id,at,actor_role,actor_name,event_type,note,evidence_ref,demo) VALUES (?,?,?,?,?,?,?,1)');
  ev.run('DBX-2045',isoAgo(144),'citizen','Ananya Rao','registered','Pickup request submitted; seeded demo record.',null);
  ev.run('DBX-2045',isoAgo(138),'operator','Ravi N.','assigned','Assigned vehicle KA 03 MN 4821; seeded demo record.',null);
  ev.run('DBX-2045',isoAgo(130),'operator','Ravi N.','picked_up','Load collected; seeded demo record.',null);
  ev.run('DBX-2045',isoAgo(126),'operator','Ravi N.','in_transit','En route to facility; seeded demo record.',null);
  ev.run('DBX-2045',receivedAt,'facility','GreenLoop Facility','received','Facility receipt: 1.55 tonnes at FAC-01; seeded demo record.','DEMO-FAC-TICKET-2045');
  ev.run('DBX-2045',verifiedAt,'facility','GreenLoop Facility','recovery_recorded','Material balance: 0.85 t recycled, 0.45 t reused, 0.25 t residual; seeded demo record.','DEMO-FAC-TICKET-2045');
}
seedRecoveryDemo();

const statuses = ['requested','assigned','picked_up','in_transit','received','processing','recovered','closed'];
const statusLabel = { requested:'Request received', assigned:'Vehicle assigned', picked_up:'Picked up', in_transit:'In transit', received:'Facility received', processing:'Processing', recovered:'Recovery recorded', closed:'Closed' };
const roleNames = { citizen:'Citizen', operator:'Operator', recycler:'Recycler', authority:'City operations' };
const wasteTypes = new Set(['Concrete & brick','Mixed C&D','Tiles & ceramics','Soil & rubble','Wood & metals','Other C&D']);
const canUseApi = (role, method, path) => {
  const read = ['GET /api/summary','GET /api/bookings'].includes(`${method} ${path}`);
  if (role==='citizen') return read || (method==='POST'&&path==='/api/bookings') || (method==='GET'&&path==='/api/air') || (method==='POST'&&path==='/api/air/refresh');
  if (role==='operator') return read || (method==='PATCH'&&/^\/api\/bookings\/[^/]+\/status$/.test(path));
  if (role==='recycler') return read || (method==='PATCH'&&/^\/api\/bookings\/[^/]+\/(receipt|processing)$/.test(path));
  if (role==='authority') return read || (method==='GET'&&path==='/api/air') || (method==='POST'&&path==='/api/air/refresh');
  return false;
};

function send(res, code, body, type='application/json; charset=utf-8') {
  res.writeHead(code, { 'content-type': type, 'cache-control':'no-store', 'x-content-type-options':'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}
async function bodyJson(req) {
  let raw=''; for await (const chunk of req) { raw += chunk; if (raw.length > 20000) throw new Error('Request body is too large.'); }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw new Error('Request body must be valid JSON.'); }
}
function audit(id, role, name, type, note, evidence=null) {
  db.prepare('INSERT INTO events (booking_id,at,actor_role,actor_name,event_type,note,evidence_ref,demo) VALUES (?,?,?,?,?,?,?,0)')
    .run(id,new Date().toISOString(),role,name,type,note,evidence);
}
function bookingDetails(row) {
  return { ...row, events:db.prepare('SELECT at,actor_role,actor_name,event_type,note,evidence_ref,demo FROM events WHERE booking_id=? ORDER BY at').all(row.id), status_label:statusLabel[row.status] || row.status };
}
function getBookings(citizenName=null) {
  const rows=db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all();
  return rows.filter(row=>!citizenName||row.citizen_name.toLowerCase()===citizenName.toLowerCase()).map(bookingDetails);
}

let airCache = { checkedAt:null, records:[], error:null };
async function refreshAir() {
  const apiKey=process.env.OPENAQ_API_KEY;
  if (!apiKey) { airCache={checkedAt:new Date().toISOString(),records:[],error:'OpenAQ API key is not configured.'}; return airCache; }
  try {
    const base='https://api.openaq.org/v3/locations';
    const coordinates=process.env.OPENAQ_COORDINATES || '12.9716,77.5946';
    const radius=Math.min(25000,Math.max(1,Number(process.env.OPENAQ_RADIUS_METERS || 25000)));
    const url=`${base}?coordinates=${encodeURIComponent(coordinates)}&radius=${radius}&limit=100`;
    const response=await fetch(url,{headers:{'X-API-Key':apiKey},signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error(`OpenAQ locations returned HTTP ${response.status}.`);
    const result=await response.json();
    const locations=(result.results || []).slice().sort((a,b)=>(a.distance??Infinity)-(b.distance??Infinity)).slice(0,12);
    const latest=await Promise.all(locations.map(async loc=>{
      try {
        const r=await fetch(`${base}/${loc.id}/latest?limit=100`,{headers:{'X-API-Key':apiKey},signal:AbortSignal.timeout(12000)});
        if(!r.ok) return [];
        const data=await r.json();
        const sensors=new Map((loc.sensors||[]).map(sensor=>[sensor.id,sensor.parameter]));
        return (data.results || []).map(x=>({reading:x,parameter:sensors.get(x.sensorsId)})).filter(x=>['pm25','pm10'].includes(x.parameter?.name)).map(({reading:x,parameter:p})=>({ location_id:loc.id, location_name:loc.name || `Station ${loc.id}`, locality:loc.locality || null, latitude:x.coordinates?.latitude ?? loc.coordinates?.latitude ?? null, longitude:x.coordinates?.longitude ?? loc.coordinates?.longitude ?? null, parameter:p.name, value:x.value, unit:p.units || null, observed_at:x.datetime?.utc || null, source:'OpenAQ v3 · upstream sensor measurement' }));
      } catch { return []; }
    }));
    const fetchedAt=new Date().toISOString();
    const records=latest.flat().filter(x=>x.observed_at && Number.isFinite(Number(x.value)));
    const insert=db.prepare('INSERT INTO air_observations (fetched_at,location_id,location_name,locality,latitude,longitude,parameter,value,unit,observed_at,source) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    const txn=db.exec.bind(db);
    db.exec('BEGIN');
    try { db.prepare('DELETE FROM air_observations').run(); for(const x of records) insert.run(fetchedAt,x.location_id,x.location_name,x.locality,x.latitude,x.longitude,x.parameter,x.value,x.unit,x.observed_at,x.source); db.exec('COMMIT'); }
    catch(e){db.exec('ROLLBACK');throw e;}
    airCache={checkedAt:fetchedAt,records,error:records.length?null:'OpenAQ returned no recent PM2.5 or PM10 measurements for nearby stations.'};
  } catch(e) { airCache={checkedAt:new Date().toISOString(),records:[],error:`Live source unavailable: ${e.message}`}; }
  return airCache;
}
setInterval(()=>{ if(process.env.OPENAQ_API_KEY) refreshAir(); }, 10*60*1000).unref();

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET' && url.pathname.startsWith('/assets/')) {
    const path=resolve(PUBLIC,url.pathname.slice(1)); if(!path.startsWith(PUBLIC)) return send(res,403,{error:'Forbidden'});
    try { const data=readFileSync(path); const types={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'}; return send(res,200,data,types[extname(path)]||'application/octet-stream'); } catch { return send(res,404,{error:'Not found'}); }
  }
  if(req.method==='GET' && url.pathname==='/') { try{return send(res,200,readFileSync(join(PUBLIC,'index.html'),'utf8'),'text/html; charset=utf-8');}catch{return send(res,500,{error:'App assets missing'});} }
  const role=req.headers['x-demo-role'];
  if(url.pathname.startsWith('/api/')) {
    if(!canUseApi(role,req.method,url.pathname)) return send(res,403,{error:'This action is unavailable for the selected demo role.'});
  }
  try {
    if(req.method==='GET' && url.pathname==='/api/summary') {
      const records=getBookings(role==='citizen'?String(req.headers['x-demo-user']||'Ananya Rao') : null);
      const rows=db.prepare('SELECT status,COUNT(*) count FROM bookings GROUP BY status').all();
      const counts=Object.fromEntries(rows.map(x=>[x.status,x.count]));
      const total=role==='citizen'?records.length:db.prepare('SELECT COUNT(*) n FROM bookings').get().n;
      const recovery=role==='citizen'?records.reduce((a,b)=>({recovered:a.recovered+Number(b.recycled_tonnes||0)+Number(b.reused_tonnes||0),residual:a.residual+Number(b.residual_tonnes||0)}),{recovered:0,residual:0}):db.prepare('SELECT COALESCE(SUM(recycled_tonnes+reused_tonnes),0) recovered,COALESCE(SUM(residual_tonnes),0) residual FROM bookings').get();
      return send(res,200,{generated_at:new Date().toISOString(),total,counts,recovered_tonnes:recovery.recovered,residual_tonnes:recovery.residual,bookings:records,air:airCache,workflow_statuses:statuses,seeded:records.some(b=>b.demo)|| (role!=='citizen'&&db.prepare('SELECT COUNT(*) n FROM bookings WHERE demo=1').get().n>0)});
    }
    if(req.method==='GET' && url.pathname==='/api/bookings') {
      const search=(url.searchParams.get('q')||'').trim();
      const records=search ? getBookings(role==='citizen'?String(req.headers['x-demo-user']||'Ananya Rao'):null).filter(b=>[b.id,b.locality,b.citizen_name,b.status].some(v=>String(v||'').toLowerCase().includes(search.toLowerCase()))) : getBookings(role==='citizen'?String(req.headers['x-demo-user']||'Ananya Rao'):null);
      return send(res,200,{items:records});
    }
    if(req.method==='POST' && url.pathname==='/api/bookings') {
      const d=await bodyJson(req);
      const required=['citizen_name','phone','address','locality','waste_type','preferred_date'];
      for(const k of required) if(typeof d[k]!=='string' || !d[k].trim()) return send(res,400,{error:`${k.replaceAll('_',' ')} is required.`});
      if(d.citizen_name.trim().length>100||d.address.trim().length>250||d.locality.trim().length>80) return send(res,400,{error:'Name, address, or locality exceeds its allowed length.'});
      const phoneDigits=d.phone.replace(/\D/g,'');
      if(!/^[+()\-\s\d]{8,20}$/.test(d.phone.trim())||phoneDigits.length<8||phoneDigits.length>15) return send(res,400,{error:'Enter a valid contact number with 8 to 15 digits.'});
      if(!wasteTypes.has(d.waste_type)) return send(res,400,{error:'Choose a supported C&D material type.'});
      const quantity=Number(d.quantity_tonnes);
      if(!Number.isFinite(quantity)||quantity<0.1||quantity>40) return send(res,400,{error:'Load size must be between 0.1 and 40 tonnes.'});
      if(!/^\d{4}-\d{2}-\d{2}$/.test(d.preferred_date)||Number.isNaN(Date.parse(d.preferred_date))) return send(res,400,{error:'Choose a valid pickup date.'});
      if(d.preferred_date<new Date().toISOString().slice(0,10)) return send(res,400,{error:'Pickup date cannot be in the past.'});
      const id=`DBX-${randomUUID().slice(0,8).toUpperCase()}`; const now=new Date().toISOString();
      db.prepare('INSERT INTO bookings (id,created_at,citizen_name,phone,address,locality,waste_type,quantity_tonnes,preferred_date,status,demo) VALUES (?,?,?,?,?,?,?,?,?,?,0)')
       .run(id,now,d.citizen_name.trim(),d.phone.trim(),d.address.trim(),d.locality.trim(),d.waste_type,quantity,d.preferred_date,'requested');
      const citizenName=String(req.headers['x-demo-user']||d.citizen_name).trim().slice(0,100);
      db.prepare('UPDATE bookings SET citizen_name=? WHERE id=?').run(citizenName,id);
      audit(id,role,citizenName,'registered',`Pickup request for ${quantity.toFixed(1)} tonnes of ${d.waste_type}.`);
      return send(res,201,{item:bookingDetails(db.prepare('SELECT * FROM bookings WHERE id=?').get(id))});
    }
    if(req.method==='PATCH' && url.pathname.startsWith('/api/bookings/') && url.pathname.endsWith('/status')) {
      if(role!=='operator') return send(res,403,{error:'Operator role required.'});
      const id=decodeURIComponent(url.pathname.split('/')[3]); const d=await bodyJson(req); const row=db.prepare('SELECT * FROM bookings WHERE id=?').get(id);
      if(!row)return send(res,404,{error:'Pickup not found.'});
      const next=d.status; const transitions={requested:['assigned'],assigned:['picked_up'],picked_up:['in_transit'],in_transit:['received']};
      if(!transitions[row.status]?.includes(next))return send(res,409,{error:`Cannot move ${row.status} to ${next}.`});
      const operator=String(d.operator_name||'Field operator').trim().slice(0,80); const vehicle=String(d.vehicle_id||'').trim().slice(0,30);
      if(next==='assigned'&&(!operator||!vehicle))return send(res,400,{error:'Operator name and vehicle ID are required for assignment.'});
      db.prepare(`UPDATE bookings SET status=?,operator_name=COALESCE(?,operator_name),vehicle_id=COALESCE(?,vehicle_id),pickup_at=CASE WHEN ?='picked_up' THEN ? ELSE pickup_at END WHERE id=?`)
        .run(next,next==='assigned'?operator:null,next==='assigned'?vehicle:null,next,new Date().toISOString(),id);
      audit(id,role,operator,next,`${statusLabel[next]}${vehicle?` · ${vehicle}`:''}.`);
      return send(res,200,{item:bookingDetails(db.prepare('SELECT * FROM bookings WHERE id=?').get(id))});
    }
    if(req.method==='PATCH' && url.pathname.startsWith('/api/bookings/') && url.pathname.endsWith('/receipt')) {
      if(role!=='recycler')return send(res,403,{error:'Recycler role required.'});
      const id=decodeURIComponent(url.pathname.split('/')[3]);const d=await bodyJson(req);const row=db.prepare('SELECT * FROM bookings WHERE id=?').get(id);
      const received=Number(d.received_tonnes);
      if(!row)return send(res,404,{error:'Pickup not found.'});
      if(row.status!=='in_transit')return send(res,409,{error:'Only an in-transit load can be received.'});
      if(!Number.isFinite(received)||received<=0||received>row.quantity_tonnes*1.15)return send(res,400,{error:'Received weight must be positive and within 15% of the registered load.'});
      if(!d.facility_id||String(d.facility_id).length>60)return send(res,400,{error:'Facility identifier is required.'});
      const now=new Date().toISOString();db.prepare("UPDATE bookings SET status='received',received_tonnes=?,facility_id=?,received_at=? WHERE id=?").run(received,d.facility_id,now,id);
      audit(id,role,String(d.facility_name||'Processing facility').slice(0,100),'received',`Facility receipt: ${received.toFixed(2)} tonnes at ${d.facility_id}.`,d.evidence_ref||null);
      return send(res,200,{item:bookingDetails(db.prepare('SELECT * FROM bookings WHERE id=?').get(id))});
    }
    if(req.method==='PATCH' && url.pathname.startsWith('/api/bookings/') && url.pathname.endsWith('/processing')) {
      if(role!=='recycler')return send(res,403,{error:'Recycler role required.'});
      const id=decodeURIComponent(url.pathname.split('/')[3]);const d=await bodyJson(req);const row=db.prepare('SELECT * FROM bookings WHERE id=?').get(id);
      if(!row)return send(res,404,{error:'Pickup not found.'});if(!['received','processing'].includes(row.status))return send(res,409,{error:'Load must be received before processing can be recorded.'});
      const recycled=Number(d.recycled_tonnes||0),reused=Number(d.reused_tonnes||0),residual=Number(d.residual_tonnes||0),total=recycled+reused+residual;
      if([recycled,reused,residual].some(x=>!Number.isFinite(x)||x<0)||!row.received_tonnes||Math.abs(total-row.received_tonnes)>0.03)return send(res,400,{error:'Recycled + reused + residual weights must balance the facility-received weight (±0.03 t).'});
      if(residual>0&&!String(d.residual_destination||'').trim())return send(res,400,{error:'Record the authorized residual destination.'});
      if(!String(d.evidence_ref||'').trim())return send(res,400,{error:'Add a supporting evidence reference (document ID, URL, or local register ID).'});
      const now=new Date().toISOString();const state=total===0?'processing':'recovered';
      db.prepare('UPDATE bookings SET status=?,sort_notes=?,recycled_tonnes=?,reused_tonnes=?,residual_tonnes=?,residual_destination=?,evidence_ref=?,verified_at=? WHERE id=?')
       .run(state,String(d.sort_notes||'').slice(0,500),recycled,reused,residual,String(d.residual_destination||'').trim()||null,String(d.evidence_ref).trim(),now,id);
      audit(id,role,String(d.facility_name||'Processing facility').slice(0,100),'recovery_recorded',`Material balance: ${recycled.toFixed(2)} t recycled, ${reused.toFixed(2)} t reused, ${residual.toFixed(2)} t residual.`,String(d.evidence_ref).trim());
      return send(res,200,{item:bookingDetails(db.prepare('SELECT * FROM bookings WHERE id=?').get(id))});
    }
    if(req.method==='GET' && url.pathname==='/api/air') return send(res,200,{...airCache,configured:Boolean(process.env.OPENAQ_API_KEY),source:'OpenAQ v3 · upstream sensor data',limits:'Particulate concentrations are shown as reported by stations; this prototype does not compute or certify an official AQI.'});
    if(req.method==='POST' && url.pathname==='/api/air/refresh') {
      if(role!=='citizen'&&role!=='authority')return send(res,403,{error:'This action is unavailable for the selected demo role.'});
      return send(res,200,{...await refreshAir(),configured:Boolean(process.env.OPENAQ_API_KEY),source:'OpenAQ v3 · upstream sensor data'});
    }
    if(url.pathname.startsWith('/api/'))return send(res,404,{error:'API route not found.'});
    return send(res,404,{error:'Not found.'});
  } catch(e) { console.error(e); return send(res,500,{error:e.message||'Unexpected server error.'}); }
});

const port=Number(process.env.PORT||4173);
server.listen(port,'127.0.0.1',()=>console.log(`AIRWISE × DEBRIX running at http://127.0.0.1:${port}`));

