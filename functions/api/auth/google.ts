// GET /api/auth/google — Redirect to Google OAuth
import { randomHex } from '../_auth';

export async function onRequest(context) {
  const { request } = context;
  const env = context.env;  // explicit access

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/auth/google/callback`;

  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;

  // Debug: if missing, show error
  if (!clientId || !clientSecret) {
    return new Response(
      `Google OAuth not configured. GOOGLE_CLIENT_ID=${typeof clientId} GOOGLE_CLIENT_SECRET=${typeof clientSecret}`,
      { status: 500 }
    );
  }

  // Generate CSRF state
  const state = randomHex(32);
  await env.DB.prepare(
    'INSERT INTO oauth_states (state, redirect_to, expires_at) VALUES (?, ?, datetime(\'now\', \'+10 minutes\'))'
  ).bind(state, '/app').run();

  // Build Google OAuth URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, 302);
}
