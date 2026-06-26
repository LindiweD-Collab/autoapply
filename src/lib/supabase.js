import { createClient } from '@supabase/supabase-js';

// Browser / SSR safe client (anon key)
export const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY
);

// Server-only admin client (service role key — never expose to browser)
export function getAdminClient() {
  return createClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Auth helpers
export async function getSession(request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/sb-access-token=([^;]+)/);
  if (!match) return null;
  const { data, error } = await supabase.auth.getUser(match[1]);
  if (error || !data.user) return null;
  return data.user;
}

export async function requireAuth(request) {
  const user = await getSession(request);
  if (!user) throw new Response(null, { status: 302, headers: { Location: '/auth/login' } });
  return user;
}
