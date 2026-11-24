'use client';
import { useEffect, useRef, useState } from 'react';
import type { Session } from '@/lib/types';
import type { CheckinDraft, CheckinView } from '@/lib/fo/checkin-types';
import { Dialog } from './dialog';

async function request<T>(action: string, body?: object): Promise<T> {
  const response = await fetch(`/api/fo/${action}`, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? 'Fo request failed.');
  return data;
}
const labels = { sending: 'Sending or interrupted — do not resend', working: 'Fo is working', complete: 'Reply received', failed: 'Fo could not complete this request', approval_required: 'Your answer or approval is needed', unknown: 'Delivery uncertain — do not resend' };
export function FoCheckins({ sessions, timezone, enabled }: { sessions: Session[]; timezone: string; enabled: boolean }) {
  const [now] = useState(() => Date.now());
  const [records, setRecords] = useState<CheckinView[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [newConversation, setNewConversation] = useState(false);
  const [draft, setDraft] = useState<CheckinDraft>();
  const [confirmed, setConfirmed] = useState(false);
  const [answer, setAnswer] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const lock = useRef(false);
  const until = useRef(0);
  const merge = (record: CheckinView) => setRecords(old => [...old.filter(r => r.id !== record.id), record]);
  useEffect(() => {
    let active = true;
    request<{ records: CheckinView[] }>('check-ins').then(data => { if (active) setRecords(data.records); })
      .catch(() => { if (active) setMessage('Could not load saved check-ins. Refresh saved status before continuing.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!polling || !enabled) return;
    const record = records.find(r => r.canPoll);
    if (!record) return;
    let active = true;
    const timer = setTimeout(async () => {
      if (!active) return;
      if (Date.now() >= until.current) { setPolling(false); setMessage('Fo is still working, even if you leave. Select Keep waiting to check for another ten minutes.'); return; }
      if (lock.current) return;
      lock.current = true;
      try {
        const next = await request<CheckinView>('reply', { id: record.id });
        if (active) { merge(next); if (!next.canPoll) setPolling(false); if (next.error) { setPolling(false); setMessage(next.error); } }
      } catch (error) { if (active) { setPolling(false); setMessage((error as Error).message); } }
      finally { lock.current = false; }
    }, 1600);
    return () => { active = false; clearTimeout(timer); };
  }, [records, polling, enabled]);
  async function perform(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try { await work(); } catch (error) { setPolling(false); setMessage((error as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  function wait() { until.current = Date.now() + 600_000; setPolling(true); }
  async function preview(body: object) {
    await perform(async () => { setDraft(await request<CheckinDraft>('prepare', body)); setConfirmed(false); });
  }
  const session = sessions.find(s => s.id === sessionId);
  return <div>
    <p className="subtle">Text only. Every message requires your approval. Voice is disabled. Fo is instructed not to act outside this chat.</p>
    {!enabled && <p>Verify the connection and tool schemas to enable check-ins.</p>}
    {message && <p role="status">{message}</p>}
    <label className="field"><span>Study session for check-in</span><select value={sessionId} onChange={e => setSessionId(e.target.value)}>
      <option value="">Choose a session</option>{sessions.map(s => <option key={s.id} value={s.id}>{new Date(s.start).toLocaleString(undefined, { timeZone: timezone })} · {s.status === 'scheduled' && Date.parse(s.end) < now ? 'missed' : s.status}</option>)}
    </select></label>
    <label className="checkbox"><input type="checkbox" checked={newConversation} onChange={e => setNewConversation(e.target.checked)}/> Start a fresh Fo conversation</label>
    <button disabled={!enabled || !session || busy || polling} onClick={() => void preview({ session, timezone, newConversation })}>Request Fo check-in</button>
    <button disabled={busy || polling} onClick={() => void perform(async () => { setRecords((await request<{ records: CheckinView[] }>('check-ins')).records); })}>Refresh saved status</button>
    {records.some(r => r.canPoll) && <button disabled={!enabled || busy} onClick={() => polling ? setPolling(false) : wait()}>{polling ? 'Pause reply checking' : 'Keep waiting for reply'}</button>}
    {records.map(record => <article key={record.id} className="panel" aria-live="polite">
      <h3>{labels[record.status]}</h3>
      <p className="subtle">{new Date(record.createdAt).toLocaleString()}</p>
      <details><summary>Approved instructions</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{record.instructions}</pre></details>
      {record.progress && <p>{record.progress}</p>}{record.response && <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{record.response}</p>}{record.error && <p>{record.error}</p>}
      {record.canReply && <form onSubmit={e => { e.preventDefault(); void preview({ parentId: record.id, answer }); }}>
        <label className="field"><span>Your text reply (review before sending)</span><textarea required maxLength={2000} value={answer} onChange={e => setAnswer(e.target.value)}/></label>
        <button disabled={!enabled || busy || polling || !answer.trim()}>Review reply</button>
      </form>}
    </article>)}
    {draft && <Dialog title="Review Fo check-in" description="These exact instructions will be sent. The preview expires in ten minutes." onClose={() => { if (!busy) setDraft(undefined); }}>
      <p>{draft.newConversation ? 'Start a fresh conversation.' : 'Continue the current conversation (or this check-in’s thread for a reply).'}</p>
      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{draft.instructions}</pre>
      <label className="checkbox"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/> I approve sending these exact instructions to Fo.</label>
      <button disabled={!confirmed || !enabled || busy} onClick={() => void perform(async () => {
        const ticket = draft.ticket;
        setDraft(undefined); setConfirmed(false);
        // Never retry a send, including after an ambiguous network failure.
        const record = await request<CheckinView>('check-in', { ticket, confirmed: true });
        merge(record); setAnswer(''); if (record.canPoll) wait();
      })}>Confirm and send text</button>
    </Dialog>}
  </div>;
}
