import 'server-only';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { FO_URL, type FoProvider } from './client';
import { voiceSchemaAvailable, voiceURL } from './voice-contracts';
export { voiceSchemaAvailable } from './voice-contracts';
export async function startBrowserVoice(provider:FoProvider){
 const token=provider.tokens()?.access_token;if(!token)throw new Error('Connect Fo first');let dispatched=false;
 const guarded:typeof fetch=async(input,init)=>{if(new URL(input instanceof Request?input.url:String(input)).href!==FO_URL)throw new Error('Unexpected destination');if(typeof init?.body==='string'){const rpc=JSON.parse(init.body);if(rpc.method==='tools/call'){if(rpc.params?.name!=='start_fo_call'||dispatched)throw new Error('Duplicate call blocked');dispatched=true;}}return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(45000)});};
 const transport=new StreamableHTTPClientTransport(new URL(FO_URL),{authProvider:{token:async()=>token},fetch:guarded,reconnectionOptions:{maxRetries:0,initialReconnectionDelay:1000,maxReconnectionDelay:1000,reconnectionDelayGrowFactor:1}});
 const client=new Client({name:'ryluno-browser-voice',version:'1.0.0'},{inputRequired:{autoFulfill:false}});
 try{await client.connect(transport);if(!voiceSchemaAvailable((await client.listTools()).tools))throw new Error('Browser voice schema requires verification');const result=await client.callTool({name:'start_fo_call',arguments:{}},{timeout:50000});if(result.isError)throw new Error('Voice request failed');const url=voiceURL(result.structuredContent);if(!url)throw new Error('Voice result format requires verification; check Fo directly');return url;}finally{await client.close().catch(()=>{});}
}
