// GET /api/auth/google — Redirect to Google OAuth
import { randomHex } from '../_auth';

export async function onRequest(context) {
  const { request, env } = context;

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/auth/google/callback`;

  // Generate CSRF state, store in D1
  const state = randomHex(32);
  await env.DB.prepare(
    'INSERT INTO oauth_states (state, redirect_to, expires_at) VALUES (?, ?, datetime(\'now\', \'+10 minutes\'))'
  ).bind(state, '/app').run();

  // Build Google OAuth URL
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, 302);
}
