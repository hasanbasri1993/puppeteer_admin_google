const telegramLogger = require('../services/telegramLogger');
const logger = require('../utils/logger');

// Middleware to log API requests to Telegram
const telegramLoggingMiddleware = (req, res, next) => {
    const startTime = Date.now();

    // Store original res.json and res.send methods
    const originalJson = res.json;
    const originalSend = res.send;

    // Override res.json to capture response body
    res.json = function (body) {
        res.responseBody = body;
        return originalJson.call(this, body);
    };

    // Override res.send to capture response body
    res.send = function (body) {
        res.responseBody = body;
        return originalSend.call(this, body);
    };

    // Log to Telegram when response finishes
    res.on('finish', async () => {
        const responseTime = Date.now() - startTime;

        // Skip frequent dashboard polling so it does not flood Telegram.
        const isBrowserStatusPoll = req.method === 'GET' && req.path === '/status';

        // Only log API requests (not static files or status polling)
        if (req.originalUrl.startsWith('/api/') && !isBrowserStatusPoll) {
            try {
                await telegramLogger.logApiRequest(req, res, responseTime);
            } catch (error) {
                logger.error('Failed to log API request to Telegram:', error.message);
            }
        }
    });

    next();
};

module.exports = telegramLoggingMiddleware;
