// GET /api/replay/:id - SSE stream for trace replay (requires auth)
import { json, error, authenticate } from '../_auth';

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' },
    });
  }

  // Authenticate
  const auth = await authenticate(env.DB, request);
  if (!auth) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const traceId = params.id;

    const trace = await env.DB.prepare(
      `SELECT t.id, t.status, p.user_id
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

    const { results: steps } = await env.DB.prepare(
      'SELECT * FROM steps WHERE trace_id = ? ORDER BY step_index ASC'
    ).bind(traceId).all();

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`event: meta\ndata: ${JSON.stringify({ trace_id: traceId, total_steps: steps.length, status: trace.status })}\n\n`));

        for (const step of steps) {
          controller.enqueue(encoder.encode(`event: step\ndata: ${JSON.stringify(step)}\n\n`));
        }

        controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
