// Verified from the website-authenticated tools/list supplied on 2026-11-21.
export type AskFoInput = { message: string; conversationId?: string; newConversation?: boolean };
export type FoReply = { status: 'complete' | 'working' | 'failed'; conversationId: string; response?: string; progress?: string; elapsedSeconds?: number };
const outputProperties = {
  response: { type: 'string' }, status: { type: 'string', enum: ['complete', 'working', 'failed'] },
  conversationId: { type: 'string' }, progress: { type: 'string' }, elapsedSeconds: { type: 'integer' },
};
export const TEXT_CONTRACTS = {
  ask_fo: {
    inputSchema: { type: 'object', properties: { message: { type: 'string' }, conversationId: { type: 'string' }, newConversation: { type: 'boolean' } }, required: ['message'], additionalProperties: false },
    outputSchema: { type: 'object', properties: outputProperties, required: ['status', 'conversationId'], additionalProperties: false },
  },
  get_fo_reply: {
    inputSchema: { type: 'object', properties: { conversationId: { type: 'string' }, waitSeconds: { type: 'integer', minimum: 0, maximum: 40 } }, additionalProperties: false },
    outputSchema: { type: 'object', properties: outputProperties, required: ['response', 'status', 'conversationId'], additionalProperties: false },
  },
};
export function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical).sort();
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).filter(k => !['description', 'title', '$schema'].includes(k)).sort().map(k => [k, canonical(value[k])]));
}
export function verifiedTextSchemas(tools: unknown[]): boolean {
  return Object.entries(TEXT_CONTRACTS).every(([name, contract]) => {
    const tool = tools.find(t => object(t) && t.name === name);
    return object(tool) && ['inputSchema', 'outputSchema'].every(k =>
      JSON.stringify(canonical(tool[k])) === JSON.stringify(canonical(contract[k as keyof typeof contract])));
  });
}
export function parseFoReply(value: unknown, requireResponse = false): FoReply {
  if (!object(value) || !['complete', 'working', 'failed'].includes(String(value.status))
    || typeof value.conversationId !== 'string' || !value.conversationId || value.conversationId.length > 2048
    || (requireResponse && typeof value.response !== 'string')
    || (value.response !== undefined && (typeof value.response !== 'string' || value.response.length > 100_000))
    || (value.progress !== undefined && (typeof value.progress !== 'string' || value.progress.length > 10_000))
    || (value.elapsedSeconds !== undefined && !Number.isInteger(value.elapsedSeconds))
    || Object.keys(value).some(k => !Object.hasOwn(outputProperties, k))) throw new Error('Unexpected Fo reply format');
  return value as FoReply;
}
export function asksForAnswer(reply: FoReply) {
  // Fo has no structured approval flag. Conservative text detection pauses polling;
  // it never approves anything or automatically sends an answer.
  return /AWAITING_USER:|\?|waiting for (?:your|the user.?s) (?:answer|reply|response|approval|confirmation)|(?:please|need you to) (?:confirm|approve|clarify)/i.test(`${reply.response ?? ''}\n${reply.progress ?? ''}`);
}
