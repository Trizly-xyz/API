const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const logger = require('./src/utils/logger');

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

  // This API hub proxies all Lumi traffic. Any Lumi endpoint is reachable here by prefixing it with /lumi.
  app.use('/lumi', createProxyMiddleware({
    target: SERVICES.lumi.url + '/lumi', // Target includes /lumi so proxy auto-strips and re-adds correctly
    changeOrigin: true,
    secure: false,
    logLevel: 'debug',
    onProxyReq: (proxyReq, req, res) => {
      logger.info(`[proxy] ${req.method} /lumi${req.url} → ${SERVICES.lumi.url}/lumi${req.url}`);
    },
    onProxyRes: (proxyRes, req, res) => {
      logger.info(`[proxy] ${req.method} /lumi${req.url} ← ${proxyRes.statusCode}`);
    },
    onError: (err, req, res) => {
      logger.error('[proxy] Error:', { error: err.message, url: req.url });
      res.status(502).json({ error: 'Proxy error', message: err.message });
    }
  }));

  // Global error handler
  app.use((err, req, res, next) => {
    logger.error('API Hub error', { error: err.message, stack: err.stack });
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
};
