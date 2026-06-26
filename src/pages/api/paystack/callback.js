import { getAdminClient } from '../../../lib/paystack.js';
import { verifyTransaction, PLANS } from '../../../lib/paystack.js';

// Paystack redirects here after payment: /api/paystack/callback?reference=xxx
export async function GET({ request }) {
  const url = new URL(request.url);
  const reference = url.searchParams.get('reference');

  if (!reference) {
    return new Response(null, { status: 302, headers: { Location: '/dashboard/billing?error=Missing+reference' } });
  }

  try {
    const tx = await verifyTransaction(reference);

    if (tx.status !== 'success') {
      throw new Error(`Payment not successful: ${tx.status}`);
    }

    const { user_id, plan_key, applies_limit } = tx.metadata;
    const plan = PLANS[plan_key];

    const { getAdminClient: getAdmin } = await import('../../../lib/supabase.js');
    const admin = getAdmin();

    // Deactivate old subscriptions
    await admin.from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('user_id', user_id)
      .eq('status', 'active');

    // Activate new subscription
    const nextBilling = new Date();
    nextBilling.setMonth(nextBilling.getMonth() + 1);

    await admin.from('subscriptions').insert({
      user_id,
      plan: plan_key,
      price: plan.amount,
      applies_limit: applies_limit || plan.applies_limit,
      applies_used: 0,
      start_date: new Date().toISOString().split('T')[0],
      next_billing: nextBilling.toISOString().split('T')[0],
      status: 'active',
      paystack_reference: reference,
      paystack_subscription_code: tx.plan_object?.subscription_code || null,
    });

    // Mark reference as complete
    await admin.from('payment_references')
      .update({ status: 'complete' })
      .eq('reference', reference);

    return new Response(null, { status: 302, headers: { Location: '/dashboard/billing?success=1' } });
  } catch (err) {
    console.error('[Paystack callback]', err.message);
    return new Response(null, {
      status: 302,
      headers: { Location: `/dashboard/billing?error=${encodeURIComponent(err.message)}` },
    });
  }
}
