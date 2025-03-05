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
  }

  get isInitialized() {
    return this._isInitialized;
  }

  async initialize(username, password) {
    try {

      logger.info('Initializing browser and logging in...');
      this.browser = await puppeteer.launch();
      const page = await this.browser.newPage();
      await authService.performLogin(page, username, password);
      await page.close();
      this._isInitialized = true;
      logger.info('Successfully initialized browser and logged in');
    } catch (error) {
      logger.error('Failed to initialize browser: ' + error);
      await this.close();
      throw error;
    }
  }

  async performRelogin(username, password) {
    cron.schedule(process.env.RELOGIN_TIME, async () => {
      const page = await this.browser.newPage();
      await authService.performLogin(page, username, password, { logout: true });
      await page.close();
    });
  }

  async handleSecurityChallenge(id) {
    logger.info('Creating new page to handle security challenge...');
    const page = await this.browser.newPage();
    try {
      logger.info('Opening security page for user:' + id,);
      logger.info(`Goto: https://admin.google.com/ac/users/${id}/security`,);
      await page.goto(`https://admin.google.com/ac/users/${id}/security`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for the element with the text 'Login Challenge' to be visible
      logger.info('Waiting for login challenge element...');
      await page.waitForSelector(`xpath/${XPATH_LOGIN_CHALLENGE}`, { visible: true });
      // Click on the element with the text 'Login Challenge'
      const loginChallengeElements = await page.$$(`xpath/${XPATH_LOGIN_CHALLENGE}`);
      if (loginChallengeElements.length > 0) {
        await loginChallengeElements[0].click();
        logger.info('Clicking on: loginChallengeElements');
        // Wait for the 'Turn off for 10 mins' span to be visible and clickable
        await page.waitForSelector(`xpath/${XPATH_TURN_OFF}`, { visible: true });
        const turnOffElements = await page.$$(`xpath/${XPATH_TURN_OFF}`);
        if (turnOffElements.length > 0) {
          logger.info('Clicking on: Turn off for 10 mins');
          await turnOffElements[0].click();
        } else {
          logger.error("Turn off for 10 mins span not found");
          throw new Error("'Turn off for 10 mins' span not found");
        }

      } else {
        logger.error("Login Challenge element not found");
        throw new Error("Login Challenge element not found");
      }
      return { status: 'success' };
    } finally {
      await page.close();
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      logger.info("browser closed");
      this.browser = null;
      this._isInitialized = false;
    }
  }
}

module.exports = BrowserService;