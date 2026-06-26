import { requireAuth, getAdminClient } from '../../../lib/supabase.js';

export async function POST({ request }) {
  let user;
  try {
    user = await requireAuth(request);
  } catch {
    return new Response(null, { status: 302, headers: { Location: '/auth/login' } });
  }

  const form = await request.formData();
  const enabled = form.get('enabled') === 'true';

  const admin = getAdminClient();
  await admin.from('profiles')
    .update({ auto_apply_enabled: enabled })
    .eq('user_id', user.id);

  return new Response(null, { status: 302, headers: { Location: '/dashboard' } });
}
