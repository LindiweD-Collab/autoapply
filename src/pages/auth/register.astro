import { supabase, getAdminClient } from '../../../lib/supabase.js';

export async function POST({ request }) {
  const form = await request.formData();
  const email = form.get('email')?.toString().trim();
  const password = form.get('password')?.toString();
  const full_name = form.get('full_name')?.toString().trim();
  const plan = form.get('plan')?.toString() || 'starter';

  if (!email || !password || !full_name) {
    return Response.redirect(new URL(`/auth/register?error=${encodeURIComponent('All fields are required')}`, request.url), 302);
  }

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return Response.redirect(new URL(`/auth/register?error=${encodeURIComponent(error.message)}`, request.url), 302);
  }

  // Create a starter profile
  const admin = getAdminClient();
  await admin.from('profiles').insert({
    user_id: data.user.id,
    full_name,
    location: '',
    auto_apply_enabled: false,
  });

  // Give them 5 free applies (freemium)
  await admin.from('subscriptions').insert({
    user_id: data.user.id,
    plan: 'free',
    price: 0,
    applies_limit: 5,
    applies_used: 0,
    start_date: new Date().toISOString().split('T')[0],
    status: 'active',
  });

  // Sign them in immediately
  const { data: session } = await supabase.auth.signInWithPassword({ email, password });

  const redirectUrl = plan !== 'starter' ? `/dashboard/billing?plan=${plan}` : '/dashboard/profile';

  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectUrl,
      'Set-Cookie': `sb-access-token=${session.session.access_token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
    },
  });
}
