type AccessResult = { status: string; authenticated?: boolean; submissionEnabled?: boolean; message?: string; authorizationUrl?: string };
type FoAction = 'login' | 'connect' | 'logout';

export async function readFoAccess(fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<AccessResult> {
  const response = await fetcher('/api/fo/status', { cache: 'no-store', credentials: 'same-origin', signal });
  const result: AccessResult = await response.json();
  return { ...result, authenticated: response.ok && result.authenticated === true };
}

/** A password response cannot prove the browser accepted its HttpOnly cookie. */
export async function requestFoAction(name: FoAction, body: object = {}, fetcher: typeof fetch = fetch): Promise<AccessResult> {
  if (name === 'connect') {
    const access = await readFoAccess(fetcher);
    if (!access.authenticated) return access;
  }
  const response = await fetcher(`/api/fo/${name}`, {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result: AccessResult = await response.json();
  if (name !== 'login' || !response.ok) return result;
  const access = await readFoAccess(fetcher);
  if (!access.authenticated) {
    return { ...access, status: 'locked', message: `Your password was accepted, but this browser could not verify its local unlock session. OAuth has not started. Check that cookies are allowed for http://localhost:3000 and stay in this same browser/profile. ${access.message ?? ''}` };
  }
  return { ...access, message: 'Local unlock verified in this browser. You can now select Connect Fo here.' };
}
