import 'server-only';
import { randomBytes } from 'node:crypto';
import { FoProvider, inspectFo, transport } from './client.ts';
import { allowedRequest, blockedSubmission, consumeState, equalSecret } from './policy.ts';
import { verifiedTextSchemas } from './contracts.ts';
import { openTextConnection } from './adapter.ts';
import { CheckinService, CheckinError } from './checkins.ts';
const checkins = new CheckinService();

type Owner = { id: string; expires: number; provider: FoProvider; status: string; busy: boolean; tools: unknown[] };
// One process, one authenticated owner. Hot reload preserves this state; restart clears it.
const globalFo = globalThis as typeof globalThis & { rylunoFo?: { owner?: Owner; nextLogin: number } };
const state = globalFo.rylunoFo ??= { nextLogin: 0 };
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
function accessFor(request: Request) {
  const cookie = request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith('ryluno_fo='))?.slice(10);
  if (!cookie) return { reason: 'missing_cookie' as const };
  if (!state.owner) return { reason: 'server_session_missing' as const };
  if (state.owner.expires <= Date.now()) { state.owner = undefined; return { reason: 'expired_session' as const }; }
  if (!equalSecret(cookie, state.owner.id)) return { reason: 'session_mismatch' as const };
  return { owner: state.owner };
}
export async function handleFo(request: Request, action: string) {
  if (!allowedRequest(request)) return json({ status: 'disabled', message: 'Fo requires enabled, authenticated localhost development. See docs/fo-integration.md.' }, 403);
  if (action === 'login' && request.method === 'POST') {
    if (Date.now() < state.nextLogin) return json({ message: 'Wait a few seconds before trying again.' }, 429);
    state.nextLogin = Date.now() + 3000;
    const body = await readBody(request);
    if (typeof body.password !== 'string' || !equalSecret(body.password, process.env.FO_DEV_PASSWORD!)) return json({ message: 'Invalid development password.' }, 401);
    // Re-unlocking this browser must not discard its pending PKCE/state or tokens.
    const existing = accessFor(request).owner;
    if (existing) return json({ status: existing.status, authenticated: true });
    state.owner = { id: randomBytes(32).toString('hex'), expires: Date.now() + 3_600_000, provider: new FoProvider(), status: 'disconnected', busy: false, tools: [] };
    const response = json({ status: 'disconnected', authenticated: true });
    response.headers.set('Set-Cookie', `ryluno_fo=${state.owner.id}; HttpOnly; SameSite=Lax; Path=/api/fo; Max-Age=3600`);
    return response;
  }
  const { owner, reason } = accessFor(request);
  if (!owner) {
    const explanations = {
      missing_cookie: 'This browser did not send the local unlock cookie.',
      server_session_missing: 'The local server no longer has this unlock session (for example, after a restart).',
      expired_session: 'The local unlock session expired.',
      session_mismatch: 'This browser’s unlock session was replaced by another local login.',
    };
    return json({ status: 'locked', authenticated: false, reason, message: `${explanations[reason!]} Open http://localhost:3000 in this same browser, go to Preferences → Fo accountability, and select Unlock local connection with your local development password. Then select Connect Fo to start a fresh authorization. Do not reload the old callback URL.` }, 401);
  }
  const submissionEnabled = owner.status === 'connected' && verifiedTextSchemas(owner.tools);
  if (action === 'status' && request.method === 'GET') return json({ status: owner.status, authenticated: true, submissionEnabled, schemasAvailable: owner.tools.length > 0 });
  if (action === 'schemas' && request.method === 'GET') return json({ tools: owner.tools });
  if (action === 'logout' && request.method === 'POST') {
    state.owner = undefined;
    const response = json({ status: 'locked', authenticated: false });
    response.headers.set('Set-Cookie', 'ryluno_fo=; HttpOnly; SameSite=Lax; Path=/api/fo; Max-Age=0');
    return response;
  }
  if ((action === 'check-ins' && request.method === 'GET') || (['prepare', 'check-in', 'reply'].includes(action) && request.method === 'POST')) {
    try {
      if (action === 'check-ins') return json({ records: await checkins.list() });
      const body = await readBody(request);
      if (!submissionEnabled) return json({ ...blockedSubmission(body.confirmed), message: 'Verify the Fo connection and text schemas before continuing.' }, 409);
      if (owner.busy) return json({ message: 'A Fo operation is already in progress.' }, 409);
      if (action === 'prepare') return json(await checkins.prepare(body, owner.id, process.env.FO_DEV_PASSWORD!));
      owner.busy = true;
      try {
        const connect = async () => {
          const connection = await openTextConnection(owner.provider);
          if (accessFor(request).owner !== owner) { await connection.close(); throw new CheckinError('Unlock session expired. Nothing was sent.', 401); }
          return connection;
        };
        return json(action === 'check-in'
          ? await checkins.submit(body, owner.id, process.env.FO_DEV_PASSWORD!, connect)
          : await checkins.poll(body.id, connect));
      } finally { owner.busy = false; }
    } catch (error) {
      return json({ message: error instanceof CheckinError ? error.message : 'Fo operation could not finish. Refresh saved status before continuing; do not resend.' }, error instanceof CheckinError ? error.statusCode : 502);
    }
  }
  if (owner.busy) return json({ status: 'pending', message: 'A connection operation is already in progress. No second operation was started.' }, 409);
  if (action === 'connect' && request.method === 'POST') {
    owner.busy = true; owner.status = 'pending';
    try {
      const result = await inspectFo(owner.provider);
      owner.status = result.status; owner.tools = result.tools;
      return json({ status: owner.status, authenticated: true, submissionEnabled: owner.status === 'connected' && verifiedTextSchemas(owner.tools), authorizationUrl: owner.provider.authorizationUrl });
    } catch { owner.status = 'error'; return json({ status: 'error', message: 'Fo connection failed. Check network access and Wajo client registration. No check-in was sent.' }, 502); }
    finally { owner.busy = false; }
  }
  if (action === 'callback' && request.method === 'GET') {
    const params = new URL(request.url).searchParams;
    if (!consumeState(owner.provider.flow, params.get('state'))) return json({ message: 'Invalid, expired, or already-used OAuth state.' }, 400);
    owner.busy = true;
    try {
      if (params.has('error') || !params.get('code')) throw new Error('Authorization declined');
      const connection = transport(owner.provider);
      try { await connection.finishAuth(params); } finally { await connection.close().catch(() => {}); }
      const result = await inspectFo(owner.provider);
      owner.status = result.status; owner.tools = result.tools;
    } catch { owner.status = 'error'; }
    finally { owner.busy = false; }
    return new Response(null, { status: 303, headers: { Location: '/', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  }
  return json({ message: 'Unsupported operation.' }, 405);
}
async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) return {};
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 32768) { await reader.cancel(); return {}; } chunks.push(value);
    }
    const value = JSON.parse(Buffer.concat(chunks).toString());
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
