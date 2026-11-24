'use client';
import { useEffect, useRef, useState } from 'react';
import Ryluno from './ryluno';
import { browserClient, cloudConfigured } from '@/lib/supabase/browser';
import { emptyData, type Data } from '@/lib/types';
import { STORAGE_KEY, validateData } from '@/lib/storage';
export default function AccountWorkspace() {
 const [guest,setGuest]=useState(!cloudConfigured), [ready,setReady]=useState(false), [initial,setInitial]=useState<Data|null>(null);
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [account,setAccount]=useState(''),[saveState,setSaveState]=useState('Saved to your account'),[failed,setFailed]=useState(false);
 const owner=useRef(''),pendingImport=useRef(false);
 const revision=useRef(0), pending=useRef<Data|null>(null), saving=useRef(false);
 async function load() {
   const response=await fetch('/api/workspace',{cache:'no-store'});
   if(response.ok){const result=await response.json();owner.current=result.user.id;revision.current=result.document?.revision??0;setInitial(result.document?validateData(result.document.data):emptyData());setAccount(result.user.email);}
   setReady(true);
 }
 useEffect(()=>{if(!cloudConfigured)return;const timer=setTimeout(()=>void load().catch(()=>{setMessage('Could not load your account. Try reloading.');setReady(true);}),0);return()=>clearTimeout(timer);},[]);
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(pending.current){e.preventDefault();}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
 async function auth(signup:boolean){setBusy(true);setMessage('');try{const client=browserClient();const {error}=signup?await client.auth.signUp({email,password,options:{emailRedirectTo:`${location.origin}/auth/callback`}}):await client.auth.signInWithPassword({email,password});if(error)throw error;if(signup)setMessage('Check your email to confirm your account, then sign in.');await load();}catch(e){setMessage(e instanceof Error?e.message:'Sign-in failed');}finally{setPassword('');setBusy(false);}}
 async function save(data:Data,importing=false){pendingImport.current=importing;saving.current=true;setSaveState('Saving…');setFailed(false);try{const res=await fetch('/api/workspace',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({data,userId:owner.current,revision:revision.current,importing})});const result=await res.json();if(!res.ok)throw new Error(result.message);revision.current=result.revision;pending.current=null;if(importing)setInitial(data);setSaveState('Saved to your account');return true;}catch(e){setSaveState(e instanceof Error?e.message:'Save failed');setFailed(true);return false;}finally{saving.current=false;}}
 function persist(data:Data){if(pending.current){setSaveState('Finish saving or export your unsaved work before making another change.');return false;}pending.current=data;void save(data);return true;}
 async function importLocal(){try{const raw=localStorage.getItem(STORAGE_KEY);if(!raw)throw new Error('No browser data found.');const data=validateData(JSON.parse(raw));if(!confirm('Copy this browser’s study data into your empty account? This can run once. Your browser copy will be preserved.'))return;pending.current=data;if(await save(data,true))setInitial(data);}catch(e){setSaveState(e instanceof Error?e.message:'Import failed');}}
 function exportPending(){const url=URL.createObjectURL(new Blob([JSON.stringify(pending.current,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='ryluno-unsaved.json';a.click();URL.revokeObjectURL(url);}
 if(guest)return <><div className="account-bar">Device-only workspace{cloudConfigured&&<button onClick={()=>setGuest(false)}>Sign in</button>}</div><Ryluno/></>;
 if(!ready)return <main className="loading">Opening your account…</main>;
 if(initial)return <><div className="account-bar"><span>{account} · <span role="status">{saveState}</span></span><div className="row-actions">{failed&&<><button onClick={()=>{if(pending.current&&!saving.current)void save(pending.current,pendingImport.current);}}>Retry save</button><button onClick={exportPending}>Export unsaved work</button></>}{!initial.problems.length&&!initial.sessions.length&&<button onClick={()=>void importLocal()}>Import browser data</button>}<button onClick={async()=>{if(pending.current){setSaveState('Save or export your pending changes first.');return;}const {error}=await browserClient().auth.signOut();if(error){setSaveState('Could not sign out. Please try again.');return;}location.reload();}}>Sign out</button></div></div><Ryluno key={JSON.stringify(initial)} initialData={initial} persist={persist} cloud/></>;
 return <main className="loading"><section className="panel"><h1>Welcome to Ryluno</h1><p>A little practice. A plan that adapts.</p><form onSubmit={e=>{e.preventDefault();void auth(false);}}><label className="field">Email<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label className="field">Password<input type="password" autoComplete="current-password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required/></label><div className="row-actions"><button className="primary" disabled={busy}>Sign in</button><button type="button" disabled={busy||!email||password.length<8} onClick={()=>void auth(true)}>Create account</button></div></form><p role="status">{message}</p><button className="text-button" onClick={()=>setGuest(true)}>Continue on this device</button></section></main>;
}
