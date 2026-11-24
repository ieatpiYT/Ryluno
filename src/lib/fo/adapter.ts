import 'server-only';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { FO_URL, type FoProvider } from './client.ts';
import { parseFoReply, verifiedTextSchemas, object, type AskFoInput, type FoReply } from './contracts.ts';

export type TextConnection = { ask: (input: AskFoInput) => Promise<FoReply>; poll: (conversationId: string) => Promise<FoReply>; close: () => Promise<void> };
export class ApprovalNeeded extends Error {}

export async function openTextConnection(provider: FoProvider): Promise<TextConnection> {
  const token = provider.tokens()?.access_token;
  if (!token) throw new Error('Verify the Fo connection first');
  let askDispatched = false;
  const guardedFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.href !== FO_URL) throw new Error('Unexpected Fo destination');
    if (typeof init?.body === 'string') {
      const rpc: unknown = JSON.parse(init.body);
      if (object(rpc) && rpc.method === 'tools/call') {
        if (!object(rpc.params) || !['ask_fo', 'get_fo_reply'].includes(String(rpc.params.name))) throw new Error('Tool not allowed');
        if (rpc.params.name === 'ask_fo') {
          if (askDispatched) throw new Error('Automatic resubmission blocked');
          askDispatched = true;
        }
      }
    }
    try {
      return await fetch(input, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.any([
        ...(init?.signal ? [init.signal] : []), AbortSignal.timeout(55_000),
      ]) });
    } catch { throw new Error('Fo request did not return a confirmed result'); }
  };
  // Static bearer auth deliberately has no refresh/retry handler on tool calls.
  // Explicit Verify connection uses the original OAuth provider when needed.
  const connection = new StreamableHTTPClientTransport(new URL(FO_URL), {
    authProvider: { token: async () => token }, fetch: guardedFetch,
    reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 },
  });
  const client = new Client({ name: 'ryluno-text-checkins', version: '0.1.0' });
  try {
    await client.connect(connection);
    if (!verifiedTextSchemas((await client.listTools()).tools)) throw new Error('Fo schemas changed; submission blocked');
  } catch { await client.close().catch(() => {}); throw new Error('Could not verify Fo connection and text schemas. Use Verify connection. Nothing was sent.'); }
  async function invoke(name: 'ask_fo' | 'get_fo_reply', args: Record<string, unknown>) {
    const result = await client.callTool({ name, arguments: args }, { timeout: 60_000 });
    if (object(result) && (result.type === 'input_required' || result.resultType === 'input_required')) throw new ApprovalNeeded('Fo requires additional approval');
    if (result.isError) throw new Error('Fo tool returned an error; delivery may have occurred');
    return parseFoReply(result.structuredContent, name === 'get_fo_reply');
  }
  return {
    ask: input => invoke('ask_fo', { ...input }),
    poll: conversationId => invoke('get_fo_reply', { conversationId, waitSeconds: 10 }),
    close: () => client.close().catch(() => {}),
  };
}
