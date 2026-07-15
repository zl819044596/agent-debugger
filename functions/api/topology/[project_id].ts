// GET /api/topology/:project_id - Build agent topology graph from traces data
// Returns { nodes, edges } for D3 force-directed graph rendering
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
    const projectId = params.project_id;

    if (!projectId) {
      return json({ error: 'Missing project_id' }, 400);
    }

    // Verify project belongs to user
    const project = await env.DB.prepare(
      'SELECT id FROM projects WHERE id = ? AND user_id = ?'
    ).bind(projectId, auth.user.id).first();

    if (!project) {
      return json({ error: 'Project not found or access denied' }, 403);
    }

    // ── Build nodes: unique agents within the project ──
    // An agent is identified by a unique (agent_name) within a project.
    // We aggregate stats per agent.
    const { results: agentRows } = await env.DB.prepare(`
      SELECT
        agent_name,
        agent_role,
        COUNT(*)                                          AS trace_count,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
        SUM(CASE WHEN status = 'failed' OR status = 'error' THEN 1 ELSE 0 END) AS failed_count,
        SUM(total_latency_ms)                             AS total_latency_ms,
        SUM(total_cost)                                   AS total_cost
      FROM traces
      WHERE project_id = ?
        AND agent_name IS NOT NULL
        AND agent_name != ''
      GROUP BY agent_name
      ORDER BY trace_count DESC
    `).bind(projectId).all();

    // ── Build edges: parent-child & handoff relationships ──
    // 1) Parent-child: traces that have a parent_trace_id
    const { results: parentChildRows } = await env.DB.prepare(`
      SELECT
        COALESCE(pt.agent_name, 'unknown') AS source_agent,
        t.agent_name                       AS target_agent,
        'parent-child'                     AS edge_type,
        COUNT(*)                           AS weight
      FROM traces t
      JOIN traces pt ON pt.id = t.parent_trace_id
      WHERE t.project_id = ?
        AND t.parent_trace_id IS NOT NULL
        AND t.agent_name IS NOT NULL
        AND t.agent_name != ''
        AND pt.agent_name IS NOT NULL
        AND pt.agent_name != ''
      GROUP BY pt.agent_name, t.agent_name
    `).bind(projectId).all();

    // 2) Handoff steps
    const { results: handoffRows } = await env.DB.prepare(`
      SELECT
        t.agent_name               AS source_agent,
        s.handoff_to_agent         AS target_agent,
        'handoff'                  AS edge_type,
        COUNT(*)                   AS weight
      FROM steps s
      JOIN traces t ON t.id = s.trace_id
      WHERE t.project_id = ?
        AND s.step_type = 'handoff'
        AND s.handoff_to_agent IS NOT NULL
        AND s.handoff_to_agent != ''
        AND t.agent_name IS NOT NULL
        AND t.agent_name != ''
      GROUP BY t.agent_name, s.handoff_to_agent
    `).bind(projectId).all();

    // ── Build topology response ──
    // Determine the node type based on whether this agent appears as a parent
    const parentAgentNames = new Set(
      parentChildRows.map(r => r.source_agent)
    );

    const nodes = agentRows.map(row => {
      const isParent = parentAgentNames.has(row.agent_name);
      return {
        id: row.agent_name,
        name: row.agent_name,
        role: row.agent_role || 'agent',
        nodeType: isParent ? 'parent' : 'agent',
        status: row.failed_count > 0 ? 'has_errors' : (row.completed_count > 0 ? 'active' : 'idle'),
        traceCount: row.trace_count,
        completedCount: row.completed_count,
        failedCount: row.failed_count,
        totalLatencyMs: row.total_latency_ms || 0,
        totalCost: row.total_cost || 0,
      };
    });

    // Merge parent-child and handoff edges, dedupe by (source, target, type)
    const edgeMap = new Map();
    const addEdge = (source, target, edgeType, weight) => {
      const key = `${source}|${target}|${edgeType}`;
      if (edgeMap.has(key)) {
        edgeMap.get(key).weight += weight;
      } else {
        edgeMap.set(key, { source, target, type: edgeType, weight, label: edgeType });
      }
    };

    parentChildRows.forEach(r => addEdge(r.source_agent, r.target_agent, 'parent-child', r.weight));
    handoffRows.forEach(r => addEdge(r.source_agent, r.target_agent, 'handoff', r.weight));

    const edges = Array.from(edgeMap.values());

    // Stats for the frontend
    const stats = {
      totalAgents: nodes.length,
      totalEdges: edges.length,
      handoffCount: handoffRows.length,
      parentChildCount: parentChildRows.length,
    };

    return json({ nodes, edges, stats });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}
