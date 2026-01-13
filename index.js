const express = require('express');
const logger = require('./src/utils/logger');
const axios = require('axios');

// Service registry - add your services here
const SERVICES = {
  lumi: {
    url: process.env.LUMI_API_URL || 'http://37.27.141.177:22028',
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

  // Health check for API Hub
  app.get('/', async (req, res) => {
    const serviceHealth = {};
    
    for (const [key, service] of Object.entries(SERVICES)) {
      serviceHealth[key] = await checkServiceHealth(key, service.url);
    }
    
    res.json({ 
      status: 'online', 
      service: 'API Hub Gateway', 
      timestamp: new Date().toISOString(),
      services: serviceHealth
    });
  });

  // Dedicated health endpoint
  app.get('/health', async (req, res) => {
    const serviceHealth = {};
    
    for (const [key, service] of Object.entries(SERVICES)) {
      serviceHealth[key] = await checkServiceHealth(key, service.url);
    }
    
    res.json({ 
      status: 'online', 
      service: 'API Hub Gateway', 
      timestamp: new Date().toISOString(),
      services: serviceHealth
    });
  });

  // Proxy all /lumi/* requests to Lumi Bot API
  app.all('/lumi/*', async (req, res) => {
    const servicePath = req.path.replace('/lumi', '');
    const targetUrl = `${SERVICES.lumi.url}${servicePath}`;
    
    try {
      const response = await axios({
        method: req.method,
        url: targetUrl,
        data: req.body,
        headers: {
          ...req.headers,
          host: undefined // Remove host header
        },
        validateStatus: () => true // Don't throw on any status
      });

      res.status(response.status).json(response.data);
    } catch (error) {
      logger.error('Proxy error', { service: 'lumi', error: error.message });
      res.status(502).json({ error: 'Service unavailable', service: 'lumi' });
    }
  });

  // Global error handler
  app.use((err, req, res, next) => {
    logger.error('API Hub error', { error: err.message, stack: err.stack });
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
};
