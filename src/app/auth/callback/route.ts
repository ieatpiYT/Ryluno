import { userClient } from '@/lib/supabase/server';
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('code');
  if (code) {
    const { error } = await (await userClient()).auth.exchangeCodeForSession(code);
    if (!error) return Response.redirect(new URL('/', process.env.APP_ORIGIN!), 303);
  }
  return Response.redirect(new URL('/?auth=failed', process.env.APP_ORIGIN!), 303);
}
