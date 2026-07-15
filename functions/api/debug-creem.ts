// GET /api/debug-creem - Test Creem API product lookup
export async function onRequest(context) {
  const { env } = context;
  
  try {
    const res = await fetch('https://api.creem.io/v1/products', {
      headers: { 'x-api-key': env.CREEM_API_KEY, 'Accept': 'application/json' },
    });
    
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch(e) { parsed = text; }
    
    const productsList = parsed?.data || parsed?.results || parsed;
    const foundProduct = Array.isArray(productsList) 
      ? productsList.filter(p => p.name?.includes?.('Agent'))
      : null;
    
    return new Response(JSON.stringify({
      http_status: res.status,
      raw_type: typeof parsed,
      is_array: Array.isArray(parsed),
      keys: typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed).slice(0,10) : null,
      has_data: !!parsed?.data,
      data_length: parsed?.data?.length,
      has_results: !!parsed?.results,
      results_length: parsed?.results?.length,
      product_count: Array.isArray(productsList) ? productsList.length : null,
      all_product_names: Array.isArray(productsList) ? productsList.map(p => p.name || p.id) : null,
      found_agent_products: foundProduct?.map(p => ({ id: p.id, name: p.name, price_id: p.price_id })),
    }, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
