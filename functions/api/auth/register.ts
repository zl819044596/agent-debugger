// POST /api/auth/register - Register a new user
import {
  json, error, handleOptions, randomHex, hashPassword, createSession, sessionCookie
} from '../_auth';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return error('Method not allowed', 405);

  try {
    const { email, password, name } = await request.json();

    if (!email || !password) return error('Email and password required');
    if (password.length < 6) return error('Password must be at least 6 characters');

    const existing = await env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email).first();

    if (existing) return error('Email already registered', 409);

    const userId = randomHex(16);
    const salt = randomHex(16);
    const hashedPw = await hashPassword(password, salt);

    await env.DB.prepare(
      'INSERT INTO users (id, email, name, plan, password_hash) VALUES (?, ?, ?, ?, ?)'
    ).bind(userId, email, name || null, 'free', hashedPw).run();

    const projectId = randomHex(16);
    await env.DB.prepare(
      'INSERT INTO projects (id, user_id, name) VALUES (?, ?, ?)'
    ).bind(projectId, userId, 'default').run();

    // Create API key with id + key_hash
    const apiKeyId = `ad_${randomHex(32)}`;
    const keyHashSalt = randomHex(16);
    const keyHash = await hashPassword(apiKeyId, keyHashSalt);
    await env.DB.prepare(
      'INSERT INTO api_keys (id, user_id, name, project_id, key_hash) VALUES (?, ?, ?, ?, ?)'
    ).bind(apiKeyId, userId, 'default', projectId, keyHash).run();

    const sessionId = await createSession(env.DB, userId);

    return new Response(JSON.stringify({
      user: { id: userId, email, name: name || null, plan: 'free' },
      project: { id: projectId, name: 'default' },
      api_key: apiKeyId,
    }), {
      status: 201,
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
