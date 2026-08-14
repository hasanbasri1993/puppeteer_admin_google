const {instance} = require('../services/browserInstance');
const Pusher = require('../config/pusher');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const browserJobQueue = require('../services/browserJobQueue');

const BATCH_SIZE = Math.max(1, parseInt(process.env.BATCH_SIZE, 10) || 3);
const BATCH_DELAY = Math.max(0, parseInt(process.env.BATCH_DELAY, 10) || 2000);

function getRequestOwner(req) {
    return req.user?.emails?.[0]?.value?.toLowerCase() || req.sessionID;
}

function getProgressPublisher(requestId) {
    const progressChannel = `turn_off_${requestId}`;
    return (payload) => Pusher.trigger(progressChannel, 'status-update', {
        requestId,
        ...payload
    });
}

function isRecoverableBrowserError(error) {
    return /target closed|browser disconnected|session closed|browser belum terinisialisasi|browser not initialized|requesting main frame too early/i.test(error?.message || '');
}

async function waitForBrowserRecovery(requestId, publishProgress) {
    await publishProgress({
        id: 'System',
        status: 'waiting',
        message: 'Browser terputus. Menunggu browser login ulang sebelum melanjutkan antrean...'
    });
    const ready = await instance.waitUntilReady();
    if (ready) {
        await publishProgress({
            id: 'System',
            status: 'resumed',
            message: `Browser siap. Melanjutkan antrean ${requestId}...`
        });
    }
    return ready;
}

async function processStudent(id, requestId, publishProgress) {
    let recoveryAttempts = 0;

    while (recoveryAttempts <= 2) {
        if (!instance.isInitialized) {
            recoveryAttempts++;
            if (recoveryAttempts <= 2 && await waitForBrowserRecovery(requestId, publishProgress)) continue;
            const message = instance.getStatus().message;
            return {id, status: 'failed', error: `Browser belum pulih setelah login ulang: ${message}`};
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
            if (isRecoverableBrowserError(error) && recoveryAttempts < 2) {
                recoveryAttempts++;
                if (await waitForBrowserRecovery(requestId, publishProgress)) continue;
            }
            logger.error('Turn off for 10 mins failed for: ' + id.NAMA);
            await publishProgress({
                id: id.NAMA,
                nis: id.NIS,
                status: 'failed',
                message: error.message
            });
            return {id, status: 'failed', error: error.message};
        }
    }
}

async function processTurnOffJob({requestId, filteredIds, studentDetails}) {
    const publishProgress = getProgressPublisher(requestId);
    const results = [];
    await publishProgress({
        id: 'System',
        status: 'started',
        students: studentDetails,
        message: `Memproses ${filteredIds.length} data siswa dalam batch ${BATCH_SIZE}...`
    });

    for (let start = 0; start < filteredIds.length; start += BATCH_SIZE) {
        const batch = filteredIds.slice(start, start + BATCH_SIZE);
        logger.info(`Memproses batch ${Math.floor(start / BATCH_SIZE) + 1} berisi ${batch.length} siswa`);
        const batchResults = await Promise.all(batch.map(id => processStudent(id, requestId, publishProgress)));
        results.push(...batchResults);

        if (start + BATCH_SIZE < filteredIds.length && BATCH_DELAY > 0) {
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }
    }

    const successCount = results.filter(result => result.status === 'success').length;
    return {
        results,
        summary: {
            total: results.length,
            successful: successCount,
            failed: results.length - successCount
        }
    };
}

browserJobQueue.setProcessor(processTurnOffJob);

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
        const publishProgress = getProgressPublisher(requestId);
        const owner = getRequestOwner(req);
        const jobKey = `${owner}:${requestId}`;

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

        if (notFoundIds.length > 0) {
            await publishProgress({
                id: 'System',
                status: 'failed',
                message: "NIS tidak ditemukan: " + notFoundIds.join(', ')
            });
            logger.error('Not found this NIS, ' + notFoundIds.join(', '));
        }

        let queuedJob;
        try {
            const jobData = {requestId, filteredIds, studentDetails};
            queuedJob = await browserJobQueue.enqueue({
                key: jobKey,
                owner,
                data: jobData,
                run: () => processTurnOffJob(jobData)
            });
        } catch (error) {
            if (error.code === 'DUPLICATE_JOB_KEY') {
                return res.status(409).json({success: false, error: error.message});
            }
            throw error;
        }

        try {
            await publishProgress({
                id: 'System',
                status: 'queued',
                message: queuedJob.position === 1
                    ? 'Antrean diterima, menunggu browser siap...'
                    : `Antrean diterima. Posisi antrean: ${queuedJob.position}.`
            });
            const jobResult = await queuedJob.promise;

            res.json({
                success: true,
                requestId,
                results: jobResult.results,
                notFoundIds,
                students: studentDetails,
                summary: jobResult.summary
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
