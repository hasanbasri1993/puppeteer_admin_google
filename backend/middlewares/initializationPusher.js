import { isInitialized } from '../services/authGoogleApiService';

export default (req, res, next) => {
  if (!isInitialized) {
    return res.status(500).json({ error: 'Service not initialized' });
  }
  next();
};