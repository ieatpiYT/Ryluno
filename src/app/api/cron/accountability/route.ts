import { adminClient } from '@/lib/supabase/server';
import { equalSecret } from '@/lib/fo/policy';
import { dispatchText, pollRequest, withFoLock } from '@/lib/fo/production';
import { interventionContext, missedSession, quietHours, type Preferences } from '@/lib/fo/accountability';
import { validateData } from '@/lib/storage';
import { coachingInstructions, coachingTopic } from '@/lib/coaching';
export const maxDuration=60;
export async function GET(request:Request){
 if((process.env.CRON_SECRET?.length??0)<32||!equalSecret(request.headers.get('authorization')??'',`Bearer ${process.env.CRON_SECRET}`))return Response.json({message:'Unauthorized'},{status:401});
 if(process.env.FO_AUTOMATION_VERIFIED!=='true')return Response.json({status:'disabled',message:'Live automation has not been verified.'});
 const db=adminClient();const now=new Date();
 // One dispatch per invocation bounds execution time. Persisted preference timestamps rotate users fairly.
 const {data:owners,error}=await db.from('accountability_preferences').select().eq('enabled',true).order('updated_at').limit(50);
 if(error)return Response.json({message:'Database unavailable'},{status:503});
 for(const candidate of owners??[]){
  try{const sent=await withFoLock(candidate.user_id,async()=>{
   const {data:p}=await db.from('accountability_preferences').select().eq('user_id',candidate.user_id).single();
   if(!p?.enabled||!p.consent_at)return false;
   await db.from('accountability_preferences').update({updated_at:now.toISOString()}).eq('user_id',p.user_id);
   const {data:waiting}=await db.from('fo_requests').select('id').eq('user_id',p.user_id).eq('status','working').order('updated_at').limit(1);
   if(waiting?.[0]){await pollRequest(p.user_id,waiting[0].id);return true;}
   if(quietHours(p as Preferences,now))return false;
   const {data:doc}=await db.from('study_documents').select('data,revision').eq('user_id',p.user_id).maybeSingle();if(!doc)return false;
   const data=validateData(doc.data),session=missedSession(data,now),selected=coachingTopic(data,now);if(!session&&!selected)return false;
   const {data:unresolved,error:unresolvedError}=await db.from('fo_requests').select('id').eq('user_id',p.user_id).in('status',['sending','unknown','working','approval_required']).limit(1);if(unresolvedError||unresolved?.length)return false;
   // Rolling 24-hour cap is stricter than calendar-day frequency, including DST transitions.
   const {count,error:countError}=await db.from('fo_requests').select('id',{count:'exact',head:true}).eq('user_id',p.user_id).gte('created_at',new Date(now.getTime()-86400000).toISOString()).neq('status','cancelled');if(countError||count===null||count>=p.daily_limit)return false;
   const coaching=selected && coachingInstructions(data); const key=coaching?`coaching:${selected.problem.id}:${selected.prompt.topic}`:`missed:${session!.id}`;
   const {data:row,error}=await db.from('fo_requests').insert({user_id:p.user_id,dedupe_key:key,kind:coaching?'coaching':'missed',source_revision:doc.revision,session_id:coaching?null:session!.id,instructions:coaching??interventionContext(data,session),due_at:now.toISOString()}).select('id').single();if(error)return false;
   await dispatchText(p.user_id,row.id);return true;
  });if(sent)return Response.json({processed:1});}catch{/* Unknown sends remain durable and are never automatically retried. */}
 }
 return Response.json({processed:0});
}
