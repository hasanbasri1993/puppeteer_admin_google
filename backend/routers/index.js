const express = require('express');
const router = express.Router();
const { turnOffChallenge } = require('../controllers/turnOff.js'); // Ambil fungsi dari objek
const { resetPassword } = require('../controllers/resetPassword.js'); // Ambil fungsi dari objek

router.post('/reset_password', resetPassword);
router.post('/turn_off', turnOffChallenge);

module.exports = router;