const { instance } = require('../services/browserInstance');
const Pusher = require('../config/pusher'); // Correct import
const fs = require('fs');
const path = require('path');
const logger = require('pino')()

module.exports = {
  turnOffChallenge: async (req, res) => {
    const ids = req.body.idS?.split(',').map(id => id.trim()) || [];
    const uniqueIds = [...new Set(ids)];
    // Read the JSON file
    const filePath = path.join(process.cwd(), 'ids.json');
    const data = fs.readFileSync(filePath, 'utf8');
    const jsonData = JSON.parse(data);

    // Extract all NIS values from jsonData
    const allNIS = jsonData.map(item => item.NIS);

    // Find NIS values that are not found in jsonData
    const notFoundIds = uniqueIds.filter(id => !allNIS.includes(id));

    // Filter jsonData to only include ID_GOOGLE values that match the provided ids
    const filteredIds = jsonData
      .filter(item => uniqueIds.includes(item.NIS)) // Filter by NIS

    const results = [];
    if (notFoundIds.length > 0) {
      Pusher.trigger("turn_off", "status-update", { id: 0, message: "Not found this NIS, " + notFoundIds.join(', ') });
      logger.error('Not found this NIS, ' + notFoundIds.join(', '));
    }
    try {
      // Execute all handleSecurityChallenge calls concurrently
      const results = await Promise.all(filteredIds.reverse().map(async (id) => {
        try {
          await instance.handleSecurityChallenge(id.ID_GOOGLE);
          logger.info('Turn off for 10 mins success for: ' + id.NAMA);
          Pusher.trigger("turn_off", "status-update", { id: id.NAMA, message: "Success email: " + id.NIS + "@daarululuumlido.com" });
          return { id, status: 'success' };
        } catch (error) {
          logger.error('Turn off for 10 mins failed for: ' + id.NAMA);
          Pusher.trigger("turn_off", "status-update", { id, message: error.message });
          return { id, status: 'failed', error: error.message };
        }
      }));

      // Open a new tab with the count of filteredIds
      res.json({
        success: true,
        results,
        notFoundIds,
      });

    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};
