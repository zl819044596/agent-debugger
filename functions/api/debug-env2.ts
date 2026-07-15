// GET /api/debug-env2 - Detailed env var debug
export async function onRequest(context) {
  const { env } = context;
  
  const keys = Object.keys(env).filter(k => !k.startsWith('_')).sort();
  const details = keys.map(k => ({
    name: k,
    name_hex: Array.from(k).map(c => c.charCodeAt(0).toString(16)).join(' '),
    name_length: k.length,
    name_chars: Array.from(k).map(c => c + '(' + c.charCodeAt(0) + ')').join(''),
    value_prefix: typeof env[k] === 'string' ? env[k].substring(0, 12) : typeof env[k],
  }));
  
  return new Response(JSON.stringify({ keys, details }, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
