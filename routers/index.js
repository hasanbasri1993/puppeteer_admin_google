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

// Turn off challenge endpoint
router.post('/turn-off-challenge', (req, res) => {
  try {
    const { nis } = req.body;
    
    if (!nis || !Array.isArray(nis)) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'NIS array is required' 
      });
    }
    
    // Log the received NIS for now
    console.log('Received NIS for turn off challenge:', nis);
    
    res.json({ 
      status: 'sukses', 
      message: `Challenge untuk ${nis.length} siswa telah dimatikan.` 
    });
  } catch (error) {
    console.error('Error in turn-off-challenge:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Terjadi kesalahan saat memproses permintaan' 
    });
  }
});

// Reset password endpoint
router.post('/reset-password', (req, res) => {
  try {
    const { nis, batch_ids } = req.body;
    
    if (nis) {
      // Single NIS reset
      console.log(`Mereset password untuk NIS: ${nis} menjadi 'Dulido@240696'.`);
      res.json({ 
        status: 'sukses', 
        message: 'Password berhasil direset.' 
      });
    } else if (batch_ids && Array.isArray(batch_ids)) {
      // Batch reset
      console.log(`Mereset password untuk ID batch: ${batch_ids.join(', ')}.`);
      res.json({ 
        status: 'sukses', 
        message: 'Password berhasil direset.' 
      });
    } else {
      res.status(400).json({ 
        status: 'error', 
        message: 'NIS atau batch_ids diperlukan' 
      });
    }
  } catch (error) {
    console.error('Error in reset-password:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Terjadi kesalahan saat memproses permintaan' 
    });
  }
});

module.exports = router;