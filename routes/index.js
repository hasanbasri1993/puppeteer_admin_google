const express = require('express');
const multer = require('multer');
const router = express.Router();
const {turnOffChallenge} = require('../controllers/turnOff.js'); // Ambil fungsi dari objek
const {resetPassword} = require('../controllers/resetPassword.js'); // Ambil fungsi dari objek
const adminController = require('../controllers/adminController');
const {instance} = require('../services/browserInstance');
const {isAuthenticated, isAuthorizedForReset} = require('../middlewares/authMiddleware');

const uploadIdsFile = multer({
    storage: multer.memoryStorage(),
    limits: {fileSize: 20 * 1024 * 1024} // 20MB
});

router.post('/reset_password', isAuthenticated, isAuthorizedForReset, resetPassword);

// Admin management (add/remove authorized admin emails)
router.get('/admin/list', isAuthenticated, isAuthorizedForReset, adminController.listAdmins);
router.post('/admin/add', isAuthenticated, isAuthorizedForReset, adminController.addAdmin);
router.post('/admin/remove', isAuthenticated, isAuthorizedForReset, adminController.removeAdmin);

// Replace ids.json with an uploaded file
router.post('/admin/upload-ids', isAuthenticated, isAuthorizedForReset, uploadIdsFile.single('file'), adminController.uploadIds);
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
            res.json({success: true, message: result.message});
        } else {
            res.status(500).json({success: false, error: result.error});
        }
    } catch (error) {
        res.status(500).json({success: false, error: error.message});
    }
});

module.exports = router;