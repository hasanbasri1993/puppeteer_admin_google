import express, { json } from 'express';
const cors = require('cors');

import userRoutes from './routers/index';
import history from 'connect-history-api-fallback'
import path from 'path'

const { instance, close } = require('./services/browserInstance');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(json());
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
    await instance.initialize(
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