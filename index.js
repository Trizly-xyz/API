const express = require('express');
const logger = require('./src/utils/logger');
const axios = require('axios');

// Service registry - add your services here
const SERVICES = {
  lumi: {
    // Use internal service address to avoid hairpin NAT
    url: 'http://37.27.141.177:22028',
    name: 'Lumi Bot API'
  }
  // Add more services here as needed
  // service2: { url: 'http://...', name: '...' }
};

// Check service health
async function checkServiceHealth(serviceName, serviceUrl) {
  try {
    const response = await axios.get(`${serviceUrl}/health`, { timeout: 5000 });
    return { status: 'online', lastCheck: new Date().toISOString() };
  } catch (error) {
    return { status: 'offline', error: error.message, lastCheck: new Date().toISOString() };
  }
}

module.exports = function startApiHub() {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check for API Hub - quick response without blocking
  app.get('/', (req, res) => {
    res.json({ 
      status: 'online', 
      service: 'API Hub Gateway', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // Dedicated health endpoint
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'online', 
      service: 'API Hub Gateway', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // Proxy /lumi and /lumi/* requests to Lumi Bot API
  // Map /lumi to Lumi root health (since Lumi has /health at root)
  app.all('/lumi', (req, res) => {
    const targetUrl = `${SERVICES.lumi.url}/health`;
    proxyRequest(req, res, targetUrl);
  });

  // Preserve full path for /lumi/* → forward to Lumi as-is (e.g., /lumi/verify)
  app.all('/lumi/*', (req, res) => {
    const targetUrl = `${SERVICES.lumi.url}${req.path}`;
    proxyRequest(req, res, targetUrl);
  });

  // Helper function to proxy requests
  function proxyRequest(req, res, targetUrl) {
    
    try {
      // Prepare request body
      let requestBody = null;
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        requestBody = req.body;
      }

      // Normalize headers: only pass through safe headers for internal proxying
      const proxyHeaders = {
        'Content-Type': req.headers['content-type'],
        'Content-Length': req.headers['content-length'],
        'X-Verify-Secret': req.headers['x-verify-secret'],
        'X-Verification-Sig': req.headers['x-verification-sig'],
        'Authorization': req.headers['authorization'],
        host: undefined,
        connection: 'close'
      };
      
      // Remove undefined headers
      Object.keys(proxyHeaders).forEach(key => 
        proxyHeaders[key] === undefined && delete proxyHeaders[key]
      );

      // Make proxy request
      axios({
        method: req.method,
        url: targetUrl,
        data: requestBody,
        headers: proxyHeaders,
        validateStatus: () => true, // Don't throw on any status
        timeout: 30000 // 30 second timeout
      }).then(response => {
        // Forward response headers (except content-encoding for safety)
        Object.keys(response.headers).forEach(key => {
          if (!['content-encoding', 'transfer-encoding'].includes(key.toLowerCase())) {
            res.set(key, response.headers[key]);
          }
        });
        
        res.status(response.status);
        
        // Send response
        if (response.data) {
          if (typeof response.data === 'object') {
            res.json(response.data);
          } else {
            res.send(response.data);
          }
        } else {
          res.end();
        }
      }).catch(error => {
        logger.error('Proxy request failed', { service: 'lumi', error: error.message, url: targetUrl });
        res.status(502).json({ error: 'Service unavailable', service: 'lumi', message: error.message });
      });
    } catch (error) {
      logger.error('Proxy error', { service: 'lumi', error: error.message });
      res.status(502).json({ error: 'Service unavailable', service: 'lumi' });
    }
  }

  // Global error handler
  app.use((err, req, res, next) => {
    logger.error('API Hub error', { error: err.message, stack: err.stack });
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
};
