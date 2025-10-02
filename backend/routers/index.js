const express = require('express');
const router = express.Router();
const { turnOffChallenge } = require('../controllers/turnOff.js'); // Ambil fungsi dari objek
const { resetPassword } = require('../controllers/resetPassword.js'); // Ambil fungsi dari objek
const { instance } = require('../services/browserInstance');

router.post('/reset_password', resetPassword);
router.get('/hai', (req, res) => {
  res.send('Hello World');
});
router.post('/turn_off', turnOffChallenge);

// Manual relogin endpoint
router.post('/relogin', async (req, res) => {
  try {
    const result = await instance.triggerManualRelogin(
      process.env.GOOGLE_ADMIN_USERNAME,
      process.env.GOOGLE_ADMIN_PASSWORD
    );
    
    if (result.success) {
      res.json({ success: true, message: result.message });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;