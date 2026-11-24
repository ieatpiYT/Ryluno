import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CheckinService } from '../src/lib/fo/checkins.ts';
import { TEXT_CONTRACTS, verifiedTextSchemas, parseFoReply, type AskFoInput, type FoReply } from '../src/lib/fo/contracts.ts';
import { ApprovalNeeded } from '../src/lib/fo/adapter.ts';
const secret = 'test-only-secret';
const body = { session: { id: 'session-1', start: '2026-01-01T12:00:00Z', end: '2026-01-01T13:00:00Z', status: 'scheduled' }, timezone: 'America/Toronto', newConversation: false };
async function fixture(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'ryluno-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return new CheckinService(dir);
}
function connection(reply: FoReply, calls: AskFoInput[]) {
  return async () => ({ ask: async (input: AskFoInput) => { calls.push(input); return reply; }, poll: async () => reply, close: async () => {} });
}
test('strict contracts reject schema drift, duplicate tools and malformed replies', () => {
  const tools = Object.entries(TEXT_CONTRACTS).map(([name, contract]) => ({ name, ...structuredClone(contract) }));
  assert.equal(verifiedTextSchemas(tools), true);
  assert.equal(verifiedTextSchemas([...tools, tools[0]]), false);
  const drift = structuredClone(tools);
  Object.assign(drift[0].inputSchema.properties, { description: { type: 'string' } });
  assert.equal(verifiedTextSchemas(drift), false);
  assert.throws(() => parseFoReply({ status: 'working', conversationId: 'private', extra: true }));
  assert.throws(() => parseFoReply({ status: 'complete', conversationId: 'private' }, true));
});
test('confirmation, signed preview, owner binding and failed connection prevent dispatch', async t => {
  const service = await fixture(t); const calls: AskFoInput[] = [];
  const draft = await service.prepare(body, 'owner', secret);
  assert.match(draft.instructions, /missed/);
  const connect = connection({ status: 'complete', conversationId: 'private' }, calls);
  await assert.rejects(service.submit({ ticket: draft.ticket }, 'owner', secret, connect));
  await assert.rejects(service.submit({ ticket: draft.ticket, confirmed: true }, 'other', secret, connect));
  await assert.rejects(service.submit({ ticket: draft.ticket + 'x', confirmed: true }, 'owner', secret, connect));
  await assert.rejects(service.submit({ ticket: draft.ticket, confirmed: true }, 'owner', secret, async () => { throw Error('offline'); }));
  assert.equal(calls.length, 0); assert.deepEqual(await service.list(), []);
});
test('durable duplicate protection and asynchronous completion use one exact send', async t => {
  const service = await fixture(t); const calls: AskFoInput[] = [];
  const draft = await service.prepare(body, 'owner', secret);
  const send = { ticket: draft.ticket, confirmed: true };
  const connect = connection({ status: 'working', conversationId: 'private', progress: 'Working' }, calls);
  const record = await service.submit(send, 'owner', secret, connect);
  assert.equal(record.status, 'working'); assert.equal(record.canPoll, true);
  assert.deepEqual(calls, [{ message: draft.instructions }]);
  await new CheckinService(service.directory).submit(send, 'owner', secret, connect);
  assert.equal(calls.length, 1);
  const second = await service.prepare({ ...body, session: { ...body.session, id: 'second' } }, 'owner', secret);
  await assert.rejects(service.submit({ ticket: second.ticket, confirmed: true }, 'owner', secret, connect));
  t.mock.method(Date, 'now', () => record.updatedAt + 2000);
  const done = await service.poll(record.id, connection({ status: 'complete', conversationId: 'private', response: 'Finished private' }, calls));
  assert.equal(done.status, 'complete'); assert.equal(done.canPoll, false);
  assert.equal(JSON.stringify(done).includes('"conversationId"'), false);
  assert.equal(done.response, 'Finished [private conversation]');
});
test('approval pauses polling and requires separately confirmed answer in same conversation', async t => {
  const service = await fixture(t); const calls: AskFoInput[] = [];
  const draft = await service.prepare(body, 'owner', secret);
  const record = await service.submit({ ticket: draft.ticket, confirmed: true }, 'owner', secret, connection({ status: 'complete', conversationId: 'private', response: 'AWAITING_USER: What did you study?' }, calls));
  assert.equal(record.status, 'approval_required'); assert.equal(record.canPoll, false);
  const follow = await service.prepare({ parentId: record.id, answer: 'Arrays' }, 'owner', secret);
  await service.submit({ ticket: follow.ticket, confirmed: true }, 'owner', secret, connection({ status: 'complete', conversationId: 'private', response: 'Nice work.' }, calls));
  assert.deepEqual(calls[1], { message: follow.instructions, conversationId: 'private' });
});
test('ambiguous sends and protocol approval are never retried', async t => {
  for (const error of [new Error('timeout'), new ApprovalNeeded()]) {
    const service = await fixture(t); let calls = 0;
    const draft = await service.prepare(body, 'owner', secret);
    const connect = async () => ({ ask: async () => { calls++; throw error; }, poll: async () => { throw Error(); }, close: async () => {} });
    const send = { ticket: draft.ticket, confirmed: true };
    const record = await service.submit(send, 'owner', secret, connect);
    assert.equal(record.status, error instanceof ApprovalNeeded ? 'approval_required' : 'unknown');
    await service.submit(send, 'owner', secret, connect); assert.equal(calls, 1);
    assert.equal(record.canReply, false); assert.equal(record.canPoll, false);
  }
});
test('concurrent submissions are rejected by exclusive journal lock', async t => {
  const service = await fixture(t); const draft = await service.prepare(body, 'owner', secret);
  let release!: () => void; let entered!: () => void;
  const ready = new Promise<void>(r => { entered = r; });
  const wait = new Promise<void>(r => { release = r; });
  const connect = async () => { entered(); await wait; return { ask: async () => ({ status: 'failed' as const, conversationId: 'private', response: 'Unavailable' }), poll: async () => { throw Error(); }, close: async () => {} }; };
  const send = { ticket: draft.ticket, confirmed: true };
  const first = service.submit(send, 'owner', secret, connect); await ready;
  await assert.rejects(service.submit(send, 'owner', secret, connect)); release();
  assert.equal((await first).status, 'failed');
});
test('poll failures preserve pending state and resume without resending', async t => {
  const service = await fixture(t); const calls: AskFoInput[] = [];
  const draft = await service.prepare(body, 'owner', secret);
  const record = await service.submit({ ticket: draft.ticket, confirmed: true }, 'owner', secret, connection({ status: 'working', conversationId: 'private' }, calls));
  let now = record.updatedAt + 2000;
  t.mock.method(Date, 'now', () => now);
  const broken = await service.poll(record.id, async () => ({ ask: async () => { throw Error('must not send'); }, poll: async () => { throw Error('network'); }, close: async () => {} }));
  assert.equal(broken.status, 'working'); assert.match(broken.error!, /not resent/);
  now += 6000;
  const failed = await service.poll(record.id, connection({ status: 'failed', conversationId: 'private', response: 'Could not finish' }, calls));
  assert.equal(failed.status, 'failed'); assert.equal(failed.canPoll, false); assert.equal(calls.length, 1);
});
