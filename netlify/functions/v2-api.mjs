import { createClient } from '@supabase/supabase-js';
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
const json=(status,data)=>({statusCode:status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},body:JSON.stringify(data)});
const db=()=>createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const hash=p=>{const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(String(p),salt,64).toString('hex')}`};
const verify=(p,h)=>{if(!h)return false;const [salt,digest]=h.split(':');if(!salt||!digest)return false;const a=scryptSync(String(p),salt,64),b=Buffer.from(digest,'hex');return a.length===b.length&&timingSafeEqual(a,b)};
const sign=(payload)=>{const data=Buffer.from(JSON.stringify(payload)).toString('base64url');return `${data}.${createHmac('sha256',process.env.V2_SESSION_SECRET).update(data).digest('base64url')}`};
const session=(event)=>{const raw=(event.headers.authorization||event.headers.Authorization||'').replace(/^Bearer /,'');const [data,sig]=raw.split('.');if(!data||!sig)return null;const expected=createHmac('sha256',process.env.V2_SESSION_SECRET).update(data).digest('base64url');const a=Buffer.from(sig),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))return null;const obj=JSON.parse(Buffer.from(data,'base64url').toString());return obj.exp>Date.now()?obj:null};
const fail=e=>{throw new Error(e?.message||'Database operation failed')};
const query=async(q)=>{const {data,error}=await q;if(error)fail(error);return data};
const required=(v,max=500)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Missing or invalid required field');return v.trim()};
const pin=p=>{if(!/^\d{4}$/.test(String(p)))throw Error('PIN must be exactly 4 digits');return String(p)};
const allowed=(role)=>role==='admin';
export const handler=async(event)=>{
 if(event.httpMethod!=='POST')return json(405,{error:'POST required'});
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY||!process.env.V2_SESSION_SECRET)return json(503,{error:'Server configuration incomplete'});
 try{
  const b=JSON.parse(event.body||'{}'),action=b.action,client=db();let user=null,s=session(event);
  if(action==='bootstrap'){
   const users=await query(client.from('v2_users').select('id').limit(1));
   if(users.length)return json(403,{error:'Setup already completed'});
   if(!process.env.V2_BOOTSTRAP_SECRET||b.secret!==process.env.V2_BOOTSTRAP_SECRET)return json(403,{error:'Invalid setup code'});
   const created=await query(client.from('v2_users').insert({name:'Owner',role:'admin',colour:'#64748b',pin_hash:hash(pin(b.pin))}).select('id,name,role').single());
   return json(200,{ok:true,user:created});
  }
  if(action==='recoverOwner'){
   if(!process.env.V2_BOOTSTRAP_SECRET||b.secret!==process.env.V2_BOOTSTRAP_SECRET)return json(403,{error:'Invalid recovery code'});
   const owner=await query(client.from('v2_users').select('id').eq('name','Owner').maybeSingle());
   if(!owner)return json(404,{error:'Owner not configured'});
   await query(client.from('v2_users').update({pin_hash:hash(pin(b.pin)),failed_attempts:0,locked_until:null}).eq('id',owner.id));
   return json(200,{ok:true});
  }
  if(action==='names')return json(200,{users:(await query(client.from('v2_users').select('id,name,role,colour').eq('active',true).order('name'))).filter(x=>x.name!=='Owner')});
  if(action==='ownerName')return json(200,{user:await query(client.from('v2_users').select('id,name,role,colour').eq('name','Owner').maybeSingle())});
  if(action==='login'){
   const found=await query(client.from('v2_users').select('*').eq('id',b.userId).eq('active',true).maybeSingle());
   if(found?.locked_until&&new Date(found.locked_until).getTime()>Date.now())return json(429,{error:'Too many attempts. Try again in 15 minutes.'});
   if(!found||!verify(b.pin,found.pin_hash)){
    if(found){const attempts=(found.failed_attempts||0)+1;await query(client.from('v2_users').update({failed_attempts:attempts>=5?0:attempts,locked_until:attempts>=5?new Date(Date.now()+15*60*1000).toISOString():null}).eq('id',found.id));}
    return json(401,{error:'Incorrect PIN'});
   }
   await query(client.from('v2_users').update({failed_attempts:0,locked_until:null}).eq('id',found.id));
   return json(200,{token:sign({id:found.id,exp:Date.now()+8*60*60*1000}),user:{id:found.id,name:found.name,role:found.role}});
  }
  if(!s)return json(401,{error:'Please log in again'});
  user=await query(client.from('v2_users').select('id,name,role,active').eq('id',s.id).maybeSingle());
  if(!user?.active)return json(401,{error:'Account inactive'});
  const admin=allowed(user.role);
  if(action==='data'){
   const jobs=await query(client.from('v2_jobs').select('*').order('created_at',{ascending:false}).limit(500));
   const assignments=await query(client.from('v2_assignments').select('*'));
   const shifts=await query(client.from('v2_shifts').select('*').order('started_at',{ascending:false}).limit(300));
   const breaks=await query(client.from('v2_breaks').select('*').order('started_at',{ascending:false}).limit(300));
   const work=await query(client.from('v2_work').select('*').order('started_at',{ascending:false}).limit(1000));
   const clients=await query(client.from('v2_clients').select('id,name').order('name'));
   const allUsers=await query(client.from('v2_users').select('id,name,role,colour,active').order('name'));
   return json(200,{jobs:admin?jobs:jobs.filter(j=>assignments.some(a=>a.job_id===j.id&&a.user_id===user.id)),assignments:admin?assignments:assignments.filter(a=>a.user_id===user.id),shifts:admin?shifts:shifts.filter(x=>x.user_id===user.id),breaks:admin?breaks:breaks.filter(x=>shifts.some(y=>y.id===x.shift_id&&y.user_id===user.id)),work:admin?work:work.filter(x=>assignments.some(a=>a.job_id===x.job_id&&a.user_id===user.id)),users:allUsers.map(({id,name,role,colour,active})=>({id,name,role,colour,active})),clients});
  }
  if(action==='changeOwnPin'){
   const account=await query(client.from('v2_users').select('pin_hash').eq('id',user.id).single());
   if(!verify(b.currentPin,account.pin_hash))return json(403,{error:'Current PIN is incorrect'});
   await query(client.from('v2_users').update({pin_hash:hash(pin(b.newPin)),failed_attempts:0,locked_until:null}).eq('id',user.id));
   return json(200,{ok:true});
  }
  if(action==='ownerResetPin'){
   if(user.name!=='Owner')return json(403,{error:'Only Owner can reset another user PIN'});
   const target=await query(client.from('v2_users').select('id,name').eq('id',b.userId).maybeSingle());
   if(!target)return json(404,{error:'User not found'});
   if(target.name==='Owner')return json(403,{error:'Change your own PIN using Change my PIN'});
   await query(client.from('v2_users').update({pin_hash:hash(pin(b.newPin)),failed_attempts:0,locked_until:null}).eq('id',target.id));
   return json(200,{ok:true});
  }
  if(action==='saveUser'){
   if(!admin)return json(403,{error:'Admin only'});
   if(b.name==='Owner'||(b.id&&b.id=== (await query(client.from('v2_users').select('id').eq('name','Owner').maybeSingle()))?.id))return json(403,{error:'Owner account can only be reset with the private recovery code'});
   const values={name:required(b.name,80),role:['admin','worker'].includes(b.role)?b.role:'worker',colour:/^#[0-9a-fA-F]{6}$/.test(b.colour)?b.colour:'#64748b',active:b.active!==false};
   if(b.id&&b.pin)return json(403,{error:'You can only change your own PIN using your current PIN'});
   if(!b.id&&b.pin)values.pin_hash=hash(pin(b.pin));
   if(b.id){await query(client.from('v2_users').update(values).eq('id',b.id));}else{if(!values.pin_hash)throw Error('PIN required');await query(client.from('v2_users').insert(values));}
   return json(200,{ok:true});
  }
  if(action==='setJobStatus'){
   const j=await query(client.from('v2_jobs').select('id,status').eq('id',b.jobId).single());
   const assigned=await query(client.from('v2_assignments').select('user_id').eq('job_id',j.id).eq('user_id',user.id).limit(1));
   if(!admin&&!assigned.length)return json(403,{error:'Not assigned to this job'});
   const status=b.status;
   if(!['open','in_progress','on_hold','completed'].includes(status))throw Error('Invalid status');
   if(j.status==='completed'&&status!=='completed'&&!admin)return json(403,{error:'Only admins can reopen jobs'});
   if(status==='completed'){
     const active=await query(client.from('v2_work').select('id').eq('job_id',j.id).is('ended_at',null).limit(1));
     if(active.length)throw Error('Stop all active work on this job before completing it');
   }
   await query(client.from('v2_jobs').update({status,hold_reason:null,completed_at:status==='completed'?new Date().toISOString():null,completed_by:status==='completed'?user.id:null,updated_at:new Date().toISOString()}).eq('id',j.id));
   return json(200,{ok:true});
  }
  if(action==='saveJob'){
   if(!admin)return json(403,{error:'Admin only'});
   const clientName=required(b.client,200);
   const contactName=required(b.contact_name,200);
   const startDate=required(b.start_date,20),dueDate=required(b.completion_date,20);
   const description=required(b.description,10000);
   const existingClient=await query(client.from('v2_clients').select('id').ilike('name',clientName).limit(1));
   let clientRow=existingClient[0];if(!clientRow){const inserted=await client.from('v2_clients').upsert({name:clientName},{onConflict:'name'}).select('id').single();if(inserted.error)fail(inserted.error);clientRow=inserted.data;}
   const status=['open','in_progress','on_hold','completed'].includes(b.status)?b.status:'open';
   const values={client:clientName,client_id:clientRow.id,contact_name:contactName,contact_phone:String(b.contact_phone||'').slice(0,100),contact_email:String(b.contact_email||'').slice(0,200),rego_vin:String(b.rego_vin||'').slice(0,120),start_date:startDate,completion_date:dueDate,description,instructions:String(b.instructions||'').slice(0,10000),status,hold_reason:null,updated_at:new Date().toISOString()};
   if(b.id){
     const previous=await query(client.from('v2_jobs').select('status,completed_at,completed_by').eq('id',b.id).single());
     if(previous.status==='completed'&&status!=='completed'){values.completed_at=null;values.completed_by=null;}
     else if(previous.status!=='completed'&&status==='completed'){values.completed_at=new Date().toISOString();values.completed_by=user.id;}
   }
   let job;if(b.id){job=await query(client.from('v2_jobs').update(values).eq('id',b.id).select().single());}else{const number=await query(client.rpc('v2_next_job_number'));job=await query(client.from('v2_jobs').insert({...values,job_number:String(number),created_by:user.id,...(status==='completed'?{completed_at:new Date().toISOString(),completed_by:user.id}:{})}).select().single());}
   await query(client.from('v2_assignments').delete().eq('job_id',job.id));
   const ids=[...new Set((b.assignees||[]).filter(x=>typeof x==='string'))];
   if(ids.length)await query(client.from('v2_assignments').insert(ids.map(id=>({job_id:job.id,user_id:id}))));
   return json(200,{ok:true});
  }
  if(action==='clockIn'){
   const open=await query(client.from('v2_shifts').select('id').eq('user_id',user.id).is('ended_at',null).limit(1));if(open.length)throw Error('Already clocked in');
   await query(client.from('v2_shifts').insert({user_id:user.id}));return json(200,{ok:true});
  }
  if(action==='clockOut'){
   const shift=await query(client.from('v2_shifts').select('id').eq('user_id',user.id).is('ended_at',null).order('started_at',{ascending:false}).limit(1));if(!shift.length)throw Error('Not clocked in');
   const now=new Date().toISOString();await query(client.from('v2_breaks').update({ended_at:now}).eq('shift_id',shift[0].id).is('ended_at',null));await query(client.from('v2_work').update({ended_at:now}).eq('user_id',user.id).is('ended_at',null));await query(client.from('v2_shifts').update({ended_at:now}).eq('id',shift[0].id));return json(200,{ok:true});
  }
  if(action==='breakStart'||action==='breakEnd'){
   const shift=await query(client.from('v2_shifts').select('id').eq('user_id',user.id).is('ended_at',null).limit(1));if(!shift.length)throw Error('Clock in first');
   const active=await query(client.from('v2_breaks').select('id').eq('shift_id',shift[0].id).is('ended_at',null).limit(1));
   if(action==='breakStart'){if(active.length)throw Error('Already on break');await query(client.from('v2_work').update({ended_at:new Date().toISOString()}).eq('user_id',user.id).is('ended_at',null));await query(client.from('v2_breaks').insert({shift_id:shift[0].id}));}
   else{if(!active.length)throw Error('Not on break');await query(client.from('v2_breaks').update({ended_at:new Date().toISOString()}).eq('id',active[0].id));}return json(200,{ok:true});
  }
  if(action==='workStart'){
   const shift=await query(client.from('v2_shifts').select('id').eq('user_id',user.id).is('ended_at',null).limit(1));if(!shift.length){await query(client.from('v2_shifts').insert({user_id:user.id}));shift.push(...await query(client.from('v2_shifts').select('id').eq('user_id',user.id).is('ended_at',null).order('started_at',{ascending:false}).limit(1)));}
   const breaks=await query(client.from('v2_breaks').select('id').eq('shift_id',shift[0].id).is('ended_at',null).limit(1));if(breaks.length)throw Error('End break first');
   const assigned=await query(client.from('v2_assignments').select('job_id').eq('job_id',b.jobId).eq('user_id',user.id).limit(1));if(!assigned.length&&!admin)return json(403,{error:'Job not assigned to you'});
   const target=await query(client.from('v2_jobs').select('status').eq('id',b.jobId).single());
   if(target.status==='completed')throw Error('Job is completed. Ask an admin to reopen it');
   await query(client.from('v2_work').update({ended_at:new Date().toISOString()}).eq('user_id',user.id).is('ended_at',null));await query(client.from('v2_work').insert({job_id:b.jobId,user_id:user.id}));return json(200,{ok:true});
  }
  if(action==='workStop'){
   const current=await query(client.from('v2_work').select('id').eq('user_id',user.id).is('ended_at',null).limit(1));if(!current.length)throw Error('No active job');
   await query(client.from('v2_work').update({ended_at:new Date().toISOString(),notes:String(b.notes||'').slice(0,2000)}).eq('id',current[0].id));return json(200,{ok:true});
  }
  return json(400,{error:'Unknown action'});
 }catch(e){return json(400,{error:e.message||'Request failed'});}
};
