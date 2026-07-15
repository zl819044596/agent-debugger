// GET /api/auth/me - Get current user from session
import { json, error, handleOptions, authenticate } from '../_auth';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'GET') return error('Method not allowed', 405);

  try {
    const auth = await authenticate(env.DB, request);

    if (!auth) {
      return json({ error: 'Not authenticated' }, 401);
    }

    // Get user's projects
    const { results: projects } = await env.DB.prepare(
      'SELECT id, name, created_at FROM projects WHERE user_id = ? ORDER BY created_at ASC'
    ).bind(auth.user.id).all();

    return json({
      user: auth.user,
      projects: projects || [],
    });
  } catch (err) {
    return error(err.message, 500);
  }
}
