require('dotenv').config(); // Harus ada sebelum menggunakan process.env
const express = require('express')
const userRoutes = require('./routers/index.js')
const history = require('connect-history-api-fallback')
const path = require('path')
const logger = require('pino')()
const cors = require('cors');
const { instance, close } = require('./services/browserInstance');
const memoryMonitor = require('./utils/memoryMonitor');
const telegramLoggingMiddleware = require('./middlewares/telegramLogging');

logger.info('Server is starting...')
const app = express();
const port = process.env.PORT || 7123;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add Telegram logging middleware for API routes
app.use('/api', telegramLoggingMiddleware);

app.use(history({
  rewrites: [
    { from: /^\/api\/.*$/, to: function(context) {
      return context.parsedUrl.pathname;
    }}
  ]
}))
// Enable CORS for all routes
app.use(cors({
  origin: 'http://localhost:5173', // Allow only this origin
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Allow specific methods
  credentials: true // Allow cookies and credentials
}));

// Routes
app.use('/api', userRoutes);

// Static files and catch-all route (must be after API routes)
app.use(express.static(path.join(__dirname, '/public')))
app.use((req, res, next) => {
  res.status(200).sendFile(path.join(__dirname + '/public/index.html'));
});

// In the initializeApp function:
const initializeApp = async () => {
  try {
    logger.info('Initialize browser instance...')
    
    // Start memory monitoring
    memoryMonitor.startMonitoring(30000); // Check every 30 seconds
    
    // Log initial memory usage
    const initialMemory = memoryMonitor.getMemoryUsage();
    logger.info(`Initial memory usage: ${JSON.stringify(initialMemory)}`);
    
    await instance.initialize(
      process.env.GOOGLE_ADMIN_USERNAME,
      process.env.GOOGLE_ADMIN_PASSWORD
    );
    logger.info('Initialized browser instance successfully')
    await instance.performRelogin(
      process.env.GOOGLE_ADMIN_USERNAME,
      process.env.GOOGLE_ADMIN_PASSWORD
    );
    logger.info('Initialized relogin instance successfully')

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
      logger.info(`Server started successfully on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to initialize:', error);
    logger.error('Failed to initialize:', error);
    process.exit(1);
  }
};

initializeApp();

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  memoryMonitor.stopMonitoring();
  await close();
  process.exit();
});