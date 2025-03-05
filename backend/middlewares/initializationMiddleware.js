const { isInitialized } = require('../services/browserInstance');

module.exports = (req, res, next) => {
  if (!isInitialized()) {
    return res.status(500).json({ error: 'Service not initialized' });
  }
  next();
};