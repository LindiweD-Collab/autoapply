import { requireAuth, getAdminClient } from '../../../lib/supabase.js';
import { cancelSubscription } from '../../../lib/paystack.js';

export async function POST({ request }) {
  let user;
  try {
    user = await requireAuth(request);
  } catch {
    return new Response(null, { status: 302, headers: { Location: '/auth/login' } });
  }

  const form = await request.formData();
  const subscription_code = form.get('subscription_code')?.toString();
  const email_token = form.get('email_token')?.toString();

  try {
    if (subscription_code && email_token) {
      await cancelSubscription(subscription_code, email_token);
    }

    const admin = getAdminClient();
    await admin.from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('user_id', user.id)
      .eq('status', 'active');

    return new Response(null, { status: 302, headers: { Location: '/dashboard/billing?success=Subscription+cancelled' } });
  } catch (err) {
    return new Response(null, {
      status: 302,
      headers: { Location: `/dashboard/billing?error=${encodeURIComponent(err.message)}` },
    });
  }
}
