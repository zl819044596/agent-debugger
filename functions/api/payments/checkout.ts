// POST /api/payments/checkout - Create a Creem checkout session
// Returns a checkout URL to redirect the user to

import { handleOptions } from '../_auth';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // Authenticate via same-origin session cookie
  const cookie = request.headers.get('Cookie') || '';
  const sessionMatch = cookie.match(/ad_session=([^;]+)/);
  if (!sessionMatch) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const sessionId = sessionMatch[1];
    const user = await env.DB.prepare(
      `SELECT u.id, u.email, u.name, u.plan
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > datetime('now')`
    ).bind(sessionId).first();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Session expired' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Already pro?
    if (user.plan === 'pro') {
      return new Response(JSON.stringify({ already_pro: true }), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const creemKey = env.CREEM_API_KEY;
    if (!creemKey) {
      return new Response(JSON.stringify({ error: 'Payment not configured' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    const origin = new URL(request.url).origin;

    // Creem API expects a product_id (from Creem dashboard) and metadata
    // First, get the product from Creem to find the latest price
    const productRes = await fetch('https://api.creem.io/v1/products', {
      headers: { 'x-api-key': creemKey, 'Accept': 'application/json' },
    });

    const products = await productRes.json();
    const products_list = products.data || products.results || products || [];

    // Find our product
    const product = Array.isArray(products_list)
      ? products_list.find(p => p.name?.includes('Agent Debugger'))
      : null;

    if (!product) {
      return new Response(JSON.stringify({ error: 'Product not found in Creem. Create the product first.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const priceId = product.price_id || product.default_price?.id || product.price?.id;

    // Create checkout session
    const checkoutPayload = {
      product_id: product.id,
      price_id: priceId,
      success_url: `${origin}/app?upgrade=success`,
      cancel_url: `${origin}/app`,
      metadata: {
        user_id: user.id,
        user_email: user.email,
      },
    };

    const checkoutRes = await fetch('https://api.creem.io/v1/checkouts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': creemKey,
        'Accept': 'application/json',
      },
      body: JSON.stringify(checkoutPayload),
    });

    if (!checkoutRes.ok) {
      const errText = await checkoutRes.text();
      return new Response(JSON.stringify({ error: `Creem error: ${checkoutRes.status}`, detail: errText }), {
        status: 502, headers: { 'Content-Type': 'application/json' }
      });
    }

    const checkoutData = await checkoutRes.json();
    const checkoutUrl = checkoutData.checkout_url || checkoutData.url || checkoutData.data?.url;

    if (!checkoutUrl) {
      return new Response(JSON.stringify({ error: 'No checkout URL in response', data: checkoutData }), {
        status: 502, headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ checkout_url: checkoutUrl }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
