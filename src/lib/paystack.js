const PAYSTACK_SECRET = import.meta.env.PAYSTACK_SECRET_KEY;
const BASE = 'https://api.paystack.co';

const PLANS = {
  starter:      { name: 'AutoApply Starter',      amount: 14900,  applies_limit: 50  },
  professional: { name: 'AutoApply Professional', amount: 29900,  applies_limit: 150 },
  agency:       { name: 'AutoApply Agency',        amount: 99900,  applies_limit: 9999 },
};

async function paystackRequest(method, path, body = null) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!data.status) throw new Error(data.message || 'Paystack error');
  return data.data;
}

// Create a Paystack plan (run once per plan, idempotent)
export async function ensurePaystackPlans() {
  const existing = await paystackRequest('GET', '/plan');
  const existingNames = existing.map(p => p.name);

  for (const [key, plan] of Object.entries(PLANS)) {
    if (!existingNames.includes(plan.name)) {
      await paystackRequest('POST', '/plan', {
        name: plan.name,
        interval: 'monthly',
        amount: plan.amount,
      });
      console.log(`Created Paystack plan: ${plan.name}`);
    }
  }
}

// Initialise a subscription checkout — returns { authorization_url, reference }
export async function initiateSubscription(email, planKey, userId) {
  const plan = PLANS[planKey];
  if (!plan) throw new Error(`Unknown plan: ${planKey}`);

  const plans = await paystackRequest('GET', '/plan');
  const paystackPlan = plans.find(p => p.name === plan.name);
  if (!paystackPlan) throw new Error('Paystack plan not found — run ensurePaystackPlans()');

  const data = await paystackRequest('POST', '/transaction/initialize', {
    email,
    amount: plan.amount,
    plan: paystackPlan.plan_code,
    callback_url: `${import.meta.env.PUBLIC_APP_URL}/api/paystack/callback`,
    metadata: { user_id: userId, plan_key: planKey, applies_limit: plan.applies_limit },
  });

  return { authorization_url: data.authorization_url, reference: data.reference };
}

// Verify a transaction and return metadata
export async function verifyTransaction(reference) {
  return paystackRequest('GET', `/transaction/verify/${reference}`);
}

// Cancel a subscription
export async function cancelSubscription(subscriptionCode, emailToken) {
  return paystackRequest('POST', '/subscription/disable', {
    code: subscriptionCode,
    token: emailToken,
  });
}

export { PLANS };
