import { object } from './contracts.ts';
// No assumed argument mapping: enable only when authenticated discovery allows an empty input.
export function voiceSchemaAvailable(tools:unknown[]){const matches=tools.filter(t=>object(t)&&t.name==='start_fo_call');if(matches.length!==1)return false;const t=matches[0];return object(t)&&object(t.inputSchema)&&t.inputSchema.type==='object'&&(!t.inputSchema.required||(Array.isArray(t.inputSchema.required)&&t.inputSchema.required.length===0));}
export function voiceURL(value:unknown):string|undefined{
 if(!object(value))return;const candidates=Object.values(value).filter((v):v is string=>typeof v==='string');
 for(const candidate of candidates){try{const url=new URL(candidate);if(url.protocol==='https:'&&(url.hostname==='wajo.ai'||url.hostname.endsWith('.wajo.ai'))&&!url.username&&!url.password)return url.href;}catch{}}
}
