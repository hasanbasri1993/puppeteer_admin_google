import { listUserExport } from '../services/googleApiService';

export async function resetPassword(req, res) {

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