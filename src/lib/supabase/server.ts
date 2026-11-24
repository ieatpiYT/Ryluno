import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
export async function userClient() {
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar.getAll(), setAll: values => { values.forEach(({ name, value, options }) => jar.set(name, value, options)); } },
  });
}
export function adminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Server database configuration missing');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function requireUser() {
  const db = await userClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new Error('Sign in to continue');
  return { db, user };
}
export function sameOrigin(request: Request) {
  const origin = process.env.APP_ORIGIN;
  return !!origin && new URL(request.url).origin === origin && request.headers.get('origin') === origin;
}
