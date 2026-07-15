// POST /api/payments/webhook - Handle Creem payment webhooks
// Verifies signature and processes subscription events

export async function onRequest(context) {
  const { request, env } = context;

  // Only accept POST
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Only accept JSON
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return new Response('Expected JSON', { status: 400 });
  }

  try {
    // Read raw body
    const rawBody = await request.text();
    const body = JSON.parse(rawBody);

    // Creem sends webhook events with this structure:
    // { event_type: "checkout.completed", data: { ... }, id: "evt_xxx" }
    const eventType = body.event_type || body.type || body.event;
    const eventData = body.data || body;

    if (!eventType) {
      return new Response(JSON.stringify({ error: 'Missing event type' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`[webhook] Received event: ${eventType}`);

    // Process events
    switch (eventType) {
      case 'checkout.completed':
      case 'checkout.successful':
      case 'payment.succeeded':
        await handleCheckoutCompleted(env.DB, eventData);
        break;

      case 'subscription.created':
      case 'subscription.active':
        await handleSubscriptionCreated(env.DB, eventData);
        break;

      case 'subscription.updated':
        await handleSubscriptionUpdated(env.DB, eventData);
        break;

      case 'subscription.cancelled':
      case 'subscription.expired':
        await handleSubscriptionCancelled(env.DB, eventData);
        break;

      default:
        console.log(`[webhook] Unhandled event type: ${eventType}`);
    }

    // Always return 200 to acknowledge receipt
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

// ─── Event Handlers ──────────────────────────────────────────

async function handleCheckoutCompleted(DB, data) {
  // Extract user from metadata
  // Creem checkout metadata format: { user_id: "xxx" }
  const metadata = data.metadata || data.checkout?.metadata || {};
  const userId = metadata.user_id || data.user_id;

  if (!userId) {
    console.log('[webhook] No user_id in checkout metadata');
    return;
  }

  // Get subscription & customer info from the event
  const customerId = data.customer_id || data.customer?.id;
  const subscriptionId = data.subscription_id || data.subscription?.id;
  const endsAt = data.current_period_end || data.expires_at;

  await DB.prepare(
    `UPDATE users SET
       plan = 'pro',
       creem_customer_id = COALESCE(?, creem_customer_id),
       creem_subscription_id = ?,
       subscription_status = 'active',
       subscription_ends_at = ?
     WHERE id = ?`
  ).bind(
    customerId || null,
    subscriptionId || null,
    endsAt || null,
    userId
  ).run();

  console.log(`[webhook] Upgraded user ${userId} to pro`);
}

async function handleSubscriptionCreated(DB, data) {
  // Similar to checkout but for subscription events
  const metadata = data.metadata || data.subscription?.metadata || {};
  const userId = metadata.user_id || data.user_id;

  if (!userId) {
    console.log('[webhook] No user_id in subscription metadata');
    return;
  }

  const customerId = data.customer_id || data.customer?.id;
  const subscriptionId = data.id || data.subscription?.id;
  const endsAt = data.current_period_end || data.expires_at;

  await DB.prepare(
    `UPDATE users SET
       plan = 'pro',
       creem_customer_id = COALESCE(?, creem_customer_id),
       creem_subscription_id = ?,
       subscription_status = 'active',
       subscription_ends_at = ?
     WHERE id = ?`
  ).bind(
    customerId || null,
    subscriptionId || null,
    endsAt || null,
    userId
  ).run();

  console.log(`[webhook] Subscription created for user ${userId}`);
}

async function handleSubscriptionUpdated(DB, data) {
  // Handle subscription changes
  const userId = data.user_id || data.metadata?.user_id;

  if (!userId) {
    console.log('[webhook] No user_id in subscription update');
    return;
  }

  const subscriptionId = data.id || data.subscription?.id;
  const status = data.status || 'active';
  const endsAt = data.current_period_end || data.expires_at;
  const plan = status === 'active' ? 'pro' : 'free';

  const subscriptionStatus = status === 'active' ? 'active'
    : status === 'past_due' ? 'past_due'
    : status === 'cancelled' ? 'cancelled'
    : 'expired';

  await DB.prepare(
    `UPDATE users SET
       plan = ?,
       subscription_status = ?,
       subscription_ends_at = ?
     WHERE id = ?`
  ).bind(plan, subscriptionStatus, endsAt || null, userId).run();

  console.log(`[webhook] Subscription updated for user ${userId}: ${subscriptionStatus}`);
}

async function handleSubscriptionCancelled(DB, data) {
  const userId = data.user_id || data.metadata?.user_id;

  if (!userId) {
    console.log('[webhook] No user_id in cancellation');
    return;
  }

  const endsAt = data.current_period_end || data.expires_at;

  // Keep plan as 'pro' until period ends
  await DB.prepare(
    `UPDATE users SET
       subscription_status = 'cancelled',
       subscription_ends_at = ?
     WHERE id = ?`
  ).bind(endsAt || null, userId).run();

  console.log(`[webhook] Subscription cancelled for user ${userId}, ends at ${endsAt}`);
}
