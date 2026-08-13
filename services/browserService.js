const puppeteer = require('puppeteer');
const path = require('path');
const authService = require('./authService');
const cron = require('node-cron');
const logger = require('pino')();
const telegramLogger = require('./telegramLogger');

const {XPATH_LOGIN_CHALLENGE, XPATH_TURN_OFF} = require('../config/constants');

const reloginTime = process.env.RELOGIN_TIME || '*/40 0 * * *';

class BrowserService {
    constructor() {
        this.browser = null;
        this._isInitialized = false;
        this.activePages = new Set();
        this.maxConcurrentPages = parseInt(process.env.MAX_CONCURRENT_PAGES) || 3;
        this.pageTimeout = parseInt(process.env.PAGE_TIMEOUT) || 30000;
        this.memoryCleanupInterval = null;
        this.browserHealthCheckInterval = null;
        this.crashRecoveryAttempts = 0;
        this.maxCrashRecoveryAttempts = 3;
        this.lastHealthCheck = Date.now();
        this.isRelogging = false;
        this.activeOperations = 0;
        this.isInitializing = false;
        this.initStartTime = null;
        // Keep Chrome's Google session across nodemon restarts/hot reloads.
        // This directory is intentionally outside the source tree's tracked files.
        this.userDataDir = process.env.PUPPETEER_USER_DATA_DIR || path.join(__dirname, '..', '.puppeteer-profile');
        this.isClosing = false;
        this.recoveryPromise = null;
    }

    get isInitialized() {
        return this._isInitialized;
    }

    getStatus() {
        if (this._isInitialized && this.browser && this.browser.isConnected()) {
            return { status: 'ready', isInitialized: true, isInitializing: false, message: 'Session Active' };
        }
        if (this.isInitializing) {
            const elapsedSec = Math.floor((Date.now() - (this.initStartTime || Date.now())) / 1000);
            return {
                status: 'initializing',
                isInitialized: false,
                isInitializing: true,
                elapsedSec,
                estRemainingSec: null,
                message: `Inisialisasi Browser (${elapsedSec}s)`
            };
        }
        if (this.isRelogging) {
            return { status: 'relogging', isInitialized: false, isInitializing: false, message: 'Sedang Relogin...' };
        }
        return { status: 'offline', isInitialized: false, isInitializing: false, message: 'Browser Offline' };
    }

    async initialize(username, password) {
        this.isInitializing = true;
        this.initStartTime = Date.now();
        try {
            const isHeadeless = process.env.HEADLESS !== 'false';
            logger.info('Initializing browser and logging in...');

            // Enhanced browser launch options for memory optimization and stability
            this.browser = await puppeteer.launch({
                headless: isHeadeless,
                userDataDir: this.userDataDir,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    // Prevent Chromium/Windows from freezing background tabs
                    // while a headed batch uses multiple reusable workers.
                    '--disable-features=TranslateUI,CalculateNativeWinOcclusion,VizDisplayCompositor',
                    '--disable-ipc-flooding-protection',
                    '--memory-pressure-off',
                    '--max_old_space_size=4096',
                    '--disable-crash-reporter',
                    '--disable-logging',
                    '--disable-extensions',
                    '--disable-plugins',
                    '--disable-default-apps',
                    '--disable-sync',
                    '--disable-translate',
                    '--hide-scrollbars',
                    '--mute-audio',
                    '--no-default-browser-check',
                    '--disable-component-extensions-with-background-pages',
                    '--disable-background-networking',
                    '--disable-client-side-phishing-detection',
                    '--disable-hang-monitor',
                    '--disable-prompt-on-repost',
                    '--disable-domain-reliability'
                ],
                ignoreDefaultArgs: ['--disable-extensions'],
                handleSIGINT: false,
                handleSIGTERM: false,
                handleSIGHUP: false
            });

            // Add browser event listeners for crash detection
            this.browser.on('disconnected', () => {
                if (this.isClosing) {
                    logger.info('Browser disconnected during intentional shutdown');
                    return;
                }
                logger.error('Browser disconnected unexpectedly!');
                void this.handleBrowserCrash();
            });

            this.browser.on('targetcreated', (target) => {
                logger.debug('New target created:', target.type());
            });

            this.browser.on('targetdestroyed', (target) => {
                logger.debug('Target destroyed:', target.type());
            });

            const page = await this.browser.newPage();

            // Configure page for memory optimization
            await page.setJavaScriptEnabled(true);

            await authService.performLoginWithTOTP(page, username, password);
            await page.close();

            this._isInitialized = true;
            this.startMemoryCleanup();
            this.startBrowserHealthCheck();
            logger.info('Successfully initialized browser and logged in');

            // Log to Telegram
            await telegramLogger.logSystemEvent('Browser Initialized', 'Successfully logged in to Google Admin Console');
        } catch (error) {
            logger.error('Failed to initialize browser: ' + error);
            await this.close();
            throw error;
        } finally {
            this.isInitializing = false;
        }
    }

    async performRelogin(username, password) {
        // Schedule regular relogin every 40 minutes
        cron.schedule(reloginTime, async () => {
            try {
                logger.info('🔄 Scheduled relogin triggered');
                await this.relogin(username, password);
                logger.info('✅ Scheduled relogin completed successfully');

                // Log to Telegram
                await telegramLogger.logSystemEvent('Scheduled Relogin Success', 'Browser session refreshed successfully');
            } catch (error) {
                logger.error('❌ Scheduled relogin failed:', error.message);

                // Log to Telegram
                await telegramLogger.logSystemEvent('Scheduled Relogin Failed', `Error: ${error.message}`);

                // Try to recover by reinitializing browser
                try {
                    logger.info('🔄 Attempting browser recovery after failed relogin...');
                    await this.handleBrowserCrash();
                } catch (recoveryError) {
                    logger.error('❌ Browser recovery failed:', recoveryError.message);
                }
            }
        }, {
            scheduled: true,
            timezone: "Asia/Jakarta"
        });

        logger.info(`📅 Relogin scheduled every 40 minutes (${reloginTime})`);
    }

    async relogin(username, password) {
        if (this.isRelogging) {
            logger.warn('⚠️ Relogin sudah sedang berjalan, mengabaikan permintaan relogin baru.');
            return;
        }

        this.isRelogging = true;
        try {
            // Tunggu jika ada operasi (misal: handleSecurityChallenge) yang sedang berjalan (maksimal 30 detik)
            let waitTime = 0;
            while (this.activeOperations > 0 && waitTime < 30000) {
                if (waitTime === 0) logger.info('⏳ Menunda relogin, menunggu operasi yang sedang berjalan selesai...');
                await new Promise(resolve => setTimeout(resolve, 2000));
                waitTime += 2000;
            }

            logger.info('🔄 Starting relogin process...');

            // Check if browser is still healthy before relogin
            if (!this.browser || !this.browser.isConnected()) {
                logger.warn('⚠️ Browser not connected, skipping relogin');
                return;
            }

            // Keep the persisted profile session whenever it is still valid.
            // Logging out every 40 minutes defeats cookie persistence and forces
            // Google to challenge the account again.
            if (await this.checkLoginStatus()) {
                logger.info('✅ Existing Google session is still valid; relogin skipped');
                this.crashRecoveryAttempts = 0;
                return;
            }

            const page = await this.createOptimizedPage();
            try {
                // If Google requires reauthentication, let it present the
                // profile-aware password/TOTP flow instead of forcing logout.
                await authService.performLoginWithTOTP(page, username, password, {
                    debug: process.env.DEBUG === 'true'
                });
            } finally {
                await this.closePage(page);
            }
            logger.info('✅ Relogin completed successfully');

            // Reset crash recovery counter on successful relogin
            this.crashRecoveryAttempts = 0;

        } catch (error) {
            logger.error('❌ Relogin failed:', error.message);
            throw error;
        } finally {
            this.isRelogging = false;
        }
    }

    async checkLoginStatus() {
        try {
            logger.info('Checking login status...');
            const page = await this.createOptimizedPage();

            // Navigate to admin.google.com
            await page.goto('https://admin.google.com', {
                waitUntil: 'domcontentloaded',
                timeout: this.pageTimeout
            });

            // Wait a moment for any redirects
            await page.waitForTimeout(2000);

            const currentUrl = page.url();
            logger.info(`Current URL after navigation: ${currentUrl}`);

            // Check if we're redirected to login page
            const isRedirectedToLogin = currentUrl.includes('accounts.google.com/signin') ||
                currentUrl.includes('accounts.google.com/challenge') ||
                currentUrl.includes('accounts.google.com/v3/signin');

            await this.closePage(page);

            if (isRedirectedToLogin) {
                logger.warn('Redirected to login page - session expired');
                return false;
            } else {
                logger.info('Still logged in to admin.google.com');
                return true;
            }
        } catch (error) {
            logger.error('Error checking login status:', error.message);
            return false;
        }
    }

    async ensureLoggedIn(username, password) {
        const isLoggedIn = await this.checkLoginStatus();

        if (!isLoggedIn) {
            logger.info('Not logged in, performing relogin...');
            await this.relogin(username, password);

            // Verify login after relogin
            const verifyLogin = await this.checkLoginStatus();
            if (!verifyLogin) {
                throw new Error('Failed to login after relogin attempt');
            }
            logger.info('Login verification successful');
        }

        return true;
    }

    // Manual relogin trigger (for API endpoints)
    async triggerManualRelogin(username, password) {
        if (this.isRelogging) {
            return {success: false, message: 'Sistem sedang memuat ulang sesi (relogin). Harap tunggu.'};
        }
        try {
            logger.info('🔄 Manual relogin triggered');
            await this.relogin(username, password);
            logger.info('✅ Manual relogin completed successfully');
            return {success: true, message: 'Relogin completed successfully'};
        } catch (error) {
            logger.error('❌ Manual relogin failed:', error.message);
            return {success: false, error: error.message};
        }
    }

    // Browser health monitoring
    startBrowserHealthCheck() {
        this.browserHealthCheckInterval = setInterval(async () => {
            try {
                if (!this.browser || !this._isInitialized) {
                    logger.warn('Browser not initialized, skipping health check');
                    return;
                }

                // Check if browser is still connected
                const isConnected = this.browser.isConnected();
                if (!isConnected) {
                    logger.error('Browser health check failed: Browser disconnected');
                    this.handleBrowserCrash();
                    return;
                }

                // Try to get browser version to ensure it's responsive
                const version = await this.browser.version();
                this.lastHealthCheck = Date.now();
                logger.debug(`Browser health check passed. Version: ${version}`);

            } catch (error) {
                logger.error('Browser health check failed:', error.message);
                this.handleBrowserCrash();
            }
        }, 60000); // Check every minute
    }

    async handleBrowserCrash() {
        if (this.isClosing) {
            return;
        }
        if (this.recoveryPromise) {
            logger.warn('Browser recovery already running, skipping duplicate request');
            return this.recoveryPromise;
        }

        this.recoveryPromise = this.recoverBrowser();
        try {
            return await this.recoveryPromise;
        } finally {
            this.recoveryPromise = null;
        }
    }

    async recoverBrowser() {
        logger.error('Handling browser crash...');

        if (this.crashRecoveryAttempts >= this.maxCrashRecoveryAttempts) {
            logger.error(`Max crash recovery attempts (${this.maxCrashRecoveryAttempts}) reached. Manual intervention required.`);
            return;
        }

        this.crashRecoveryAttempts++;
        logger.info(`Attempting browser recovery (attempt ${this.crashRecoveryAttempts}/${this.maxCrashRecoveryAttempts})`);

        try {
            // Clean up current browser instance
            if (this.browser) {
                try {
                    this.isClosing = true;
                    await this.browser.close();
                } catch (e) {
                    logger.warn('Error closing crashed browser:', e.message);
                } finally {
                    this.isClosing = false;
                }
                this.browser = null;
            }

            // Clear intervals
            if (this.memoryCleanupInterval) {
                clearInterval(this.memoryCleanupInterval);
                this.memoryCleanupInterval = null;
            }
            if (this.browserHealthCheckInterval) {
                clearInterval(this.browserHealthCheckInterval);
                this.browserHealthCheckInterval = null;
            }

            // Clear active pages
            this.activePages.clear();
            this._isInitialized = false;

            // Wait before attempting recovery
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Attempt to reinitialize
            logger.info('Attempting to reinitialize browser...');
            await this.initialize(
                process.env.GOOGLE_ADMIN_USERNAME,
                process.env.GOOGLE_ADMIN_PASSWORD
            );

            logger.info('Browser recovery successful!');
            this.crashRecoveryAttempts = 0; // Reset counter on successful recovery

        } catch (error) {
            logger.error(`Browser recovery attempt ${this.crashRecoveryAttempts} failed:`, error.message);

            // Schedule next recovery attempt
            setTimeout(() => {
                this.handleBrowserCrash();
            }, 10000); // Wait 10 seconds before next attempt
        }
    }

    // Memory management methods
    startMemoryCleanup() {
        // Run garbage collection every 5 minutes
        this.memoryCleanupInterval = setInterval(() => {
            if (global.gc) {
                global.gc();
                logger.info('Garbage collection triggered');
            }

            // Log memory usage
            const memUsage = process.memoryUsage();
            logger.info(`Memory usage - RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB, Heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);

            // Clean up any orphaned pages
            this.cleanupOrphanedPages();
        }, 5 * 60 * 1000); // 5 minutes
    }

    async cleanupOrphanedPages() {
        try {
            const pages = await this.browser.pages();
            for (const page of pages) {
                if (!this.activePages.has(page)) {
                    logger.info('Cleaning up orphaned page');
                    await page.close();
                }
            }
        } catch (error) {
            logger.error('Error cleaning up orphaned pages:', error.message);
        }
    }

    async createOptimizedPage() {
        const page = await this.browser.newPage();
        this.activePages.add(page);

        // Configure page for memory efficiency without breaking SPA JS/CSS
        try {
            await page.setRequestInterception(true);
            page.on('request', (request) => {
                try {
                    const resourceType = request.resourceType();
                    // Block only images, fonts, and media to save bandwidth while keeping CSS/JS stable
                    if (['image', 'font', 'media'].includes(resourceType)) {
                        request.abort().catch(() => {});
                    } else {
                        request.continue().catch(() => {});
                    }
                } catch (e) {
                    // Ignore already handled request error
                }
            });
        } catch (e) {
            logger.warn('Failed to set request interception:', e.message);
        }

        // Set timeout
        page.setDefaultTimeout(this.pageTimeout);

        return page;
    }

    async closePage(page) {
        try {
            if (page && !page.isClosed()) {
                await page.close();
            }
        } catch (error) {
            logger.error('Error closing page:', error.message);
        } finally {
            this.activePages.delete(page);
        }
    }

    async checkBrowserHealth() {
        if (!this.browser || !this._isInitialized) {
            throw new Error('Browser not initialized');
        }

        try {
            const isConnected = this.browser.isConnected();
            if (!isConnected) {
                throw new Error('Browser disconnected');
            }

            // Quick health check by getting browser version
            await this.browser.version();
            return true;
        } catch (error) {
            logger.error('Browser health check failed:', error.message);
            throw error;
        }
    }

    async handleSecurityChallenge(id) {
        if (!this._isInitialized) {
            if (this.isInitializing) {
                const elapsedSec = Math.floor((Date.now() - (this.initStartTime || Date.now())) / 1000);
                throw new Error(`Browser sedang diinisialisasi (${elapsedSec} detik). Harap tunggu.`);
            }
            throw new Error('Browser belum terinisialisasi. Sesi Google Admin belum siap.');
        }

        if (this.isRelogging) {
            logger.warn(`⚠️ Menolak permintaan security challenge untuk ${id} karena sedang relogin.`);
            throw new Error('Sistem sedang memuat ulang sesi (relogin otomatis). Harap tunggu beberapa saat dan coba lagi.');
        }

        this.activeOperations++;
        let page = null;
        
        try {
            // Check browser health before operation
            await this.checkBrowserHealth();

            logger.info('Creating optimized page to handle security challenge...');
            page = await this.createOptimizedPage();

            logger.info('Opening security page for user:' + id);
            logger.info(`Goto: https://admin.google.com/ac/users/${id}/security`);

            await page.goto(`https://admin.google.com/ac/users/${id}/security`, {
                waitUntil: 'domcontentloaded', // Changed from networkidle2 to save memory
                timeout: this.pageTimeout
            });

            // Wait for the element with the text 'Login Challenge' to be visible
            logger.info('Waiting for login challenge element...');
            await page.waitForSelector(`xpath/${XPATH_LOGIN_CHALLENGE}`, {
                visible: true,
                timeout: 10000
            });

            // Click on the element with the text 'Login Challenge'
            const loginChallengeElements = await page.$$(`xpath/${XPATH_LOGIN_CHALLENGE}`);
            if (loginChallengeElements.length > 0) {
                await loginChallengeElements[0].click();
                logger.info('Clicking on: loginChallengeElements');

                // Wait for the 'Turn off for 10 mins' span to be visible and clickable
                await page.waitForSelector(`xpath/${XPATH_TURN_OFF}`, {
                    visible: true,
                    timeout: 10000
                });

                const turnOffElements = await page.$$(`xpath/${XPATH_TURN_OFF}`);
                if (turnOffElements.length > 0) {
                    await turnOffElements[0].click();
                    logger.info('Clicking on: Turn off for 10 mins');
                } else {
                    logger.error("Turn off for 10 mins span not found");
                    throw new Error("'Turn off for 10 mins' span not found");
                }
            } else {
                logger.error("Login Challenge element not found");
                throw new Error("Login Challenge element not found");
            }

            return {status: 'success'};
        } catch (error) {
            logger.error(`Error handling security challenge for user ${id}:`, error.message);
            throw error;
        } finally {
            this.activeOperations--;
            if (page) {
                await this.closePage(page);
            }
        }
    }

    async close() {
        this.isClosing = true;
        try {
            // Clear all intervals
            if (this.memoryCleanupInterval) {
                clearInterval(this.memoryCleanupInterval);
                this.memoryCleanupInterval = null;
            }
            if (this.browserHealthCheckInterval) {
                clearInterval(this.browserHealthCheckInterval);
                this.browserHealthCheckInterval = null;
            }

            // Close all active pages
            for (const page of this.activePages) {
                try {
                    if (!page.isClosed()) {
                        await page.close();
                    }
                } catch (error) {
                    logger.error('Error closing active page:', error.message);
                }
            }
            this.activePages.clear();

            // Close browser
            if (this.browser) {
                await this.browser.close();
                logger.info("Browser closed successfully");
                this.browser = null;
                this._isInitialized = false;
            }

            // Reset crash recovery counter
            this.crashRecoveryAttempts = 0;

            // Force garbage collection
            if (global.gc) {
                global.gc();
                logger.info('Final garbage collection triggered');
            }
        } catch (error) {
            logger.error('Error during browser cleanup:', error.message);
        } finally {
            this.isClosing = false;
        }
    }
}

module.exports = BrowserService;
