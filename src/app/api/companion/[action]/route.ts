import { requireUser, sameOrigin, adminClient } from '@/lib/supabase/server';
import { FoProvider, inspectFo, transport, type ProviderSnapshot } from '@/lib/fo/client';
import { verifiedTextSchemas } from '@/lib/fo/contracts';
import { seal, unseal } from '@/lib/fo/vault';
import { callbackURL, digest, withFoLock, storeProvider, dispatchText, pollRequest, history } from '@/lib/fo/production';
import { interventionContext } from '@/lib/fo/accountability';
import { validateData } from '@/lib/storage';
import { startBrowserVoice, voiceSchemaAvailable } from '@/lib/fo/voice';
import { verifiedProvider } from '@/lib/fo/production';
import { emptyData } from '@/lib/types';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { coachingInstructions } from '@/lib/coaching';
export const maxDuration=60;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
async function handle(request:Request,{params}:{params:Promise<{action:string}>}){
 const {action}=await params;
 if(request.method!=='GET'&&!sameOrigin(request))return json({message:'Invalid origin'},403);
 try{
 const {user}=await requireUser();const db=adminClient();
 if(request.method==='GET'&&action==='status'){
   const [{data:connection,error:connectionError},{data:preferences,error:preferencesError}]=await Promise.all([db.from('fo_connections').select('updated_at').eq('user_id',user.id).maybeSingle(),db.from('accountability_preferences').select().eq('user_id',user.id).maybeSingle()]);
   if(connectionError||preferencesError)throw new Error('Could not read Fo status. Check database migrations.');
   return json({connected:!!connection,preferences,history:await history(user.id),automationAvailable:process.env.FO_AUTOMATION_VERIFIED==='true',productionAuthorizationVerified:process.env.FO_HTTPS_CALLBACK_VERIFIED==='true'});
 }
 return await withFoLock(user.id,async()=>{
 if(action==='callback'&&request.method==='GET'){
   const params=new URL(request.url).searchParams;const state=params.get('state');const jar=await cookies();
   if(!state||state.length>256||jar.get('ryluno_fo_state')?.value!==digest(state))return json({message:'Invalid OAuth state or browser'},400);
   const {data:flow,error}=await db.from('fo_oauth_flows').delete().eq('state_hash',digest(state)).eq('user_id',user.id).gt('expires_at',new Date().toISOString()).select().maybeSingle();
   jar.delete('ryluno_fo_state');if(error||!flow||!params.get('code')||params.has('error'))return json({message:'Authorization expired, declined, or already used. Connect again.'},400);
   const provider=new FoProvider(callbackURL(),unseal<ProviderSnapshot>(flow.encrypted,user.id));
   const connection=transport(provider);try{await connection.finishAuth(params);}finally{await connection.close().catch(()=>{});}
   const result=await inspectFo(provider);if(result.status!=='connected'||!verifiedTextSchemas(result.tools))throw new Error('Fo tool verification failed');
   await storeProvider(user.id,provider);return Response.redirect(new URL('/',process.env.APP_ORIGIN!),303);
 }
 if(request.method!=='POST')return json({message:'Unsupported method'},405);
 const raw=await request.text();if(raw.length>16000)return json({message:'Request too large'},413);const body=raw?JSON.parse(raw):{};
 if(action==='connect'){
   const provider=new FoProvider(callbackURL());const result=await inspectFo(provider);
   if(result.status!=='authorization_required'||!provider.authorizationUrl)throw new Error('Could not start Fo authorization');
   const {error}=await db.from('fo_oauth_flows').insert({state_hash:digest(provider.flow.state),user_id:user.id,encrypted:seal(provider.snapshot(),user.id),expires_at:new Date(provider.flow.expires).toISOString()});if(error)throw new Error('Could not save authorization state');
   (await cookies()).set('ryluno_fo_state',digest(provider.flow.state),{httpOnly:true,secure:process.env.APP_ORIGIN?.startsWith('https://'),sameSite:'lax',path:'/api/companion',maxAge:600});
   return json({authorizationUrl:provider.authorizationUrl});
 }
 if(action==='disconnect'){
   const {error}=await db.rpc('disconnect_fo',{owner:user.id});if(error)throw new Error('Could not disconnect; no cancellation was confirmed.');return json({ok:true});
 }
 if(action==='preferences'){
   if(typeof body.enabled!=='boolean'||!Number.isInteger(body.quiet_start)||!Number.isInteger(body.quiet_end)||body.quiet_start<0||body.quiet_start>23||body.quiet_end<0||body.quiet_end>23||![1,2].includes(body.daily_limit))throw new Error('Invalid preferences');
   if(typeof body.timezone!=='string'||!body.timezone)throw new Error('Invalid timezone');new Intl.DateTimeFormat('en',{timeZone:body.timezone}).format();
   if(body.enabled&&(body.confirmed!==true||process.env.FO_AUTOMATION_VERIFIED!=='true'))throw new Error('Automatic check-ins require deployment verification and your consent.');
   const {error}=await db.rpc('set_accountability_preferences',{owner:user.id,active:body.enabled,zone:body.timezone,quiet_from:body.quiet_start,quiet_until:body.quiet_end,maximum:body.daily_limit});if(error)throw new Error('Could not save preferences or confirm cancellation.');return json({ok:true});
 }
 if(action==='voice-status'){const {tools}=await verifiedProvider(user.id);return json({available:voiceSchemaAvailable(tools),tools:tools.filter(t=>t.name==='start_fo_call')});}
 if(action==='voice'){
   if(body.confirmed!==true||typeof body.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(body.requestId))throw new Error('Review and confirm browser voice first');
   const {data:existing}=await db.from('fo_requests').select('id').eq('user_id',user.id).eq('dedupe_key','voice:'+body.requestId).maybeSingle();if(existing)return json({history:await history(user.id)});
   const {provider,tools}=await verifiedProvider(user.id);if(!voiceSchemaAvailable(tools))throw new Error('Could not verify browser voice schema');
   const {data:row,error}=await db.from('fo_requests').insert({user_id:user.id,dedupe_key:'voice:'+body.requestId,kind:'voice',status:'sending',instructions:'User requested a browser voice conversation with Fo; no telephone call.'}).select('id').single();if(error)throw new Error('Could not reserve voice request');
   try{const url=await startBrowserVoice(provider);const {error}=await db.from('fo_requests').update({status:'complete',result:{url}}).eq('user_id',user.id).eq('id',row.id);if(error)throw new Error('Could not save call link');return json({url});}catch{await db.from('fo_requests').update({status:'unknown'}).eq('user_id',user.id).eq('id',row.id);throw new Error('Delivery is uncertain. Check Fo directly before creating another call.');}
 }
 if(action==='cancel'){
   const {data:cancelled,error}=await db.from('fo_requests').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('user_id',user.id).eq('id',body.id).eq('status','queued').select('id');if(error)throw new Error('Could not cancel');return json({ok:!!cancelled?.length,message:cancelled?.length?'Queued action cancelled.':'No queued action was cancelled. Already dispatched Fo work must be stopped in Fo.'});
 }
 if(action==='poll'){await pollRequest(user.id,String(body.id));return json({history:await history(user.id)});}
 if(action==='prepare'){
   const {data:doc,error}=await db.from('study_documents').select('data').eq('user_id',user.id).maybeSingle();if(error)throw new Error('Could not load study context');
   const data=doc?validateData(doc.data):emptyData();let instructions=body.coaching===true?coachingInstructions(data,true):interventionContext(data,undefined,body.demo===true);if(!instructions)throw new Error('Add a problem with a topic and an overdue review before starting coaching.');let parentId:string|undefined;
   if(typeof body.parentId==='string'){
     const {data:parent}=await db.from('fo_requests').select('id,status,conversation_id').eq('user_id',user.id).eq('id',body.parentId).single();
     if(!parent?.conversation_id||!['approval_required','complete'].includes(parent.status)||typeof body.answer!=='string'||!body.answer.trim()||body.answer.length>2000)throw new Error('Invalid reply');
     parentId=parent.id;instructions='Ryluno study conversation. The user replies: '+body.answer.trim()+'\nKeep this a text study conversation. Do not call, message anyone outside this conversation, spend, create schedules, or modify connected services. Suggest study changes for confirmation in Ryluno only.';
   }
   const ticket=seal({owner:user.id,instructions,kind:body.coaching===true?'coaching':body.demo===true?'demo':'text',parentId,expires:Date.now()+600000,nonce:randomBytes(16).toString('hex')},user.id);
   return json({ticket,instructions});
 }
 if(action==='send'){
   if(body.confirmed!==true||typeof body.ticket!=='string')throw new Error('Review and confirm the message first');
   const draft=unseal<{owner:string;instructions:string;kind:string;expires:number;nonce:string;parentId?:string}>(body.ticket,user.id);
   if(draft.owner!==user.id||draft.expires<Date.now())throw new Error('Preview expired. Prepare another.');
   const key=`manual:${draft.nonce}`;
   const {data:existing}=await db.from('fo_requests').select('id').eq('user_id',user.id).eq('dedupe_key',key).maybeSingle();if(existing)return json({history:await history(user.id)});
   const {data:unresolved,error:pendingError}=await db.from('fo_requests').select('id').eq('user_id',user.id).in('status',['sending','unknown','working','approval_required']);if(pendingError||unresolved?.some(r=>r.id!==draft.parentId))throw new Error('Resolve the pending Fo request before sending another.');
   let conversationId:string|undefined;
   if(draft.parentId){const {data:parent}=await db.from('fo_requests').select('conversation_id,status').eq('user_id',user.id).eq('id',draft.parentId).single();if(!parent?.conversation_id||!['approval_required','complete'].includes(parent.status))throw new Error('Invalid reply target');conversationId=parent.conversation_id;}
   const {data:row,error}=await db.from('fo_requests').insert({user_id:user.id,dedupe_key:key,kind:draft.kind,instructions:draft.instructions,conversation_id:conversationId}).select('id').single();if(error)throw new Error('Could not reserve request');
   await dispatchText(user.id,row.id);if(draft.parentId)await db.from('fo_requests').update({status:'answered'}).eq('user_id',user.id).eq('id',draft.parentId).eq('status','approval_required');return json({history:await history(user.id)});
 }
 return json({message:'Unsupported operation'},405);
 });
 }catch(error){return json({message:error instanceof Error&&/^(Connect|Another|Delivery|Reconnect|Review|Preview|Resolve|Automatic|Could not|Sign in|No reply|Invalid|Configure)/.test(error.message)?error.message:'Fo could not complete this operation. Refresh status before retrying.'},400);}
}
export {handle as GET,handle as POST};
