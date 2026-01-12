require('dotenv').config({ path: './.env' });
const startApiHub = require('./index');
const logger = require('./src/utils/logger');
const { connectDB } = require('./src/utils/database');
const EventEmitter = require('events');
const os = require('os');

const PORT = process.env.API_PORT || 3000;

// Get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

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
      const localIP = getLocalIP();
      console.log('\n╔════════════════════════════════════════╗');
      console.log('║        🚀 API Hub Started              ║');
      console.log('╠════════════════════════════════════════╣');
      console.log(`║ Port:     ${PORT.toString().padEnd(33)}║`);
      console.log(`║ Local IP: http://${localIP}:${PORT}`.padEnd(38) + '║');
      console.log(`║ Domain:   https://api.trizly.xyz      ║`);
      console.log('╠════════════════════════════════════════╣');
      console.log('║ Available APIs:                        ║');
      console.log('║   • GET  /                             ║');
      console.log('║   • POST /lumi/verify/complete         ║');
      console.log('║   • POST /lumi/unlink/complete         ║');
      console.log('║   • GET  /lumi/lookup                  ║');
      console.log('║   • GET  /lumi/verify                  ║');
      console.log('╚════════════════════════════════════════╝\n');
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
