const puppeteer = require('puppeteer');
const authService = require('./authService');
const cron = require('node-cron');
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
      this.browser = await puppeteer.launch({ headless: true });
      const page = await this.browser.newPage();
      await authService.performLogin(page, username, password);
      await page.close();
      this._isInitialized = true;
      console.log('Successfully initialized browser and logged in');
    } catch (error) {
      console.error('Initialization error:', error);
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
    const page = await this.browser.newPage();
    try {
      await page.goto(`https://admin.google.com/ac/users/${id}/security`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await page.waitForSelector(`xpath/${XPATH_LOGIN_CHALLENGE}`, { visible: true });
      // Click on the element with the text 'Login Challenge'
      const loginChallengeElements = await page.$$(`xpath/${XPATH_LOGIN_CHALLENGE}`);
      if (loginChallengeElements.length > 0) {
        await loginChallengeElements[0].click();

        // Wait for the 'Turn off for 10 mins' span to be visible and clickable
        await page.waitForSelector(`xpath/${XPATH_TURN_OFF}`, { visible: true });
        const turnOffElements = await page.$$(`xpath/${XPATH_TURN_OFF}`);
        if (turnOffElements.length > 0) {
          await turnOffElements[0].click();
        } else {
          throw new Error("'Turn off for 10 mins' span not found");
        }

      } else {
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
      this.browser = null;
      this._isInitialized = false;
    }
  }
}

module.exports = BrowserService;