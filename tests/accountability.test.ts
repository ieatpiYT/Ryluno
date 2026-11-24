import test from 'node:test';
import assert from 'node:assert/strict';
import { quietHours, missedSession, interventionContext, type Preferences } from '../src/lib/fo/accountability.ts';
import { emptyData } from '../src/lib/types.ts';
import { seal, unseal } from '../src/lib/fo/vault.ts';
const prefs:Preferences={enabled:true,method:'text',timezone:'America/Toronto',quiet_start:21,quiet_end:9,daily_limit:1};
test('quiet hours use the user timezone and handle DST and all-day silence',()=>{
 assert.equal(quietHours(prefs,new Date('2026-11-24T03:00:00Z')),true);
 assert.equal(quietHours(prefs,new Date('2026-11-24T15:00:00Z')),false);
 assert.equal(quietHours(prefs,new Date('2026-03-08T07:30:00Z')),true);
 assert.equal(quietHours({...prefs,quiet_start:9,quiet_end:17},new Date('2026-11-24T15:00:00Z')),true);
 assert.equal(quietHours({...prefs,quiet_start:9,quiet_end:9}),true);
});
test('missed sessions have grace and expiry, and logged practice suppresses intervention',()=>{
 const d=emptyData();d.sessions=[{id:'s',start:'2026-11-24T14:00:00Z',end:'2026-11-24T14:25:00Z',status:'scheduled'}];
 assert.equal(missedSession(d,new Date('2026-11-24T14:30:00Z')),undefined);
 assert.equal(missedSession(d,new Date('2026-11-24T15:00:00Z'))?.id,'s');
 assert.equal(missedSession(d,new Date('2026-11-25T15:00:00Z')),undefined);
 d.problems=[{id:'p',title:'Example',url:'',topics:[],difficulty:'Easy',attempts:[{id:'a',at:'2026-11-24T14:30:00Z',minutes:25,outcome:'hints',confidence:3,notes:''}]}];
 assert.equal(missedSession(d,new Date('2026-11-24T15:00:00Z')),undefined);
 d.problems=[];d.sessions[0].status='skipped';assert.equal(missedSession(d,new Date('2026-11-24T15:00:00Z')),undefined);
});
test('demo context is explicitly labelled and never authorizes commitment changes or calls',()=>{
 const value=interventionContext(emptyData(),undefined,true);assert.match(value,/DEMO EVENT/);assert.match(value,/ask for confirmation/);assert.match(value,/Do not call, text, email/);
});
test('encrypted tokens are authenticated, randomized, and bound to the account',()=>{
 process.env.FO_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');
 const first=seal({access_token:'private'},'a'),second=seal({access_token:'private'},'a');
 assert.notEqual(first,second);assert.ok(!first.includes('private'));assert.deepEqual(unseal(first,'a'),{access_token:'private'});
 assert.throws(()=>unseal(first,'b'));const bytes=Buffer.from(first,'base64');bytes[bytes.length-1]^=1;assert.throws(()=>unseal(bytes.toString('base64'),'a'));
 delete process.env.FO_TOKEN_ENCRYPTION_KEY;assert.throws(()=>seal({},'a'));
});

test('browser voice only allows discovered empty inputs and HTTPS Wajo links',async()=>{
 const {voiceSchemaAvailable,voiceURL}=await import('../src/lib/fo/voice-contracts.ts');
 assert.equal(voiceSchemaAvailable([]),false);
 assert.equal(voiceSchemaAvailable([{name:'start_fo_call',inputSchema:{type:'object',required:['phone']}}]),false);
 assert.equal(voiceSchemaAvailable([{name:'start_fo_call',inputSchema:{type:'object',required:[]}}]),true);
 assert.equal(voiceURL({url:'https://wajo.ai/call/example'}),'https://wajo.ai/call/example');
 for(const url of ['javascript:alert(1)','http://wajo.ai/call','https://wajo.ai.evil.test/call','https://user:password@wajo.ai/call'])assert.equal(voiceURL({url}),undefined);
});
