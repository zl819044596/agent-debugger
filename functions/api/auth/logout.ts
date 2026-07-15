// POST /api/auth/logout - Clear session
import { json, error, handleOptions, clearSessionCookie } from '../_auth';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return error('Method not allowed', 405);

  try {
    const cookie = request.headers.get('Cookie') || '';
    const match = cookie.match(/ad_session=([^;]+)/);
    const sessionId = match ? match[1] : null;

    if (sessionId) {
      await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Set-Cookie': clearSessionCookie(),
      },
    });
  } catch (err) {
    return error(err.message, 500);
  }
}
