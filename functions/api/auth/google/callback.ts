// GET /api/auth/google/callback — Handle Google OAuth callback
import { createSession, sessionCookie, randomHex, hashPassword } from '../../_auth';

export async function onRequest(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      return new Response(`Google auth error: ${error}`, { status: 400 });
    }

    if (!code || !state) {
      return new Response('Missing code or state', { status: 400 });
    }

    // Verify state (CSRF protection)
    const storedState = await env.DB.prepare(
      'SELECT state FROM oauth_states WHERE state = ? AND expires_at > datetime(\'now\')'
    ).bind(state).first();

    if (!storedState) {
      return new Response('Invalid or expired state', { status: 400 });
    }

    // Clean up used state
    await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();

    const origin = url.origin;
    const redirectUri = `${origin}/api/auth/google/callback`;

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      return new Response(`Token exchange failed: ${JSON.stringify(tokens)}`, { status: 400 });
    }

    // Get user info from Google
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const googleUser = await userRes.json();

    if (!googleUser.email) {
      return new Response('Failed to get user email from Google', { status: 400 });
    }

    // Find or create user
    let user = await env.DB.prepare(
      'SELECT id, email, name, plan FROM users WHERE email = ?'
    ).bind(googleUser.email).first();

    if (!user) {
      // Create new user
      const userId = randomHex(16);
      const userName = googleUser.name || googleUser.email.split('@')[0];

      await env.DB.prepare(
        'INSERT INTO users (id, email, name, plan) VALUES (?, ?, ?, ?)'
      ).bind(userId, googleUser.email, userName, 'free').run();

      // Create default project
      const projectId = randomHex(16);
      await env.DB.prepare(
        'INSERT INTO projects (id, user_id, name) VALUES (?, ?, ?)'
      ).bind(projectId, userId, 'default').run();

      // Create default API key
      const apiKeyId = `ad_${randomHex(32)}`;
      const keySalt = randomHex(16);
      const keyHash = await hashPassword(apiKeyId, keySalt);
      await env.DB.prepare(
        'INSERT INTO api_keys (id, user_id, name, project_id, key_hash) VALUES (?, ?, ?, ?, ?)'
      ).bind(apiKeyId, userId, 'default', projectId, keyHash).run();

      user = { id: userId, email: googleUser.email, name: userName, plan: 'free' };
    }

    // Create session
    const sessionId = await createSession(env.DB, user.id);

    // Redirect to dashboard with session cookie
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/app',
        'Set-Cookie': sessionCookie(sessionId),
      },
    });

  } catch (err) {
    return new Response(`OAuth error: ${err.message}`, { status: 500 });
  }
}
