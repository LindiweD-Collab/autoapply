import { requireAuth, getAdminClient } from '../../../lib/supabase.js';
import { initiateSubscription } from '../../../lib/paystack.js';

export async function POST({ request }) {
  let user;
  try {
    user = await requireAuth(request);
  } catch {
    return new Response(null, { status: 302, headers: { Location: '/auth/login' } });
  }

  const form = await request.formData();
  const plan = form.get('plan')?.toString();
  const email = form.get('email')?.toString() || user.email;

  try {
    const { authorization_url, reference } = await initiateSubscription(email, plan, user.id);

    // Store the pending reference
    const admin = getAdminClient();
    await admin.from('payment_references').upsert({
      user_id: user.id,
      reference,
      plan,
      status: 'pending',
      created_at: new Date().toISOString(),
    }, { onConflict: 'reference' });

    // Redirect to Paystack checkout
    return new Response(null, { status: 302, headers: { Location: authorization_url } });
  } catch (err) {
    return new Response(null, {
      status: 302,
      headers: { Location: `/dashboard/billing?error=${encodeURIComponent(err.message)}` },
    });
  }
}
