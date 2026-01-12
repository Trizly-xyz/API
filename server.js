require('dotenv').config({ path: './.env' });
const startApiHub = require('./index');
const logger = require('./src/utils/logger');
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

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
  logger.error('Unhandled rejection', { reason: String(reason) });
  process.exit(1);
});

async function main() {
  console.log('🔄 Initializing API Hub Gateway...');
  
  try {
    logger.info('Starting API Hub Gateway...');

    // Start API hub (no database needed - just a proxy)
    const app = startApiHub();
    
    const server = app.listen(PORT, () => {
      const localIP = getLocalIP();
      console.log('\n╔═══════════════════════════════════════════════════╗');
      console.log('║         🚀 API Hub Gateway Started                ║');
      console.log('╠═══════════════════════════════════════════════════╣');
      console.log(`║ Port:   ${PORT}                                        ║`);
      console.log(`║ IP:     ${localIP}                           ║`);
      console.log(`║ Access: http://${localIP}:${PORT}            ║`);
      console.log('║ Domain: https://api.trizly.xyz                    ║');
      console.log('╠═══════════════════════════════════════════════════╣');
      console.log('║ Proxying to Services:                             ║');
      console.log('║   /lumi/* → Lumi Bot API (37.27.141.177:22028)    ║');
      console.log('╚═══════════════════════════════════════════════════╝\n');
      logger.info(`API Hub Gateway listening on port ${PORT}`);
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
    logger.error('Failed to start API Hub Gateway', { error: error.message, stack: error.stack });
    console.error('\n❌ FATAL ERROR: API Hub Gateway failed to start');
    console.error('Error:', error.message);
    console.error('\nExiting with code 1...\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled error in main:', err);
  process.exit(1);
});
