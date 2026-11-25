import { object } from './contracts.ts';
// No assumed argument mapping: enable only when authenticated discovery allows an empty input.
export function voiceSchemaAvailable(tools:unknown[]) {
 const matches=tools.filter(t=>object(t)&&t.name==='start_fo_call');
 if(matches.length!==1)return false;
 const tool=matches[0];if(!object(tool)||!object(tool.inputSchema))return false;
 const schema=tool.inputSchema;
 return schema.type==='object'
  && !['$ref','allOf','anyOf','oneOf','not','if','then','else'].some(key=>key in schema)
  && (schema.minProperties===undefined||schema.minProperties===0)
  && (schema.required===undefined||(Array.isArray(schema.required)&&schema.required.length===0));
}
export function voiceURL(value:unknown):string|undefined{
 if(!object(value))return;const candidates=Object.values(value).filter((v):v is string=>typeof v==='string');
 for(const candidate of candidates){try{const url=new URL(candidate);if(url.protocol==='https:'&&(url.hostname==='wajo.ai'||url.hostname.endsWith('.wajo.ai'))&&!url.username&&!url.password)return url.href;}catch{}}
}
