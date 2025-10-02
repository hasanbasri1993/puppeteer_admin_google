const TelegramBot = require('node-telegram-bot-api');
const logger = require('pino')();

class TelegramLogger {
    constructor() {
        this.bot = null;
        this.chatId = process.env.TELEGRAM_CHAT_ID;
        this.botToken = process.env.TELEGRAM_BOT_TOKEN;
        this.enabled = !!(this.botToken && this.chatId);

        if (this.enabled) {
            this.bot = new TelegramBot(this.botToken, {polling: false});
            logger.info('📱 Telegram logging enabled');
        } else {
            logger.warn('⚠️ Telegram logging disabled - missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
        }
    }

    // Safely extract user name/email from req or session
    getUserInfo(req) {
        const sessionUser = req?.session?.passport?.user || {};
        const user = req?.user || sessionUser || {};

        const emailsArray = Array.isArray(user.emails) ? user.emails : (Array.isArray(sessionUser.emails) ? sessionUser.emails : []);
        const firstEmail = emailsArray && emailsArray.length > 0 && emailsArray[0]
            ? (emailsArray[0].value || emailsArray[0].email || emailsArray[0])
            : '';

        const displayName = user.displayName || sessionUser.displayName || '';
        const given = (user.name && user.name.givenName) || (sessionUser.name && sessionUser.name.givenName) || '';
        const family = (user.name && user.name.familyName) || (sessionUser.name && sessionUser.name.familyName) || '';
        const fallbackName = [given, family].filter(Boolean).join(' ').trim();
        const name = displayName || fallbackName;

        return { name, email: firstEmail };
    }

    async sendLog(message) {
        if (!this.enabled) return;

        try {
            await this.bot.sendMessage(this.chatId, message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });
        } catch (error) {
            logger.error({ err: error }, 'Failed to send Telegram message');
        }
    }

    formatApiLog(req, res, responseTime) {
        const timestamp = new Date().toLocaleString('id-ID', {
            timeZone: 'Asia/Jakarta',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const method = req.method;
        const url = req.originalUrl;
        const statusCode = res.statusCode;
        const ip = req.ip || req.connection.remoteAddress;

        // User info (from Passport or session fallback)
        const { name, email } = this.getUserInfo(req);
        const userLine = (name || email)
            ? `\n👤 <b>User:</b> ${name || ''}${email ? ` &lt;${email}&gt;` : ''}`
            : '';

        // Get emoji based on endpoint
        const endpointEmoji = this.getEndpointEmoji(url);

        // Get status emoji
        const statusEmoji = this.getStatusEmoji(statusCode);

        // Special formatting for turn_off endpoint
        if (url.includes('/turn_off')) {
            return this.formatTurnOffLog(req, res, responseTime, timestamp, endpointEmoji, statusEmoji, ip);
        }

        // Format request body (truncate if too long)
        let requestBody = '';
        if (req.body && Object.keys(req.body).length > 0) {
            const bodyStr = JSON.stringify(req.body);
            requestBody = bodyStr.length > 200 ?
                bodyStr.substring(0, 200) + '...' :
                bodyStr;
        }

        // Format response (truncate if too long)
        let responseBody = '';
        if (res.responseBody) {
            const responseStr = JSON.stringify(res.responseBody);
            responseBody = responseStr.length > 200 ?
                responseStr.substring(0, 200) + '...' :
                responseStr;
        }

        const logMessage = `
${endpointEmoji} <b>API Request</b>
🕐 <b>Time:</b> ${timestamp}
🌐 <b>Method:</b> ${method}
📍 <b>URL:</b> ${url}
${statusEmoji} <b>Status:</b> ${statusCode}
⚡ <b>Response Time:</b> ${responseTime}ms
🖥️ <b>IP:</b> ${ip}${userLine}

${requestBody ? `📤 <b>Request Body:</b>\n<code>${requestBody}</code>\n` : ''}
${responseBody ? `📥 <b>Response:</b>\n<code>${responseBody}</code>` : ''}
    `.trim();

        return logMessage;
    }

    formatTurnOffLog(req, res, responseTime, timestamp, endpointEmoji, statusEmoji, ip) {
        // Extract request data
        const requestIds = req.body?.idS || '';
        const idCount = requestIds ? requestIds.split(',').length : 0;

        // User info (from Passport or session fallback)
        const { name, email } = this.getUserInfo(req);
        const userLine = (name || email)
            ? `\n👤 <b>User:</b> ${name || ''}${email ? ` &lt;${email}&gt;` : ''}`
            : '';

        // Extract response data
        let summary = '';
        let results = [];

        if (res.responseBody) {
            let response;

            // Parse response body if it's a string
            if (typeof res.responseBody === 'string') {
                try {
                    response = JSON.parse(res.responseBody);
                } catch (error) {
                    console.error('Failed to parse response body:', error);
                    response = res.responseBody;
                }
            } else {
                response = res.responseBody;
            }

            // Get summary info
            if (response.summary) {
                const {total, successful, failed, batches} = response.summary;
                summary = `📊 <b>Summary:</b> ${total} users, ${successful} success, ${failed} failed, ${batches} batches\n`;
            }

            // Format results (simplified)
            if (response.results && Array.isArray(response.results)) {
                results = response.results.map(result => {
                    if (result.id && result.status) {
                        const {NIS, NAMA, KELAS} = result.id;
                        const displayName = KELAS ? `${KELAS} - ${NAMA}` : NAMA;
                        return `• <b>${NIS}</b>: ${displayName} - ${result.status === 'success' ? '✅' : '❌'}`;
                    }
                    return `• ${result.status === 'success' ? '✅' : '❌'} ${result.error || 'Unknown'}`;
                });
            }
        }

        // Limit results to prevent message too long
        const maxResults = 10;
        const displayResults = results.slice(0, maxResults);
        const hasMore = results.length > maxResults;

        const logMessage = `
${endpointEmoji} <b>Turn Off Challenge</b>
🕐 <b>Time:</b> ${timestamp}
${statusEmoji} <b>Status:</b> ${res.statusCode}
⚡ <b>Response Time:</b> ${responseTime}ms
🖥️ <b>IP:</b> ${ip}${userLine}

📤 <b>Request:</b> ${idCount} IDs
${summary}
${displayResults.length > 0 ? `📋 <b>Results:</b>\n${displayResults.join('\n')}` : ''}
${hasMore ? `\n... and ${results.length - maxResults} more` : ''}
    `.trim();

        return logMessage;
    }

    getEndpointEmoji(url) {
        if (url.includes('/turn_off')) return '🔒';
        if (url.includes('/reset_password')) return '🔑';
        if (url.includes('/relogin')) return '🔄';
        if (url.includes('/hai')) return '👋';
        return '🌐';
    }

    getStatusEmoji(statusCode) {
        if (statusCode >= 200 && statusCode < 300) return '✅';
        if (statusCode >= 300 && statusCode < 400) return '🔄';
        if (statusCode >= 400 && statusCode < 500) return '⚠️';
        if (statusCode >= 500) return '❌';
        return '❓';
    }

    async logApiRequest(req, res, responseTime) {
        const logMessage = this.formatApiLog(req, res, responseTime);
        await this.sendLog(logMessage);
    }

    async logSystemEvent(event, details = '') {
        const timestamp = new Date().toLocaleString('id-ID', {
            timeZone: 'Asia/Jakarta',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const eventEmoji = this.getSystemEventEmoji(event);

        const message = `
${eventEmoji} <b>System Event</b>
🕐 <b>Time:</b> ${timestamp}
📋 <b>Event:</b> ${event}
${details ? `📝 <b>Details:</b> ${details}` : ''}
    `.trim();

        await this.sendLog(message);
    }

    getSystemEventEmoji(event) {
        if (event.includes('login') || event.includes('Login')) return '🔐';
        if (event.includes('relogin') || event.includes('Relogin')) return '🔄';
        if (event.includes('error') || event.includes('Error')) return '❌';
        if (event.includes('success') || event.includes('Success')) return '✅';
        if (event.includes('start') || event.includes('Start')) return '🚀';
        if (event.includes('stop') || event.includes('Stop')) return '🛑';
        if (event.includes('memory') || event.includes('Memory')) return '🧠';
        return '📊';
    }
}

module.exports = new TelegramLogger();
