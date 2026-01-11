require('dotenv').config({ path: './.env' });
const startApiHub = require('./index');
const logger = require('./src/utils/logger');
const { connectDB } = require('./src/utils/database');
const EventEmitter = require('events');

const PORT = process.env.API_PORT || 3000;

async function main() {
  try {
    logger.info('Starting API Hub...');
    
    // Connect to database
    await connectDB();
    logger.info('Database connected');

    // Create event bus for inter-service communication
    const eventBus = new EventEmitter();
    
    // Start API hub
    const app = startApiHub(eventBus);
    
    const server = app.listen(PORT, () => {
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
    process.exit(1);
  }
}

main();
