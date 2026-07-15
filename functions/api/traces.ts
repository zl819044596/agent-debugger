// GET /api/traces - List traces for a project (requires auth)
import { json, error, authenticate } from '../_auth';

export async function onRequest(context) {
  const { request, env } = context;

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
    return new Response(JSON.stringify({ error: 'Not authenticated. Provide session cookie or API key via Authorization: Bearer <key>' }), { status: 401, headers });
  }

  try {
    const url = new URL(request.url);
    let projectId = url.searchParams.get('project_id');
    const status = url.searchParams.get('status');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // If authenticated via API key, use its project_id
    if (!projectId && auth.type === 'api_key' && auth.project_id) {
      projectId = auth.project_id;
    }

    if (!projectId) {
      return json({ error: 'Missing project_id parameter' }, 400);
    }

    // Verify project belongs to user
    const project = await env.DB.prepare(
      'SELECT id FROM projects WHERE id = ? AND user_id = ?'
    ).bind(projectId, auth.user.id).first();

    if (!project) {
      return json({ error: 'Project not found or access denied' }, 403);
    }

    let query = `SELECT id, agent_name, status, total_steps, total_input_tokens + total_output_tokens as total_tokens,
                 total_cost, total_latency_ms, framework, model, started_at, ended_at,
                 (SELECT COUNT(*) FROM traces t2 WHERE t2.parent_trace_id = traces.id) as child_count
                 FROM traces WHERE project_id = ?`;
    const params = [projectId];

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY started_at DESC LIMIT ? OFFSET ?`;
    params.push(String(limit), String(offset));

    const { results } = await env.DB.prepare(query).bind(...params).all();

    return new Response(JSON.stringify({ traces: results, limit, offset }), { headers });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}
