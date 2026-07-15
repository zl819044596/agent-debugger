// API Ingest - Receive trace events from the SDK
export async function onRequest(context) {
  const { request, env } = context;
  
  // CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const body = await request.json();
    
    // Validate API key
    const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing API key' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Simple API key lookup (in production, use hashed keys)
    const keyResult = await env.DB.prepare(
      'SELECT user_id, project_id FROM api_keys WHERE id = ?'
    ).bind(apiKey).first();

    if (!keyResult) {
      return new Response(JSON.stringify({ error: 'Invalid API key' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const { user_id, project_id } = keyResult;
    const traceId = body.trace_id || crypto.randomUUID();
    const steps = body.steps || [];

    // Upsert trace
    if (body.type === 'trace_start' || steps.length === 0) {
      // Start new trace
      await env.DB.prepare(
        `INSERT INTO traces (id, project_id, agent_name, framework, model, metadata, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET status = 'in_progress'`
      ).bind(
        traceId, project_id,
        body.agent_name || 'agent',
        body.framework || 'custom',
        body.model || null,
        body.metadata ? JSON.stringify(body.metadata) : null,
        body.tags ? JSON.stringify(body.tags) : null
      ).run();
    }

    // Insert steps
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepId = step.id || crypto.randomUUID();
      
      await env.DB.prepare(
        `INSERT OR IGNORE INTO steps
         (id, trace_id, step_index, step_type, input, output, thinking,
          tool_name, tool_input, tool_output, input_tokens, output_tokens,
          cost, latency_ms, status, error_message, handoff_to_agent,
          handoff_trace_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        stepId, traceId, step.step_index || i,
        step.step_type || 'think',
        step.input || null, step.output || null, step.thinking || null,
        step.tool_name || null,
        step.tool_input ? JSON.stringify(step.tool_input) : null,
        step.tool_output ? JSON.stringify(step.tool_output) : null,
        step.input_tokens || 0, step.output_tokens || 0,
        step.cost || 0, step.latency_ms || 0,
        step.status || 'success', step.error || null,
        step.handoff_to_agent || null, step.handoff_trace_id || null
      ).run();
    }

    // Complete trace if this is the last batch
    if (body.type === 'trace_end') {
      // Calculate totals
      const totals = await env.DB.prepare(
        `SELECT
           COUNT(*) as total_steps,
           COALESCE(SUM(input_tokens), 0) as total_input,
           COALESCE(SUM(output_tokens), 0) as total_output,
           COALESCE(SUM(cost), 0) as total_cost,
           COALESCE(SUM(latency_ms), 0) as total_latency
         FROM steps WHERE trace_id = ?`
      ).bind(traceId).first();

      await env.DB.prepare(
        `UPDATE traces SET
           status = ?, total_steps = ?, total_input_tokens = ?,
           total_output_tokens = ?, total_cost = ?, total_latency_ms = ?,
           ended_at = datetime('now')
         WHERE id = ?`
      ).bind(
        body.status || 'completed',
        totals?.total_steps || steps.length,
        totals?.total_input || 0,
        totals?.total_output || 0,
        totals?.total_cost || 0,
        totals?.total_latency || 0,
        traceId
      ).run();
    }

    return new Response(JSON.stringify({
      success: true,
      trace_id: traceId,
      steps_received: steps.length,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
