import { get, put, BlobPreconditionFailedError } from '@vercel/blob';
import { randomUUID } from 'node:crypto';

const STATE_PATH='debrix-airwise/state.json';
const statuses=['requested','assigned','picked_up','in_transit','received','processing','recovered','closed'];
const statusLabel={requested:'Request received',assigned:'Vehicle assigned',picked_up:'Picked up',in_transit:'In transit',received:'Facility received',processing:'Processing',recovered:'Recovery recorded',closed:'Closed'};
const transitions={requested:['assigned'],assigned:['picked_up'],picked_up:['in_transit']};
const wasteTypes=new Set(['Concrete & brick','Mixed C&D','Tiles & ceramics','Soil & rubble','Wood & metals','Other C&D']);
const isoAgo=h=>new Date(Date.now()-h*3600000).toISOString();

function seedState(){
 const now=Date.now();
 const bookings=[
  {id:'DBX-2048',created_at:isoAgo(24),citizen_name:'Ananya Rao',phone:'98••• 2104',address:'14th Cross, HSR Layout, Sector 2',locality:'HSR Layout',waste_type:'Concrete & brick',quantity_tonnes:1.8,preferred_date:new Date(now+86400000).toISOString().slice(0,10),status:'assigned',operator_name:'Kiran S.',vehicle_id:'KA 03 MN 4821',demo:1},
  {id:'DBX-2047',created_at:isoAgo(48),citizen_name:'R. Menon',phone:'98••• 7302',address:'8th Main, Indiranagar',locality:'Indiranagar',waste_type:'Mixed C&D',quantity_tonnes:2.4,preferred_date:new Date(now-86400000).toISOString().slice(0,10),status:'in_transit',operator_name:'Meera P.',vehicle_id:'KA 05 AB 1186',pickup_at:isoAgo(3),demo:1},
  {id:'DBX-2046',created_at:isoAgo(96),citizen_name:'S. Kumar',phone:'98••• 9190',address:'BTM 2nd Stage, Tavarekere Road',locality:'BTM Layout',waste_type:'Tiles & ceramics',quantity_tonnes:1.2,preferred_date:new Date(now-3*86400000).toISOString().slice(0,10),status:'processing',operator_name:'Ravi N.',vehicle_id:'KA 51 C 9042',pickup_at:isoAgo(52),received_tonnes:1.15,facility_id:'FAC-01',received_at:isoAgo(30),demo:1},
  {id:'DBX-2045',created_at:isoAgo(144),citizen_name:'Ananya Rao',phone:'98••• 2104',address:'6th Block, Koramangala',locality:'Koramangala',waste_type:'Concrete & brick',quantity_tonnes:1.6,preferred_date:new Date(now-5*86400000).toISOString().slice(0,10),status:'recovered',operator_name:'Ravi N.',vehicle_id:'KA 03 MN 4821',pickup_at:isoAgo(130),received_tonnes:1.55,facility_id:'FAC-01',received_at:isoAgo(116),sort_notes:'Crushed aggregate and reusable masonry separated.',recycled_tonnes:.85,reused_tonnes:.45,residual_tonnes:.25,residual_destination:'Authorized inert waste facility · demo',evidence_ref:'DEMO-FAC-TICKET-2045',verified_at:isoAgo(92),demo:1}
 ];
 const events=[];
 const add=(booking_id,h,actor_role,actor_name,event_type,note,evidence_ref=null)=>events.push({id:randomUUID(),booking_id,at:isoAgo(h),actor_role,actor_name,event_type,note,evidence_ref,demo:1});
 add('DBX-2048',24,'citizen','Ananya Rao','registered','Pickup request submitted; demo seed record.');add('DBX-2048',22,'operator','Dispatch desk','assigned','Assigned vehicle KA 03 MN 4821; demo seed record.');
 add('DBX-2047',48,'citizen','R. Menon','registered','Pickup request submitted; demo seed record.');add('DBX-2047',40,'operator','Meera P.','picked_up','Load collected; demo seed record.');add('DBX-2047',36,'operator','Meera P.','in_transit','En route to facility; demo seed record.');
 add('DBX-2046',96,'citizen','S. Kumar','registered','Pickup request submitted; demo seed record.');add('DBX-2046',70,'operator','Ravi N.','picked_up','Load collected; demo seed record.');add('DBX-2046',60,'facility','GreenLoop Facility','received','Facility receipt recorded; demo seed record.');add('DBX-2046',52,'facility','GreenLoop Facility','processing','Sorting started; demo seed record.');
 add('DBX-2045',144,'citizen','Ananya Rao','registered','Pickup request submitted; seeded demo record.');add('DBX-2045',138,'operator','Ravi N.','assigned','Assigned vehicle KA 03 MN 4821; seeded demo record.');add('DBX-2045',130,'operator','Ravi N.','picked_up','Load collected; seeded demo record.');add('DBX-2045',126,'operator','Ravi N.','in_transit','En route to facility; seeded demo record.');add('DBX-2045',116,'facility','GreenLoop Facility','received','Facility receipt: 1.55 tonnes at FAC-01; seeded demo record.','DEMO-FAC-TICKET-2045');add('DBX-2045',92,'facility','GreenLoop Facility','recovery_recorded','Material balance: 0.85 t recycled, 0.45 t reused, 0.25 t residual; seeded demo record.','DEMO-FAC-TICKET-2045');
 return {version:1,updated_at:new Date().toISOString(),bookings,events,air:{checkedAt:null,records:[],error:'OpenAQ API key is not configured.'}};
}

async function readState(){
 const value=await get(STATE_PATH,{access:'private',useCache:false});
 if(!value)return null;
 const json=await new Response(value.stream).text();
 return {state:JSON.parse(json),etag:value.blob.etag};
}
async function ensureState(){
 for(let attempt=0;attempt<3;attempt++){
  const current=await readState();if(current)return current;
  try{await put(STATE_PATH,JSON.stringify(seedState()),{access:'private',contentType:'application/json',allowOverwrite:false});}
  catch(error){if(attempt===2&&!String(error?.message||'').toLowerCase().includes('already'))throw error;}
 }
 const current=await readState();if(!current)throw new Error('Persistent demo store could not be initialized.');return current;
}
async function mutate(change){
 for(let attempt=0;attempt<8;attempt++){
  const current=await ensureState();const draft=structuredClone(current.state);
  const result=change(draft);
  draft.updated_at=new Date().toISOString();
  try{await put(STATE_PATH,JSON.stringify(draft),{access:'private',contentType:'application/json',allowOverwrite:true,ifMatch:current.etag});return result;}
  catch(error){if(error instanceof BlobPreconditionFailedError||error?.name==='BlobPreconditionFailedError'||error?.status===412){continue;}throw error;}
 }
 throw new HttpError(409,'Records changed repeatedly. Please retry this action.');
}
class HttpError extends Error{constructor(status,message){super(message);this.status=status}}
const json=(res,status,body)=>{res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');res.end(JSON.stringify(body));};
async function readBody(req){let raw='';for await(const part of req){raw+=part;if(raw.length>20000)throw new HttpError(413,'Request body is too large.');}try{return raw?JSON.parse(raw):{}}catch{throw new HttpError(400,'Request body must be valid JSON.');}}
function roleAllowed(role,method,path){const read=['GET /api/summary','GET /api/bookings'].includes(`${method} ${path}`);if(role==='citizen')return read||(method==='POST'&&path==='/api/bookings')||(method==='GET'&&path==='/api/air')||(method==='POST'&&path==='/api/air/refresh');if(role==='operator')return read||(method==='PATCH'&&/^\/api\/bookings\/[^/]+\/status$/.test(path));if(role==='recycler')return read||(method==='PATCH'&&/^\/api\/bookings\/[^/]+\/(receipt|processing)$/.test(path));if(role==='authority')return read||(method==='GET'&&path==='/api/air')||(method==='POST'&&path==='/api/air/refresh');return false;}
function details(state,row){return {...row,events:state.events.filter(e=>e.booking_id===row.id).sort((a,b)=>a.at.localeCompare(b.at)),status_label:statusLabel[row.status]||row.status};}
function visibleBookings(state,role,user){return state.bookings.filter(b=>role!=='citizen'||b.citizen_name.toLowerCase()===String(user||'Ananya Rao').toLowerCase()).sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(b=>details(state,b));}
function audit(state,id,role,name,type,note,evidence_ref=null){state.events.push({id:randomUUID(),booking_id:id,at:new Date().toISOString(),actor_role:role,actor_name:name,event_type:type,note,evidence_ref,demo:0});}
function summary(state,role,user){const bookings=visibleBookings(state,role,user);const rows=role==='citizen'?bookings:state.bookings;const counts={};for(const b of rows)counts[b.status]=(counts[b.status]||0)+1;return {generated_at:new Date().toISOString(),total:rows.length,counts,recovered_tonnes:rows.reduce((n,b)=>n+Number(b.recycled_tonnes||0)+Number(b.reused_tonnes||0),0),residual_tonnes:rows.reduce((n,b)=>n+Number(b.residual_tonnes||0),0),bookings,air:state.air,workflow_statuses:statuses,seeded:rows.some(b=>b.demo)};}
function validateBooking(d){for(const k of ['citizen_name','phone','address','locality','waste_type','preferred_date'])if(typeof d[k]!=='string'||!d[k].trim())throw new HttpError(400,`${k.replaceAll('_',' ')} is required.`);if(d.citizen_name.trim().length>100||d.address.trim().length>250||d.locality.trim().length>80)throw new HttpError(400,'Name, address, or locality exceeds its allowed length.');const digits=d.phone.replace(/\D/g,'');if(!/^[+()\-\s\d]{8,20}$/.test(d.phone.trim())||digits.length<8||digits.length>15)throw new HttpError(400,'Enter a valid contact number with 8 to 15 digits.');if(!wasteTypes.has(d.waste_type))throw new HttpError(400,'Choose a supported C&D material type.');const quantity=Number(d.quantity_tonnes);if(!Number.isFinite(quantity)||quantity<.1||quantity>40)throw new HttpError(400,'Load size must be between 0.1 and 40 tonnes.');if(!/^\d{4}-\d{2}-\d{2}$/.test(d.preferred_date)||Number.isNaN(Date.parse(d.preferred_date)))throw new HttpError(400,'Choose a valid pickup date.');if(d.preferred_date<new Date().toISOString().slice(0,10))throw new HttpError(400,'Pickup date cannot be in the past.');return quantity;}

async function refreshAir(){
 const key=process.env.OPENAQ_API_KEY;if(!key)return {checkedAt:new Date().toISOString(),records:[],error:'OpenAQ API key is not configured.'};
 try{
  const base='https://api.openaq.org/v3/locations',coordinates=process.env.OPENAQ_COORDINATES||'12.9716,77.5946',radius=Math.min(25000,Math.max(1,Number(process.env.OPENAQ_RADIUS_METERS||25000)));
  const response=await fetch(`${base}?coordinates=${encodeURIComponent(coordinates)}&radius=${radius}&limit=100`,{headers:{'X-API-Key':key},signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error(`OpenAQ locations returned HTTP ${response.status}.`);
  const data=await response.json(),locations=(data.results||[]).slice().sort((a,b)=>(a.distance??Infinity)-(b.distance??Infinity)).slice(0,12);
  const groups=await Promise.all(locations.map(async loc=>{try{const r=await fetch(`${base}/${loc.id}/latest?limit=100`,{headers:{'X-API-Key':key},signal:AbortSignal.timeout(12000)});if(!r.ok)return[];const res=await r.json(),sensors=new Map((loc.sensors||[]).map(s=>[s.id,s.parameter]));return(res.results||[]).map(x=>({x,p:sensors.get(x.sensorsId)})).filter(y=>['pm25','pm10'].includes(y.p?.name)).map(({x,p})=>({location_id:loc.id,location_name:loc.name||`Station ${loc.id}`,locality:loc.locality||null,latitude:x.coordinates?.latitude??loc.coordinates?.latitude??null,longitude:x.coordinates?.longitude??loc.coordinates?.longitude??null,parameter:p.name,value:x.value,unit:p.units||null,observed_at:x.datetime?.utc||null,source:'OpenAQ v3 · upstream sensor measurement'}));}catch{return[]}}));
  const records=groups.flat().filter(x=>x.observed_at&&Number.isFinite(Number(x.value)));return {checkedAt:new Date().toISOString(),records,error:records.length?null:'OpenAQ returned no recent PM2.5 or PM10 measurements for nearby stations.'};
 }catch(error){return {checkedAt:new Date().toISOString(),records:[],error:`Live source unavailable: ${error.message}`};}
}

export default async function handler(req,res){
 try{
  const url=new URL(req.url,'https://vercel.invalid'),path=url.pathname,role=req.headers['x-demo-role'],user=req.headers['x-demo-user'];
  if(!roleAllowed(role,req.method,path))return json(res,403,{error:'This action is unavailable for the selected demo role.'});
  if(req.method==='GET'&&path==='/api/air'){const current=await ensureState();return json(res,200,{...current.state.air,configured:Boolean(process.env.OPENAQ_API_KEY),source:'OpenAQ v3 · upstream sensor data',limits:'Particulate concentrations are shown as reported by stations; this prototype does not compute or certify an official AQI.'});}
  if(req.method==='POST'&&path==='/api/air/refresh'){
   const air=await refreshAir();await mutate(s=>{s.air=air;return null});return json(res,200,{...air,configured:Boolean(process.env.OPENAQ_API_KEY),source:'OpenAQ v3 · upstream sensor data'});
  }
  const current=await ensureState();
  if(req.method==='GET'&&path==='/api/summary')return json(res,200,summary(current.state,role,user));
  if(req.method==='GET'&&path==='/api/bookings'){const q=(url.searchParams.get('q')||'').toLowerCase(),items=visibleBookings(current.state,role,user).filter(b=>!q||[b.id,b.locality,b.citizen_name,b.status].some(v=>String(v||'').toLowerCase().includes(q)));return json(res,200,{items});}
  if(req.method==='POST'&&path==='/api/bookings'){
   const d=await readBody(req),quantity=validateBooking(d),id=`DBX-${randomUUID().slice(0,8).toUpperCase()}`,name=String(role==='citizen'?(user||d.citizen_name):d.citizen_name).trim().slice(0,100),now=new Date().toISOString();
   const item=await mutate(s=>{const row={id,created_at:now,citizen_name:name,phone:d.phone.trim(),address:d.address.trim(),locality:d.locality.trim(),waste_type:d.waste_type,quantity_tonnes:quantity,preferred_date:d.preferred_date,status:'requested',demo:0};s.bookings.push(row);audit(s,id,role,name,'registered',`Pickup request for ${quantity.toFixed(1)} tonnes of ${d.waste_type}.`);return details(s,row)});return json(res,201,{item});
  }
  const match=path.match(/^\/api\/bookings\/([^/]+)\/(status|receipt|processing)$/);if(!match)throw new HttpError(404,'API route not found.');
  const id=decodeURIComponent(match[1]),action=match[2],d=await readBody(req);
  const item=await mutate(s=>{
   const row=s.bookings.find(b=>b.id===id);if(!row)throw new HttpError(404,'Pickup not found.');
   if(action==='status'){
    const next=d.status;if(!transitions[row.status]?.includes(next))throw new HttpError(409,`Cannot move ${row.status} to ${next}.`);
    const operator=String(d.operator_name||'Field operator').trim().slice(0,80),vehicle=String(d.vehicle_id||'').trim().slice(0,30);if(next==='assigned'&&(!operator||!vehicle))throw new HttpError(400,'Operator name and vehicle ID are required for assignment.');
    row.status=next;if(next==='assigned'){row.operator_name=operator;row.vehicle_id=vehicle;}if(next==='picked_up')row.pickup_at=new Date().toISOString();audit(s,id,role,operator,next,`${statusLabel[next]}${vehicle?` · ${vehicle}`:''}.`);
   }else if(action==='receipt'){
    const received=Number(d.received_tonnes);if(row.status!=='in_transit')throw new HttpError(409,'Only an in-transit load can be received.');if(!Number.isFinite(received)||received<=0||received>row.quantity_tonnes*1.15)throw new HttpError(400,'Received weight must be positive and within 15% of the registered load.');if(!d.facility_id||String(d.facility_id).length>60)throw new HttpError(400,'Facility identifier is required.');
    row.status='received';row.received_tonnes=received;row.facility_id=d.facility_id;row.received_at=new Date().toISOString();audit(s,id,role,String(d.facility_name||'Processing facility').slice(0,100),'received',`Facility receipt: ${received.toFixed(2)} tonnes at ${d.facility_id}.`,d.evidence_ref||null);
   }else{
    if(!['received','processing'].includes(row.status))throw new HttpError(409,'Load must be received before processing can be recorded.');const recycled=Number(d.recycled_tonnes||0),reused=Number(d.reused_tonnes||0),residual=Number(d.residual_tonnes||0),total=recycled+reused+residual;
    if([recycled,reused,residual].some(x=>!Number.isFinite(x)||x<0)||!row.received_tonnes||Math.abs(total-row.received_tonnes)>.03)throw new HttpError(400,'Recycled + reused + residual weights must balance the facility-received weight (±0.03 t).');if(residual>0&&!String(d.residual_destination||'').trim())throw new HttpError(400,'Record the authorized residual destination.');if(!String(d.evidence_ref||'').trim())throw new HttpError(400,'Add a supporting evidence reference (document ID, URL, or local register ID).');
    row.status='recovered';row.sort_notes=String(d.sort_notes||'').slice(0,500);row.recycled_tonnes=recycled;row.reused_tonnes=reused;row.residual_tonnes=residual;row.residual_destination=String(d.residual_destination||'').trim()||null;row.evidence_ref=String(d.evidence_ref).trim();row.verified_at=new Date().toISOString();audit(s,id,role,String(d.facility_name||'Processing facility').slice(0,100),'recovery_recorded',`Material balance: ${recycled.toFixed(2)} t recycled, ${reused.toFixed(2)} t reused, ${residual.toFixed(2)} t residual.`,row.evidence_ref);
   }
   return details(s,row);
  });return json(res,200,{item});
 }catch(error){console.error(error);return json(res,error.status||500,{error:error.message||'Unexpected server error.'});}
}

