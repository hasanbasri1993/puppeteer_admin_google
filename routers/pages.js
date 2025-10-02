const express = require('express');
const router = express.Router();
const { turnOffChallenge } = require('../controllers/turnOff.js'); // Ambil fungsi dari objek
const { resetPassword } = require('../controllers/resetPassword.js'); // Ambil fungsi dari objek
const { instance } = require('../services/browserInstance');
const fs = require('fs');
const path = require('path');

// New routes for the web application
// Load content for dashboard
router.get('/load-content/:page', (req, res) => {
  const rawPage = req.params.page;
  // Map short aliases to actual partial filenames
  const aliasMap = {
    'turn-off': 'turn-off-challenge',
    'turnoff': 'turn-off-challenge',
    'reset': 'reset-password',
    'reset-password': 'reset-password'
  };

  const page = aliasMap[rawPage] || rawPage;

  const filePath = path.join(__dirname, '../views/partials', `${page}.ejs`);
  
  if (fs.existsSync(filePath)) {
    res.render(`partials/${page}`, { user: req.user });
  } else {
    res.status(404).send('Content not found');
  }
});

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
    res.status(500).json({ error: 'Failed to read classes data' });
  }
});

// Get NIS list by class
router.get('/get-nis-by-class', (req, res) => {
  try {
    const { kelas } = req.query;
    const idsPath = path.join(__dirname, '../ids.json');
    const idsData = JSON.parse(fs.readFileSync(idsPath, 'utf8'));
    
    // Filter by class and extract NIS
    const nisList = idsData
      .filter(item => item.KELAS === kelas)
      .map(item => item.NIS);
    
    res.json({ nis_list: nisList });
  } catch (error) {
    console.error('Error reading ids.json:', error);
    res.status(500).json({ error: 'Failed to read NIS data' });
  }
});

module.exports = router;