require('dotenv').config({ path: './.env' });
const startApiHub = require('./index');
const logger = require('./src/utils/logger');
const { connectDB } = require('./src/utils/database');
const EventEmitter = require('events');

const PORT = process.env.API_PORT || 3000;

async function main() {
  try {
    logger.info('Starting API Hub...');
    
    // Connect to database - with timeout
    try {
      await Promise.race([
        connectDB(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('MongoDB connection timeout')), 10000)
        )
      ]);
      logger.info('Database connected');
    } catch (dbErr) {
      logger.warn('Database connection failed - continuing anyway', { error: dbErr.message });
      // Continue anyway - API can still serve some requests
    }

    // Create event bus for inter-service communication
    const eventBus = new EventEmitter();
    
    // Start API hub
    const app = startApiHub(eventBus);
    
    const server = app.listen(PORT, () => {
      console.log('\n╔═══════════════════════════════════════════════════╗');
      console.log('║           🚀 API Hub Started                      ║');
      console.log('╠═══════════════════════════════════════════════════╣');
      console.log('║ Domain: https://api.trizly.xyz                    ║');
      console.log('╠═══════════════════════════════════════════════════╣');
      console.log('║ Available Endpoints:                              ║');
      console.log('║                                                   ║');
      console.log('║ GET  /                    - API Hub health        ║');
      console.log('║ GET  /lumi/verify         - Verify service info   ║');
      console.log('║ POST /lumi/verify/callback - Discord OAuth        ║');
      console.log('║ POST /lumi/verify/roblox  - Roblox OAuth          ║');
      console.log('║ POST /lumi/verify/complete - Verify webhook       ║');
      console.log('║ POST /lumi/unlink/complete - Unlink webhook       ║');
      console.log('║ GET  /lumi/lookup         - Lookup service info   ║');
      console.log('║ GET  /lumi/lookup/discord/:id - Discord lookup    ║');
      console.log('║ GET  /lumi/lookup/roblox/:id  - Roblox lookup     ║');
      console.log('╚═══════════════════════════════════════════════════╝\n');
      logger.info(`API Hub listening on port ${PORT}`);
      logger.info('Available APIs: /lumi/*');
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start API Hub', { error: error.message, stack: error.stack });
    // Don't exit - let container orchestration handle restart
    logger.error('ERROR: API Hub startup failed, but server may still be needed. Check logs above.');
  }
}

main();
