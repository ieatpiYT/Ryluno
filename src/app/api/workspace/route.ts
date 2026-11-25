import { requireUser, sameOrigin } from '@/lib/supabase/server';
import { validateData } from '@/lib/storage';
import { review } from '@/lib/review';
export async function GET() {
  try {
    const { db, user } = await requireUser();
    const { data, error } = await db.from('study_documents').select('data,revision,imported_at').eq('user_id', user.id).maybeSingle();
    if (error) return Response.json({message:'Database is not ready. Apply the Ryluno migrations and try again.'},{status:503});
    return Response.json({ document: data, user: { id: user.id, email: user.email } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ message: 'Sign in or check database setup.' }, { status: 401 }); }
}
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return Response.json({ message: 'Invalid origin' }, { status: 403 });
  try {
    const { db, user } = await requireUser();
    const raw = await request.text();
    if (raw.length > 5_000_000) return Response.json({ message: 'Workspace is too large' }, { status: 413 });
    const body = JSON.parse(raw); if(body.userId!==user.id)return Response.json({message:'Your signed-in account changed. Export your work and reload.'},{status:409}); const data = validateData(body.data);
    if (!Number.isInteger(body.revision) || body.revision < 0) throw new Error('Invalid revision');
    const reviews = data.problems.map(p => { const r = review(p); return { problem_id: p.id, due: r.due.toISOString(), interval: r.interval }; });
    const { data: revision, error } = await db.rpc('save_workspace', { payload: data, expected_revision: body.revision, review_payload: reviews, importing: body.importing === true });
    if (error) return Response.json({ message: 'Save rejected. Another tab may have changed this account. Export your work, then reload.' }, { status: 409 });
    return Response.json({ revision });
  } catch { return Response.json({ message: 'Could not save. Check your connection and sign-in.' }, { status: 400 }); }
}
