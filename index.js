const express = require('express');
const logger = require('./src/utils/logger');
const axios = require('axios');
const http = require('http');

// CRITICAL: Check environment variables
const LUMI_URL = process.env.LUMI_API_URL || 'http://37.27.141.177:22028';
console.log(`\n🔗 LUMI_API_URL configured as: ${LUMI_URL}\n`);

// Service registry
const SERVICES = {
  lumi: {
    url: LUMI_URL,
    name: 'Lumi Bot API'
  }
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

  // Proxy /lumi and /lumi/* requests to Lumi Bot API
  app.all('/lumi', (req, res) => {
    const path = '/';
    forwardRequest(req, res, path);
  });

  app.all('/lumi/*', (req, res) => {
    const path = req.path.replace('/lumi', '');
    forwardRequest(req, res, path);
  });

  // Forward request to Lumi
  function forwardRequest(req, res, path) {
    const lumiUrl = new URL(SERVICES.lumi.url);
    const options = {
      hostname: lumiUrl.hostname,
      port: lumiUrl.port || (lumiUrl.protocol === 'https:' ? 443 : 80),
      path: path,
      method: req.method,
      headers: {
        ...req.headers,
        host: lumiUrl.host
      },
      timeout: 30000
    };

    console.log(`📤 Proxying ${req.method} ${req.path} → ${lumiUrl.protocol}//${options.hostname}:${options.port}${path}`);

    const protocol = lumiUrl.protocol === 'https:' ? require('https') : http;
    
    const proxyReq = protocol.request(options, (proxyRes) => {
      console.log(`📥 Response from Lumi: ${proxyRes.statusCode}`);
      
      // Forward status and headers
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (error) => {
      console.error(`❌ Proxy error for ${req.path}:`, error.message);
      logger.error('Proxy request failed', { path, error: error.message, url: SERVICES.lumi.url });
      
      if (!res.headersSent) {
        res.status(502).json({ 
          error: 'Service unavailable', 
          service: 'lumi',
          tried: SERVICES.lumi.url + path,
          reason: error.message 
        });
      }
    });

    proxyReq.on('timeout', () => {
      console.error(`⏱️ Timeout proxying to ${req.path}`);
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ 
          error: 'Gateway timeout',
          service: 'lumi'
        });
      }
    });

    // Forward request body if present
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
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
