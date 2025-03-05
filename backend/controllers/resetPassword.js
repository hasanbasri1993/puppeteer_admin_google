const listUserExport = require('../services/googleApiService.js');


module.exports = {
  resetPassword: async (req, res) => {
    const results = [];
    try {
      await listUserExport();
      results.push({ status: 'success' });
    } catch (error) {
      results.push({ status: 'failed', error: error.message });
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    res.json({ success: true, results });
  }
}