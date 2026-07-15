// POST /api/payments/webhook - Handle Creem payment webhooks
// No schema migration needed — just updates the existing plan field

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Read raw body once for signature verification and JSON parsing
    const rawBody = await request.text();
    const webhookSecret = env.CREEM_WEBHOOK_SECRET;

    // Verify signature if configured
    if (webhookSecret) {
      const signature = request.headers.get('x-webhook-signature') || '';
      if (signature) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          'raw', encoder.encode(webhookSecret),
          { name: 'HMAC', hash: 'SHA-256' },
          false, ['verify']
        );
        const sigBytes = hexToBytes(signature);
        const bodyBytes = encoder.encode(rawBody);
        const valid = await crypto.subtle.verify('HMAC', key, sigBytes, bodyBytes);
        if (!valid) {
          console.error('[webhook] Invalid signature');
          return new Response('Invalid signature', { status: 401 });
        }
      }
    }

    // Parse and process
    const body = JSON.parse(rawBody);
    await processEvent(env.DB, body);

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[webhook] Error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

function hexToBytes(hex) {
  if (!hex) return new Uint8Array(0);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function processEvent(DB, body) {
  const eventType = body.event_type || body.type || body.event;
  const data = body.data || body;

  console.log(`[webhook] Event: ${eventType}`);

  // Payment/completion events → upgrade user to pro
  if (
    eventType === 'checkout.completed' ||
    eventType === 'checkout.successful' ||
    eventType === 'payment.succeeded' ||
    eventType === 'subscription.created' ||
    eventType === 'subscription.active'
  ) {
    // Try metadata first (set by checkout API), then customer email
    const metadata = data.metadata || {};
    let userId = metadata.user_id || data.user_id;

    if (userId) {
      await DB.prepare(`UPDATE users SET plan = 'pro' WHERE id = ?`).bind(userId).run();
      console.log(`[webhook] Upgraded user ${userId} to pro`);
    } else {
      // Fallback: look up by email
      const email = data.customer?.email || data.email || metadata.user_email;
      if (email) {
        await DB.prepare(`UPDATE users SET plan = 'pro' WHERE email = ?`).bind(email).run();
        console.log(`[webhook] Upgraded user by email ${email} to pro`);
      } else {
        console.log('[webhook] No user identifier found in event data');
      }
    }
  } else if (
    eventType === 'subscription.cancelled' ||
    eventType === 'subscription.expired'
  ) {
    const metadata = data.metadata || {};
    const userId = metadata.user_id || data.user_id;
    if (userId) {
      await DB.prepare(`UPDATE users SET plan = 'free' WHERE id = ?`).bind(userId).run();
      console.log(`[webhook] Downgraded user ${userId} to free`);
    }
  } else {
    console.log(`[webhook] Unhandled event: ${eventType}`);
  }
}
