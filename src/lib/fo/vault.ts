import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
function key() { const k=Buffer.from(process.env.FO_TOKEN_ENCRYPTION_KEY??'', 'base64'); if(k.length!==32)throw new Error('Configure a 32-byte encryption key'); return k; }
export function seal(value:unknown,owner:string) { const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(owner));const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64'); }
export function unseal<T>(value:string,owner:string):T {const b=Buffer.from(value,'base64');const decipher=createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));decipher.setAAD(Buffer.from(owner));decipher.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(b.subarray(28)),decipher.final()]).toString('utf8'));}
