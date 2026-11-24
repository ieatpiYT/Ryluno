import 'server-only';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Session } from '../types.ts';
import { object, asksForAnswer, type FoReply } from './contracts.ts';
import { equalSecret } from './policy.ts';
import { ApprovalNeeded, type TextConnection } from './adapter.ts';
import type { CheckinDraft, CheckinStatus, CheckinView } from './checkin-types.ts';

type DraftPayload = { id: string; sessionId: string; instructions: string; newConversation: boolean; parentId?: string; expires: number };
type RecordEntry = DraftPayload & { status: CheckinStatus; conversationId?: string; response?: string; progress?: string; error?: string; createdAt: number; updatedAt: number; nextPollAt?: number; superseded?: boolean };
type Journal = { version: 1; records: RecordEntry[] };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export class CheckinError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) { super(message); this.statusCode = statusCode; }
}
function sessionFrom(value: unknown): Session {
  if (!object(value) || typeof value.id !== 'string' || !value.id || value.id.length > 200
    || typeof value.start !== 'string' || typeof value.end !== 'string'
    || !Number.isFinite(Date.parse(value.start)) || !Number.isFinite(Date.parse(value.end))
    || Date.parse(value.end) <= Date.parse(value.start)
    || !['scheduled', 'completed', 'skipped'].includes(String(value.status))) throw new CheckinError('Choose a valid study session.');
  return value as Session;
}
function view(record: RecordEntry): CheckinView {
  const hide = (text?: string) => record.conversationId ? text?.split(record.conversationId).join('[private conversation]') : text;
  return { id: record.id, sessionId: record.sessionId, status: record.status, instructions: record.instructions,
    response: hide(record.response), progress: hide(record.progress), error: record.error, createdAt: record.createdAt, updatedAt: record.updatedAt,
    canReply: !record.superseded && !!record.conversationId && ['complete', 'approval_required'].includes(record.status),
    canPoll: !!record.conversationId && record.status === 'working' };
}
const TEXT_BOUNDARY = 'Reply in text only. Do not call anyone, send emails or messages outside this chat, change calendars, make purchases, or use other connected services. If you need my answer or approval, begin your response with AWAITING_USER: and stop until I reply.';

/** One local owner, durable write-before-send journal, exclusive cross-process lock. */
export class CheckinService {
  directory: string;
  constructor(directory = join(process.cwd(), '.ryluno-fo')) { this.directory = directory; }
  private async read(): Promise<Journal> {
    try {
      const data = JSON.parse(await readFile(join(this.directory, 'requests.json'), 'utf8'));
      if (!object(data) || data.version !== 1 || !Array.isArray(data.records) || data.records.length > 1000
        || data.records.some(r => !object(r) || typeof r.id !== 'string' || typeof r.sessionId !== 'string'
          || typeof r.instructions !== 'string' || typeof r.newConversation !== 'boolean'
          || !['sending', 'working', 'complete', 'failed', 'approval_required', 'unknown'].includes(String(r.status))
          || !Number.isFinite(r.createdAt) || !Number.isFinite(r.updatedAt)
          || ['conversationId', 'response', 'progress', 'error', 'parentId'].some(k => r[k] !== undefined && typeof r[k] !== 'string'))
        || new Set(data.records.map(r => r.id)).size !== data.records.length) throw new Error('Invalid journal');
      return data as Journal;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, records: [] };
      throw new CheckinError('The private request journal could not be read. Sending is blocked to prevent duplicates.', 503);
    }
  }
  private async write(journal: Journal) {
    const temporary = join(this.directory, `${randomUUID()}.tmp`);
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(journal)); await file.sync(); } finally { await file.close(); }
    await rename(temporary, join(this.directory, 'requests.json'));
  }
  private async locked<T>(work: (journal: Journal) => Promise<T>): Promise<T> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    let lock;
    try { lock = await open(join(this.directory, 'operation.lock'), 'wx', 0o600); }
    catch { throw new CheckinError('A Fo operation is in progress or was interrupted. No duplicate request was sent.', 409); }
    try { return await work(await this.read()); }
    finally { await lock.close(); await unlink(join(this.directory, 'operation.lock')); }
  }
  async list() { return (await this.read()).records.map(view); }
  async prepare(body: Record<string, unknown>, owner: string, secret: string): Promise<CheckinDraft> {
    const journal = await this.read();
    let payload: DraftPayload;
    if (typeof body.parentId === 'string') {
      const parent = journal.records.find(r => r.id === body.parentId);
      if (!parent || !view(parent).canReply) throw new CheckinError('This reply cannot be continued yet.');
      if (typeof body.answer !== 'string' || !body.answer.trim() || body.answer.length > 2000) throw new CheckinError('Enter a reply of 1–2000 characters.');
      payload = { id: digest(`reply:${parent.id}`), sessionId: parent.sessionId, parentId: parent.id,
        instructions: `${body.answer.trim()}\n\n${TEXT_BOUNDARY}`, newConversation: false, expires: Date.now() + 600_000 };
    } else {
      const session = sessionFrom(body.session);
      if (typeof body.timezone !== 'string' || body.timezone.length > 80 || typeof body.newConversation !== 'boolean') throw new CheckinError('Choose a valid timezone and conversation option.');
      try { new Intl.DateTimeFormat('en', { timeZone: body.timezone }).format(); } catch { throw new CheckinError('Invalid timezone.'); }
      const status = session.status === 'scheduled' && Date.parse(session.end) < Date.now() ? 'missed (scheduled session ended without being marked complete)' : session.status;
      payload = { id: digest(`session:${session.id}`), sessionId: session.id, newConversation: body.newConversation, expires: Date.now() + 600_000,
        instructions: `Please give me a friendly text-only accountability check-in for my technical interview study session.\nStart: ${new Date(session.start).toISOString()}\nEnd: ${new Date(session.end).toISOString()}\nTimezone: ${body.timezone}\nSession status: ${status}\nAsk whether I studied, what I practiced, and one small next step. Be encouraging about missed sessions.\n${TEXT_BOUNDARY}` };
    }
    if (journal.records.some(r => r.id === payload.id)) throw new CheckinError('This check-in or reply has already been submitted. Read its saved status instead.', 409);
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', secret).update(`${owner}:${encoded}`).digest('hex');
    return { ticket: `${encoded}.${signature}`, instructions: payload.instructions, sessionId: payload.sessionId, newConversation: payload.newConversation };
  }
  private verify(ticket: unknown, owner: string, secret: string): DraftPayload {
    if (typeof ticket !== 'string' || ticket.length > 12000) throw new CheckinError('Review a fresh check-in preview.');
    const [encoded, signature, extra] = ticket.split('.');
    if (!encoded || !signature || extra || !equalSecret(signature, createHmac('sha256', secret).update(`${owner}:${encoded}`).digest('hex'))) throw new CheckinError('The preview is invalid or belongs to another local login.');
    try {
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as DraftPayload;
      if (payload.expires <= Date.now()) throw new Error('Expired');
      return payload;
    } catch { throw new CheckinError('This preview expired. Review a fresh preview before sending.'); }
  }
  async submit(body: Record<string, unknown>, owner: string, secret: string, connect: () => Promise<TextConnection>) {
    if (body.confirmed !== true) throw new CheckinError('Explicit confirmation of the exact preview is required.', 403);
    const payload = this.verify(body.ticket, owner, secret);
    return this.locked(async journal => {
      const existing = journal.records.find(r => r.id === payload.id);
      if (existing) return view(existing);
      if (journal.records.some(r => ['sending', 'working', 'unknown'].includes(r.status) || (r.status === 'approval_required' && !r.superseded && r.id !== payload.parentId))) throw new CheckinError('A prior request is still working, needs your answer, or has uncertain delivery. Another message is blocked.', 409);
      const parent = payload.parentId ? journal.records.find(r => r.id === payload.parentId) : undefined;
      if (payload.parentId && (!parent || !view(parent).canReply)) throw new CheckinError('The previous reply is no longer available to continue.', 409);
      if (journal.records.length >= 1000) throw new CheckinError('The local request journal is full. Sending is blocked.', 409);
      // Verify auth and live schemas BEFORE reserving a dispatch. No tool runs here.
      const connection = await connect();
      const record: RecordEntry = { ...payload, status: 'sending', createdAt: Date.now(), updatedAt: Date.now() };
      try {
        journal.records.push(record);
        if (parent) parent.superseded = true;
        await this.write(journal);
        try {
          const reply = await connection.ask(parent?.conversationId
            ? { message: payload.instructions, conversationId: parent.conversationId }
            : { message: payload.instructions, ...(payload.newConversation ? { newConversation: true } : {}) });
          this.apply(record, reply);
        } catch (error) {
          record.status = error instanceof ApprovalNeeded ? 'approval_required' : 'unknown';
          record.error = error instanceof ApprovalNeeded
            ? 'Fo requested protocol-level approval. Nothing was auto-approved; inspect Fo directly before continuing.'
            : 'Delivery is uncertain. This message will not be resent automatically. Check Fo directly before attempting other messages.';
        }
        record.updatedAt = Date.now();
        await this.write(journal);
        return view(record);
      } finally { await connection.close(); }
    });
  }
  private apply(record: RecordEntry, reply: FoReply) {
    if (record.conversationId && record.conversationId !== reply.conversationId) throw new Error('Unexpected conversation');
    record.conversationId = reply.conversationId;
    record.response = reply.response; record.progress = reply.progress; record.error = undefined;
    record.status = reply.status === 'failed' ? 'failed' : asksForAnswer(reply) ? 'approval_required' : reply.status;
    record.updatedAt = Date.now(); record.nextPollAt = Date.now() + 1500;
  }
  async poll(id: unknown, connect: () => Promise<TextConnection>) {
    if (typeof id !== 'string') throw new CheckinError('Choose a saved check-in.');
    return this.locked(async journal => {
      const record = journal.records.find(r => r.id === id);
      if (!record) throw new CheckinError('Check-in not found.', 404);
      if (!view(record).canPoll || Date.now() < (record.nextPollAt ?? 0)) return view(record);
      const connection = await connect();
      try {
        try { this.apply(record, await connection.poll(record.conversationId!)); }
        catch {
          record.error = 'Reply retrieval failed. Your original message was not resent. Resume checking when ready.';
          record.nextPollAt = Date.now() + 5000;
        }
        await this.write(journal);
        return view(record);
      } finally { await connection.close(); }
    });
  }
}
