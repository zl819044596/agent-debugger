// POST /api/auth/login - Login with email and password
// Expects password_hash column exists in users table (migration 0004)
import {
  json, error, handleOptions, verifyPassword, createSession, sessionCookie
} from '../_auth';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return error('Method not allowed', 405);

  try {
    const { email, password } = await request.json();
    if (!email || !password) return error('Email and password required');

    const user = await env.DB.prepare(
      'SELECT id, email, name, plan, password_hash FROM users WHERE email = ?'
    ).bind(email).first();

    if (!user) return error('Invalid email or password', 401);
    if (!user.password_hash) return error('Account has no password set. Please register again.', 401);

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return error('Invalid email or password', 401);

    const project = await env.DB.prepare(
      'SELECT id, name FROM projects WHERE user_id = ? ORDER BY created_at ASC LIMIT 1'
    ).bind(user.id).first();

    const sessionId = await createSession(env.DB, user.id);

    return new Response(JSON.stringify({
      user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
      project: project ? { id: project.id, name: project.name } : null,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Set-Cookie': sessionCookie(sessionId),
      },
    });

  } catch (err) {
    return error(err.message, 500);
  }
}
