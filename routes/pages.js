const express = require('express');
const router = express.Router();
const {isAuthenticated, isAuthorizedForReset} = require('../middlewares/authMiddleware');
const {turnOffChallenge} = require('../controllers/turnOff.js'); // Ambil fungsi dari objek
const {resetPassword} = require('../controllers/resetPassword.js'); // Ambil fungsi dari objek
const {instance} = require('../services/browserInstance');
const fs = require('fs');
const path = require('path');
const authMiddleware = require("../middlewares/authMiddleware");

// New routes for the web application
// Load content for dashboard
router.get(
    '/load-content/:page',
    isAuthenticated,
    (req, res, next) => {
        const rawPage = req.params.page;
        // Map short aliases to actual partial filenames
        const aliasMap = {
            'turn-off': 'turn-off-challenge',
            'reset-password': 'reset-password'
        };

        req.requestedPartial = aliasMap[rawPage] || rawPage;

        if (req.requestedPartial === 'reset-password') {
            return isAuthorizedForReset(req, res, next);
        }

        next();
    },
    (req, res) => {
        const page = req.requestedPartial;
        const filePath = path.join(__dirname, '../views/partials', `${page}.ejs`);

        if (fs.existsSync(filePath)) {
            const pusherId = process.env.KEY;
            const canResetPassword = authMiddleware.isUserAuthorizedForReset(req.user);
            res.render(`partials/${page}`, {user: req.user, canResetPassword, pusherId});
        } else {
            res.status(404).send('Content not found');
        }
    }
);

// Get classes from ids.json
router.get('/get-classes', (req, res) => {
    try {
        const idsPath = path.join(__dirname, '../ids.json');
        const idsData = JSON.parse(fs.readFileSync(idsPath, 'utf8'));

        // Extract unique classes
        const classes = [...new Set(idsData.map(item => item.KELAS))];
        res.json(classes);
    } catch (error) {
        console.error('Error reading ids.json:', error);
        res.status(500).json({error: 'Failed to read classes data'});
    }
});

// Get NIS list by class
router.get('/get-nis-by-class', (req, res) => {
    try {
        const {kelas} = req.query;
        const idsPath = path.join(__dirname, '../ids.json');
        const idsData = JSON.parse(fs.readFileSync(idsPath, 'utf8'));

        // Filter by class and extract NIS
        const nisList = idsData
            .filter(item => item.KELAS === kelas)
            .map(item => item.NIS);

        res.json({nis_list: nisList});
    } catch (error) {
        console.error('Error reading ids.json:', error);
        res.status(500).json({error: 'Failed to read NIS data'});
    }
});

module.exports = router;