const puppeteer = require('puppeteer');
const authService = require('./authService');
const cron = require('node-cron');
const logger = require('pino')()

const { XPATH_LOGIN_CHALLENGE, XPATH_TURN_OFF } = require('../config/constants');

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
  }

  get isInitialized() {
    return this._isInitialized;
  }

  async initialize(username, password) {
    try {
      const isHeadeless = process.env.HEADLESS !== 'false';
      logger.info('Initializing browser and logging in...');
      
      // Enhanced browser launch options for memory optimization and stability
      this.browser = await puppeteer.launch({
        headless: isHeadeless,
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
          '--disable-features=TranslateUI',
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
          '--disable-domain-reliability',
          '--disable-features=VizDisplayCompositor'
        ],
        ignoreDefaultArgs: ['--disable-extensions'],
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false
      });
      
      // Add browser event listeners for crash detection
      this.browser.on('disconnected', () => {
        logger.error('Browser disconnected unexpectedly!');
        this._isInitialized = false;
        this.handleBrowserCrash();
      });

      this.browser.on('targetcreated', (target) => {
        logger.debug('New target created:', target.type());
      });

      this.browser.on('targetdestroyed', (target) => {
        logger.debug('Target destroyed:', target.type());
      });

      const page = await this.browser.newPage();
      
      // Configure page for memory optimization
      await page.setCacheEnabled(false);
      await page.setJavaScriptEnabled(true);
      
      await authService.performLoginWithTOTP(page, username, password);
      await page.close();
      
      this._isInitialized = true;
      this.startMemoryCleanup();
      this.startBrowserHealthCheck();
      logger.info('Successfully initialized browser and logged in');
    } catch (error) {
      logger.error('Failed to initialize browser: ' + error);
      await this.close();
      throw error;
    }
  }

  async performRelogin(username, password) {
    // Schedule regular relogin every 40 minutes
    cron.schedule(reloginTime, async () => {
      try {
        logger.info('🔄 Scheduled relogin triggered');
        await this.relogin(username, password);
        logger.info('✅ Scheduled relogin completed successfully');
      } catch (error) {
        logger.error('❌ Scheduled relogin failed:', error.message);
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
    try {
      logger.info('🔄 Starting relogin process...');
      
      // Check if browser is still healthy before relogin
      if (!this.browser || !this.browser.isConnected()) {
        logger.warn('⚠️ Browser not connected, skipping relogin');
        return;
      }
      
      const page = await this.createOptimizedPage();
      
      // Perform logout-then-login
      await authService.performLoginWithTOTP(page, username, password, { 
        logout: true,
        debug: process.env.DEBUG === 'true'
      });
      
      await this.closePage(page);
      logger.info('✅ Relogin completed successfully');
      
      // Reset crash recovery counter on successful relogin
      this.crashRecoveryAttempts = 0;
      
    } catch (error) {
      logger.error('❌ Relogin failed:', error.message);
      throw error;
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
    try {
      logger.info('🔄 Manual relogin triggered');
      await this.relogin(username, password);
      logger.info('✅ Manual relogin completed successfully');
      return { success: true, message: 'Relogin completed successfully' };
    } catch (error) {
      logger.error('❌ Manual relogin failed:', error.message);
      return { success: false, error: error.message };
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
          await this.browser.close();
        } catch (e) {
          logger.warn('Error closing crashed browser:', e.message);
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
    
    // Configure page for optimal memory usage
    await page.setCacheEnabled(false);
    await page.setRequestInterception(true);
    
    // Block unnecessary resources to save memory
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });
    
    // Set timeout
    page.setDefaultTimeout(this.pageTimeout);
    
    return page;
  }

  async closePage(page) {
    try {
      if (page && !page.isClosed()) {
        await page.close();
        this.activePages.delete(page);
      }
    } catch (error) {
      logger.error('Error closing page:', error.message);
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
    // Check browser health before operation
    await this.checkBrowserHealth();
    
    logger.info('Creating optimized page to handle security challenge...');
    const page = await this.createOptimizedPage();
    
    try {
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
      
      return { status: 'success' };
    } catch (error) {
      logger.error(`Error handling security challenge for user ${id}:`, error.message);
      throw error;
    } finally {
      await this.closePage(page);
    }
  }

  async close() {
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
    }
  }
}

module.exports = BrowserService;