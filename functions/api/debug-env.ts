// GET /api/debug-env - Debug endpoint to check environment variables
export async function onRequest(context) {
  const { env } = context;
  
  const result = {
    creem_key_set: !!env.CREEM_API_KEY,
    creem_key_prefix: env.CREEM_API_KEY ? env.CREEM_API_KEY.substring(0, 12) + '...' : null,
    webhook_secret_set: !!env.CREEM_WEBHOOK_SECRET,
    webhook_secret_prefix: env.CREEM_WEBHOOK_SECRET ? env.CREEM_WEBHOOK_SECRET.substring(0, 8) + '...' : null,
    all_env_keys: Object.keys(env).filter(k => !k.startsWith('_')).sort(),
  };
  
  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
