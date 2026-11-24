'use client';
import { useEffect, useRef, useState } from 'react';
import type { Session } from '@/lib/types';
import { FoCheckins } from './fo-checkins';
import { readFoAccess, requestFoAction } from '@/lib/fo/browser-access';

const labels: Record<string, string> = {
  loading: 'Checking local connection…', disabled: 'Not available in this environment', locked: 'Local connection locked',
  disconnected: 'Not connected to Fo', pending: 'Connection pending', authorization_required: 'Wajo authorization required',
  connected: 'Connected to Fo', error: 'Connection failed',
};
export function FoPanel({ sessions, timezone, selectedSession }: { sessions: Session[]; timezone: string; selectedSession?: string }) {
  const [status, setStatus] = useState('loading');
  const [authenticated, setAuthenticated] = useState(false);
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    readFoAccess(fetch, controller.signal)
      .then(data => { setEnabled(data.submissionEnabled === true); setStatus(data.status); setAuthenticated(data.authenticated === true); setMessage(data.message ?? ''); })
      .catch(() => { if (!controller.signal.aborted) { setStatus('error'); setMessage('Could not read connection status.'); } });
    return () => controller.abort();
  }, []);
  async function action(name: 'login' | 'connect' | 'logout' | 'status', body: object = {}) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      const result = name === 'status' ? await readFoAccess() : await requestFoAction(name, body);
      setEnabled(result.submissionEnabled === true); setStatus(result.status ?? 'error'); setMessage(result.message ?? '');
      if (typeof result.authenticated === 'boolean') setAuthenticated(result.authenticated);
      if (result.authorizationUrl) window.location.assign(result.authorizationUrl);
    } catch { setStatus('error'); setMessage('Connection request failed. No automatic retry was made.'); }
    finally { setPassword(''); inFlight.current = false; setBusy(false); }
  }
  return <section className="panel">
    <div className="section-heading"><div><h2>Fo accountability</h2><p role="status">{labels[status] ?? 'Connection unavailable'}</p></div></div>
    <p>Get a friendly text check-in. You review every message before it’s sent.</p>
    {message && <p role="status">{message}</p>}
    {!authenticated && (status === 'locked' || status === 'error') && <details className="disclosure"><summary>Connect in local development</summary><form onSubmit={event => { event.preventDefault(); void action('login', { password }); }}>
      <label className="field"><span>Local development password</span><input type="password" autoComplete="off" value={password} onChange={e => setPassword(e.target.value)} required minLength={32}/></label>
      <button disabled={busy}>Unlock local connection</button>
      <p className="subtle">Use FO_DEV_PASSWORD from your local environment file, not your Wajo password. Complete Wajo login and return here in this same browser/profile. If the local server restarts, unlock again and start a fresh connection.</p>
    </form></details>}
    {authenticated && status!=='connected' && <div className="row-actions">
      <button disabled={busy} onClick={() => void action('connect')}>{busy ? 'Connecting…' : status === 'connected' ? 'Verify connection' : 'Connect Fo'}</button>
    </div>}
<details className="disclosure"><summary>Connection settings</summary><p className="subtle">Local development only. Use this same browser for Wajo authorization and its return to Ryluno. Restarting the server requires reconnecting. Disconnect removes local credentials, not Wajo consent. Text delivery has not yet been tested live.</p><div className="row-actions"><button disabled={busy} onClick={()=>void action('status')}>Check connection</button>{authenticated&&<><button disabled={busy} onClick={()=>void action('connect')}>Verify connection</button><button disabled={busy} onClick={()=>void action('logout')}>Disconnect locally</button></>}</div></details>
    {authenticated && <FoCheckins sessions={sessions} timezone={timezone} enabled={enabled && !busy} selectedSession={selectedSession}/>}
  </section>;
}
