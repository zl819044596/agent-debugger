// GET /api/traces/:id - Get full trace detail with steps (requires auth)
import { json, error, authenticate } from '../_auth';

export async function onRequest(context) {
  const { request, env, params } = context;

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
  }

  // Authenticate
  const auth = await authenticate(env.DB, request);
  if (!auth) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers });
  }

  try {
    const traceId = params.id;

    const trace = await env.DB.prepare(
      `SELECT t.*, p.user_id
       FROM traces t
       JOIN projects p ON p.id = t.project_id
       WHERE t.id = ?`
    ).bind(traceId).first();

    if (!trace) {
      return json({ error: 'Trace not found' }, 404);
    }

    // Verify ownership
    if (trace.user_id !== auth.user.id) {
      return json({ error: 'Access denied' }, 403);
    }

    // Remove internal fields
    delete trace.user_id;

    const { results: steps } = await env.DB.prepare(
      'SELECT * FROM steps WHERE trace_id = ? ORDER BY step_index ASC'
    ).bind(traceId).all();

    const { results: children } = await env.DB.prepare(
      `SELECT id, agent_name, status, total_steps, total_cost, total_latency_ms, agent_role
       FROM traces WHERE parent_trace_id = ? ORDER BY started_at ASC`
    ).bind(traceId).all();

    return json({ trace, steps, children });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}
