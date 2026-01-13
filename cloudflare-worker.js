// Cloudflare Worker for api.trizly.xyz
// This proxies all requests to the API Hub on port 20942

const API_HUB_URL = 'http://65.21.16.214:20942';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    
    // Build target URL
    const targetUrl = `${API_HUB_URL}${url.pathname}${url.search}`;
    
    // Forward the request
    const modifiedRequest = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'follow'
    });
    
    try {
      const response = await fetch(modifiedRequest);
      
      // Return response with CORS if needed
      const newResponse = new Response(response.body, response);
      newResponse.headers.set('Access-Control-Allow-Origin', '*');
      
      return newResponse;
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: 'Proxy error', 
        message: error.message,
        target: API_HUB_URL
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
