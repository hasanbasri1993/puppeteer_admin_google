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
        const ids = req.body.idS?.split(',').map(id => id.trim()) || [];
        const uniqueIds = [...new Set(ids)];

        logger.info(`Processing ${uniqueIds.length} unique IDs`);

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

        const results = [];
        if (notFoundIds.length > 0) {
            await Pusher.trigger("turn_off", "status-update", {
                id: 0,
                message: "Not found this NIS, " + notFoundIds.join(', ')
            });
            logger.error('Not found this NIS, ' + notFoundIds.join(', '));
        }

        try {
            // Process users in batches to prevent memory overload
            const batches = [];
            for (let i = 0; i < filteredIds.length; i += BATCH_SIZE) {
                batches.push(filteredIds.slice(i, i + BATCH_SIZE));
            }

            logger.info(`Processing ${filteredIds.length} users in ${batches.length} batches of ${BATCH_SIZE}`);

            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                const batch = batches[batchIndex];
                logger.info(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} users`);

                // Process batch concurrently but limit concurrency
                const batchResults = await Promise.allSettled(
                    batch.map(async (id) => {
                        try {
                            await instance.handleSecurityChallenge(id.ID_GOOGLE);
                            logger.info('Turn off for 10 mins success for: ' + id.NAMA);
                            await Pusher.trigger("turn_off", "status-update", {
                                id: id.NAMA,
                                message: "Success email: " + id.NIS + "@daarululuumlido.com"
                            });
                            return {id, status: 'success'};
                        } catch (error) {
                            logger.error('Turn off for 10 mins failed for: ' + id.NAMA);
                            await Pusher.trigger("turn_off", "status-update", {
                                id: id.NAMA,
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

            await Pusher.trigger("turn_off", "status-update", {
                id: "COMPLETED",
                message: `Batch processing completed: ${successCount} successful, ${failureCount} failed`
            });

            res.json({
                success: true,
                results,
                notFoundIds,
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
