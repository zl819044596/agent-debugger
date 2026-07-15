// GET  /api/auth/projects - List projects
// POST /api/auth/projects - Create a new project
import { json, error, handleOptions, authenticate, randomHex } from '../_auth';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return handleOptions();

  const auth = await authenticate(env.DB, request);
  if (!auth) return json({ error: 'Not authenticated' }, 401);

  try {
    // GET: List projects
    if (request.method === 'GET') {
      const { results: projects } = await env.DB.prepare(
        `SELECT p.id, p.name, p.created_at,
                (SELECT COUNT(*) FROM traces t WHERE t.project_id = p.id) as trace_count
         FROM projects p
         WHERE p.user_id = ?
         ORDER BY p.created_at DESC`
      ).bind(auth.user.id).all();

      return json({ projects: projects || [] });
    }

    // POST: Create project
    if (request.method === 'POST') {
      const { name } = await request.json();
      if (!name) return error('Project name required');

      const projectId = randomHex(16);
      await env.DB.prepare(
        'INSERT INTO projects (id, user_id, name) VALUES (?, ?, ?)'
      ).bind(projectId, auth.user.id, name).run();

      return json({
        project: { id: projectId, name, created_at: new Date().toISOString(), trace_count: 0 },
      }, 201);
    }

    return error('Method not allowed', 405);

  } catch (err) {
    return error(err.message, 500);
  }
}
