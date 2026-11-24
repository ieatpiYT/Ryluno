import 'server-only';
import { randomBytes } from 'node:crypto';
import { Client, StreamableHTTPClientTransport, UnauthorizedError } from '@modelcontextprotocol/client';
import type { OAuthClientProvider, OAuthClientInformationContext, OAuthDiscoveryState } from '@modelcontextprotocol/client';

export const FO_URL = 'https://mcp.api.wajo.ai/fo';
const ISSUER = 'https://mcp.api.wajo.ai';
type Tokens = Awaited<ReturnType<OAuthClientProvider['tokens']>>;
type Information = Awaited<ReturnType<OAuthClientProvider['clientInformation']>>;

export type ProviderSnapshot = {info: Information; tokens: Tokens; verifier:string; flow:{state:string;expires:number}};

/** OAuth state stays server-side. Production callers persist only encrypted snapshots. */
export class FoProvider implements OAuthClientProvider {
  readonly redirectUrl: string;
  constructor(redirectUrl = 'http://localhost:3000/api/fo/callback', saved?: ProviderSnapshot) {
    this.redirectUrl = redirectUrl;
    if(saved){this.info=saved.info;this.tokenSet=saved.tokens;this.verifier=saved.verifier;this.flow=saved.flow;}
  }
  snapshot(): ProviderSnapshot {return {info:this.info,tokens:this.tokenSet,verifier:this.verifier,flow:this.flow};}
  get clientMetadata() { return {
    client_name: this.redirectUrl.startsWith('https://') ? 'Ryluno' : 'Ryluno local development', application_type: 'web' as const,
    redirect_uris: [this.redirectUrl], grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'], token_endpoint_auth_method: 'none', scope: 'mcp',
  }; }
  private info: Information;
  private tokenSet: Tokens;
  private verifier = '';
  private discovery?: OAuthDiscoveryState;
  authorizationUrl?: string;
  flow = { state: '', expires: 0 };
  state() {
    this.flow = { state: randomBytes(32).toString('hex'), expires: Date.now() + 600_000 };
    return this.flow.state;
  }
  clientInformation(ctx?: OAuthClientInformationContext) { return ctx?.issuer === ISSUER ? this.info : undefined; }
  saveClientInformation(info: NonNullable<Information>, ctx?: OAuthClientInformationContext) {
    if (ctx?.issuer !== ISSUER) throw new Error('Unexpected issuer');
    this.info = info;
  }
  tokens(ctx?: OAuthClientInformationContext) { return !ctx || ctx.issuer === ISSUER ? this.tokenSet : undefined; }
  saveTokens(tokens: NonNullable<Tokens>, ctx?: OAuthClientInformationContext) {
    if (ctx && ctx.issuer !== ISSUER) throw new Error('Unexpected issuer');
    this.tokenSet = tokens;
  }
  saveCodeVerifier(value: string) { this.verifier = value; }
  codeVerifier() { if (!this.verifier) throw new Error('Missing verifier'); return this.verifier; }
  saveDiscoveryState(value: OAuthDiscoveryState) { this.discovery = value; }
  discoveryState() { return this.discovery; }
  redirectToAuthorization(url: URL) {
    if (url.origin !== ISSUER || url.pathname !== '/oauth/authorize') throw new Error('Unexpected authorization endpoint');
    this.authorizationUrl = url.href;
  }
  async validateResourceURL(_server: string | URL, resource?: string) {
    if (resource && resource !== FO_URL) throw new Error('Unexpected resource');
    return new URL(FO_URL);
  }
}

// Restrict discovery/token requests and redact untrusted OAuth error descriptions
// before the SDK can include them in diagnostics. Never log headers or bodies.
const foFetch: typeof fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== ISSUER) throw new Error('Unexpected Fo endpoint');
  let response: Response;
  try {
    response = await fetch(input, { ...init, redirect: 'error', signal: AbortSignal.any([
      ...(init?.signal ? [init.signal] : []), AbortSignal.timeout(20_000),
    ]) });
  } catch { throw new Error('Fo network request failed'); }
  if (!response.ok && url.pathname.startsWith('/oauth/')) {
    return Response.json({ error: 'server_error', error_description: 'Fo authorization request failed' }, { status: response.status });
  }
  return response;
};
export function transport(provider: FoProvider) {
  return new StreamableHTTPClientTransport(new URL(FO_URL), { authProvider: provider, fetch: foFetch });
}
export async function inspectFo(provider: FoProvider) {
  provider.authorizationUrl = undefined;
  const client = new Client({ name: 'ryluno', version: '0.1.0' });
  const connection = transport(provider);
  try {
    await client.connect(connection);
    const result = await client.listTools();
    // Read-only discovery. Text tool calls live in the separately guarded adapter.
    return { status: 'connected' as const, tools: result.tools };
  } catch (error) {
    if (error instanceof UnauthorizedError && provider.authorizationUrl) return { status: 'authorization_required' as const, tools: [] };
    throw new Error('Fo connection failed');
  } finally { await client.close().catch(() => {}); }
}
