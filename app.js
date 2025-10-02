require('dotenv').config(); // Harus ada sebelum menggunakan process.env
const express = require('express')
const userRoutes = require('./routers/index.js')
const pagesRoutes = require('./routers/pages.js')
const path = require('path')
const logger = require('pino')()
const { instance, close } = require('./services/browserInstance');
const memoryMonitor = require('./utils/memoryMonitor');
const telegramLoggingMiddleware = require('./middlewares/telegramLogging');
const session = require('express-session');
const passport = require('passport');
const authRoutes = require('./routes/auth');
const authMiddleware = require('./middlewares/authMiddleware');

// Configure Passport
require('./config/passport');

logger.info('Server is starting...')
const app = express();
const port = process.env.PORT || 7123;

// Configure EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add Telegram logging middleware for API routes
app.use('/api', telegramLoggingMiddleware);

// Routes
app.use('/api', userRoutes);
app.use('/pages', pagesRoutes);

// Auth routes
app.use('/auth', authRoutes);

// Web application routes
app.get('/', (req, res) => {
  if (req.isAuthenticated()) {
    res.redirect('/dashboard');
  } else {
    res.render('login');
  }
});

app.get('/dashboard', authMiddleware.isAuthenticated, (req, res) => {
  res.render('dashboard', { user: req.user });
});

app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/');
  });
});

// In the initializeApp function:
const initializeApp = async () => {
  try {
    logger.info('Initialize browser instance...')
    
    // // Start memory monitoring
    // memoryMonitor.startMonitoring(30000); // Check every 30 seconds
    
    // // Log initial memory usage
    // const initialMemory = memoryMonitor.getMemoryUsage();
    // logger.info(`Initial memory usage: ${JSON.stringify(initialMemory)}`);
    
    // await instance.initialize(
    //   process.env.GOOGLE_ADMIN_USERNAME,
    //   process.env.GOOGLE_ADMIN_PASSWORD
    // );
    // logger.info('Initialized browser instance successfully')
    // await instance.performRelogin(
    //   process.env.GOOGLE_ADMIN_USERNAME,
    //   process.env.GOOGLE_ADMIN_PASSWORD
    // );
    // logger.info('Initialized relogin instance successfully')

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