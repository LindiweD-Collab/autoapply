import { supabase } from '../../../lib/supabase.js';

export async function POST({ request }) {
  const form = await request.formData();
  const email = form.get('email')?.toString().trim();
  const password = form.get('password')?.toString();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return new Response(null, {
      status: 302,
      headers: { Location: `/auth/login?error=${encodeURIComponent(error.message)}` },
    });
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/dashboard',
      'Set-Cookie': `sb-access-token=${data.session.access_token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
    },
  });
}
