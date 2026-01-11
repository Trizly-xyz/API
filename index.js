const express = require('express');
const logger = require('./src/utils/logger');

// Import individual API modules
const lumiApi = require('./lumi/api');

module.exports = function startApiHub(eventBus) {
  const app = express();

  // Health check for the entire API hub
  app.get('/', (req, res) => {
    res.json({ 
      status: 'online', 
      service: 'API Hub', 
      timestamp: new Date().toISOString(),
      apis: ['lumi']
    });
  });

  // Mount Lumi API
  const lumiApp = lumiApi(eventBus);
  app.use('/', lumiApp);

  // Global error handler
  app.use((err, req, res, next) => {
    logger.error('API Hub unhandled error', { error: err.message, stack: err.stack });
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
};
