const { instance } = require('../services/browserInstance');
const Pusher = require('../config/pusher'); // Correct import
const fs = require('fs');
const path = require('path');

exports.turnOffChallenge = async (req, res) => {
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

  }
  for (const id of filteredIds) {
    try {
      await instance.handleSecurityChallenge(id.ID_GOOGLE);
      results.push({ id, status: 'success' });
      Pusher.trigger("turn_off", "status-update", { id: id.NAMA, message: "Succes email: " + id.NIS + "@daarululuumlido.com" });
    } catch (error) {
      Pusher.trigger("turn_off", "status-update", { id: id, message: error.message });
      results.push({ id, status: 'failed', error: error.message });
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  res.json({ success: true, results, notFoundIds });
};