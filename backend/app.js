require('dotenv').config(); // Harus ada sebelum menggunakan process.env
const express = require('express')
const userRoutes = require('./routers/index.js')
const history = require('connect-history-api-fallback')
const path = require('path')
const logger = require('pino')()
const cors = require('cors');
const { instance, close } = require('./services/browserInstance');

logger.info('Server is starting...')
const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
//app.use(json());
app.use(history())
// Enable CORS for all routes
app.use(cors({
  origin: 'http://localhost:5173', // Allow only this origin
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Allow specific methods
  credentials: true // Allow cookies and credentials
}));

// Routes
app.use('/api', userRoutes);
app.use(express.static(path.join(__dirname, '/public')))
app.use((req, res, next) => {
  res.status(200).sendFile(path.join(__dirname + '/public/index.html'));
});

// In the initializeApp function:
const initializeApp = async () => {
  try {
    logger.info('Initialize browser instance...')
    await instance.initialize(
      process.env.GOOGLE_ADMIN_USERNAME,
      process.env.GOOGLE_ADMIN_PASSWORD
    );
    logger.info('Initialized browser instance successfully')
    await instance.performRelogin(
      process.env.GOOGLE_ADMIN_USERNAME,
      process.env.GOOGLE_ADMIN_PASSWORD
    );

    app.listen(port, () => console.log(`Server running on port ${port}`));
  } catch (error) {
    console.error('Failed to initialize:', error);
    process.exit(1);
  }
};

initializeApp();

// Graceful shutdown
process.on('SIGINT', async () => {
  await close();
  process.exit();
});