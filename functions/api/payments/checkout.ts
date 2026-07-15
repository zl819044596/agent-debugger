// POST /api/payments/checkout - Create a Creem checkout session
// Requires authentication. Returns a checkout URL to redirect the user to.

import { json, error, handleOptions } from '../_auth';

// Check for global auth helper
async function authenticate(DB, request) {
  // Reuse the same authenticate logic from _auth.ts
  const { authenticate: auth } = await import('../_auth');
  return auth(DB, request);
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return error('Method not allowed', 405);

  // Authenticate
  const { authenticate } = await import('../_auth');
  const auth = await authenticate(env.DB, request);
  if (!auth) return error('Not authenticated', 401);

  try {
    const body = await request.json().catch(() => ({}));
    const { price_id, success_url, cancel_url } = body;

    if (!price_id) {
      // Auto-detect the Pro price ID from env or use default
      return error('Missing price_id. Provide the Creem price ID.', 400);
    }

    // Get user info for metadata
    const user = await env.DB.prepare(
      'SELECT id, email, name FROM users WHERE id = ?'
    ).bind(auth.user.id).first();

    if (!user) return error('User not found', 404);

    // Already pro?
    if (auth.user.plan === 'pro') {
      return json({ already_pro: true, message: 'You already have a Pro plan' });
    }

    // Build Creem checkout URL
    // Creem API: POST https://api.creem.io/v1/checkouts
    const creemApiKey = env.CREEM_API_KEY;
    if (!creemApiKey) return error('Payment not configured', 500);

    const origin = new URL(request.url).origin;
    const defaultSuccessUrl = `${origin}/app?upgrade=success`;
    const defaultCancelUrl = `${origin}/app`;

    const checkoutPayload = {
      product_id: price_id,
      success_url: success_url || defaultSuccessUrl,
      cancel_url: cancel_url || defaultCancelUrl,
      metadata: {
        user_id: user.id,
        user_email: user.email,
      },
    };

    // Call Creem API to create checkout
    const creemResponse = await fetch('https://api.creem.io/v1/checkouts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-api-key': creemApiKey,
      },
      body: JSON.stringify(checkoutPayload),
    });

    if (!creemResponse.ok) {
      const errText = await creemResponse.text();
      console.error('[checkout] Creem API error:', creemResponse.status, errText);
      return error(`Creem API error: ${creemResponse.status}`, 502);
    }

    const creemData = await creemResponse.json();

    // Return checkout URL to redirect the user
    return json({
      checkout_url: creemData.checkout_url || creemData.url || creemData.data?.url,
      checkout_id: creemData.id || creemData.checkout_id,
    });

  } catch (err) {
    console.error('[checkout] Error:', err.message);
    return error(err.message, 500);
  }
}
