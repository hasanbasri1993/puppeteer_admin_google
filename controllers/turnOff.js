const {instance} = require('../services/browserInstance');
const Pusher = require('../config/pusher');
const fs = require('fs');
const path = require('path');
const logger = require('pino')();

// Configuration for batch processing
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 3; // Process 3 users at a time
const BATCH_DELAY = parseInt(process.env.BATCH_DELAY) || 2000; // 2 seconds between batches

module.exports = {
    turnOffChallenge: async (req, res) => {
        // Accept new request body shape: { nis: ["234054", "234035", ...] }
        // Backward compatibility: if idS (CSV string) is provided, still support it
        const idsFromArray = Array.isArray(req.body.nis) ? req.body.nis.map(v => String(v).trim()) : [];
        const idsFromCsv = typeof req.body.idS === 'string' && req.body.idS.length > 0
            ? req.body.idS.split(',').map(id => id.trim())
            : [];
        const ids = (idsFromArray.length > 0 ? idsFromArray : idsFromCsv);
        const uniqueIds = [...new Set(ids)];
        const requestId = typeof req.body.requestId === 'string' ? req.body.requestId : '';
        if (!/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) {
            return res.status(400).json({success: false, error: 'requestId tidak valid'});
        }
        const progressChannel = `turn_off_${requestId}`;
        const publishProgress = (payload) => Pusher.trigger(progressChannel, 'status-update', {
            requestId,
            ...payload
        });

        logger.info(`Processing ${uniqueIds.length} unique IDs for request ${requestId}`);

        // Read the JSON file
        const filePath = path.join(process.cwd(), 'ids.json');
        const data = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(data);

        // Extract all NIS values from jsonData
        const allNIS = jsonData.map(item => item.NIS);

        // Find NIS values that are not found in jsonData
        const notFoundIds = uniqueIds.filter(id => !allNIS.includes(id));

        // Filter jsonData to only include ID_GOOGLE values that match the provided ids
        const filteredIds = jsonData.filter(item => uniqueIds.includes(item.NIS));
        const studentDetails = filteredIds.map(({NIS, NAMA, KELAS}) => ({nis: NIS, name: NAMA, className: KELAS}));

        const results = [];
        if (notFoundIds.length > 0) {
            await publishProgress({
                id: 'System',
                status: 'failed',
                message: "NIS tidak ditemukan: " + notFoundIds.join(', ')
            });
            logger.error('Not found this NIS, ' + notFoundIds.join(', '));
        }

        try {
            await publishProgress({
                id: 'System',
                status: 'started',
                students: studentDetails,
                message: `Memproses ${filteredIds.length} data siswa...`
            });

            // Process users in batches to prevent memory overload
            const batches = [];
            for (let i = 0; i < filteredIds.length; i += BATCH_SIZE) {
                batches.push(filteredIds.slice(i, i + BATCH_SIZE));
            }

            logger.info(`Processing ${filteredIds.length} users in ${batches.length} batches of ${BATCH_SIZE}`);

            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                // Check browser health & initialization before running batch
                if (!instance.isInitialized) {
                    const statusInfo = instance.getStatus();
                    logger.warn(`⚠️ Browser tidak aktif (${statusInfo.message}), menghentikan eksekusi sisa batch.`);
                    await publishProgress({
                        id: "System",
                        status: 'failed',
                        message: `Proses dihentikan: ${statusInfo.message}. Harap tunggu pemulihan browser dan coba lagi.`
                    });
                    
                    // Mark remaining unprocessed items as failed with clear error message
                    for (let j = batchIndex; j < batches.length; j++) {
                        batches[j].forEach(id => {
                            results.push({
                                id,
                                status: 'failed',
                                error: statusInfo.message
                            });
                        });
                    }
                    break;
                }

                const batch = batches[batchIndex];
                logger.info(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} users`);

                // Process batch concurrently with a tiny staggered delay (200ms) to avoid CDP protocol spikes
                const batchResults = await Promise.allSettled(
                    batch.map(async (id, idx) => {
                        if (idx > 0) {
                            await new Promise(resolve => setTimeout(resolve, idx * 200));
                        }
                        try {
                            await instance.handleSecurityChallenge(id.ID_GOOGLE);
                            logger.info('Turn off for 10 mins success for: ' + id.NAMA);
                            await publishProgress({
                                id: id.NAMA,
                                nis: id.NIS,
                                status: 'success',
                                message: "Success email: " + id.NIS + "@daarululuumlido.com"
                            });
                            return {id, status: 'success'};
                        } catch (error) {
                            logger.error('Turn off for 10 mins failed for: ' + id.NAMA);
                            await publishProgress({
                                id: id.NAMA,
                                nis: id.NIS,
                                status: 'failed',
                                message: error.message
                            });
                            return {id, status: 'failed', error: error.message};
                        }
                    })
                );

                // Process results
                batchResults.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                        results.push(result.value);
                    } else {
                        results.push({
                            id: batch[index],
                            status: 'failed',
                            error: result.reason?.message || 'Unknown error'
                        });
                    }
                });

                // Add delay between batches to prevent overwhelming the system
                if (batchIndex < batches.length - 1) {
                    logger.info(`Waiting ${BATCH_DELAY}ms before next batch...`);
                    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
                }
            }

            // Send completion status
            const successCount = results.filter(r => r.status === 'success').length;
            const failureCount = results.length - successCount;

            res.json({
                success: true,
                results,
                notFoundIds,
                students: studentDetails,
                summary: {
                    total: results.length,
                    successful: successCount,
                    failed: failureCount,
                    batches: batches.length
                }
            });

        } catch (error) {
            logger.error('Error in turnOffChallenge:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
};
