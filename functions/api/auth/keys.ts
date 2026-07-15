// GET  /api/auth/keys    - List API keys for current user
// POST /api/auth/keys    - Create a new API key
import {
  json, error, handleOptions, authenticate, randomHex, hashPassword
} from '../_auth';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return handleOptions();

  const auth = await authenticate(env.DB, request);
  if (!auth) return json({ error: 'Not authenticated' }, 401);

  try {
    // GET: List keys
    if (request.method === 'GET') {
      const { results: keys } = await env.DB.prepare(
        `SELECT ak.id, ak.name, ak.project_id, p.name as project_name,
                ak.created_at, ak.last_used_at
         FROM api_keys ak
         JOIN projects p ON p.id = ak.project_id
         WHERE ak.user_id = ?
         ORDER BY ak.created_at DESC`
      ).bind(auth.user.id).all();

      // Mask keys for display
      const masked = (keys || []).map(k => ({
        ...k,
        key_preview: k.id.length > 12 ? k.id.substring(0, 12) + '...' : k.id,
      }));

      return json({ keys: masked });
    }

    // POST: Create key
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { name, project_id } = body;

      // Validate project belongs to user
      if (project_id) {
        const project = await env.DB.prepare(
          'SELECT id FROM projects WHERE id = ? AND user_id = ?'
        ).bind(project_id, auth.user.id).first();
        if (!project) return error('Project not found', 404);
      }

      // If no project_id, use first project
      let targetProjectId = project_id;
      if (!targetProjectId) {
        const firstProject = await env.DB.prepare(
          'SELECT id FROM projects WHERE user_id = ? ORDER BY created_at ASC LIMIT 1'
        ).bind(auth.user.id).first();
        if (!firstProject) return error('No project found. Create a project first.', 400);
        targetProjectId = firstProject.id;
      }

      const keyId = `ad_${randomHex(32)}`;
      const keySalt = randomHex(16);
      const keyHash = await hashPassword(keyId, keySalt);
      await env.DB.prepare(
        'INSERT INTO api_keys (id, user_id, name, project_id, key_hash) VALUES (?, ?, ?, ?, ?)'
      ).bind(keyId, auth.user.id, name || 'default', targetProjectId, keyHash).run();

      // Return the full key once (won't be shown again)
      return json({
        key: {
          id: keyId,
          name: name || 'default',
          project_id: targetProjectId,
          created_at: new Date().toISOString(),
        },
        warning: 'Save this API key — it will not be shown again',
      }, 201);
    }

    // DELETE: Delete key (pass id in body or URL search param)
    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const keyId = url.searchParams.get('id') ||
                    (await request.json().catch(() => ({}))).id;

      if (!keyId) return error('Missing key id');

      const key = await env.DB.prepare(
        'SELECT id FROM api_keys WHERE id = ? AND user_id = ?'
      ).bind(keyId, auth.user.id).first();

      if (!key) return error('API key not found', 404);

      await env.DB.prepare('DELETE FROM api_keys WHERE id = ?').bind(keyId).run();
      return json({ success: true });
    }

    return error('Method not allowed', 405);

  } catch (err) {
    return error(err.message, 500);
  }
}
