const {ADMIN_URL, ADMIN_LOGIN, ADMIN_LOGOUT} = require('../config/constants');
const logger = require('pino')()
const speakeasy = require('speakeasy');

module.exports = {
    /**
     * Perform login in Google Admin console with TOTP verification.
     * @param {puppeteer.Page} page - Puppeteer Page object.
     * @param {string} username - Google Admin username.
     * @param {string} password - Google Admin password.
     * @param {Object} [options] - Options for login.
     * @param {boolean} [options.logout=false] - If true, it will logout first before login.
     * @param {string} [options.totpSecret] - TOTP secret key. If not provided, it will use the default value.
     * @param {number} [options.maxRetries=3] - Maximum number of retries if login fails.
     * @param {boolean} [options.debug=false] - If true, it will log debug messages.
     * @returns {Promise<boolean>} - True if login is successful, false otherwise.
     */
    performLoginWithTOTP: async (page, username, password, options = {}) => {
        const {
            logout = false,
            totpSecret = process.env.GOOGLE_TOTP_SECRET,
            maxRetries = 3,
            debug = process.env.DEBUG
        } = options;

        if (!totpSecret) {
            throw new Error("TOTP Secret is required! Please run setupTOTPSecret() first and set GOOGLE_TOTP_SECRET in .env");
        }

        let retryCount = 0;

        while (retryCount < maxRetries) {
            try {
                // Navigation
                if (logout) {
                    if (debug) console.log("🔄 Logging out first...");
                    await page.goto(ADMIN_LOGOUT, {waitUntil: 'networkidle2'});
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    await page.goto(ADMIN_LOGIN, {waitUntil: 'networkidle2'});
                } else {
                    if (debug) console.log("🌐 Navigating to admin URL...");
                    await page.goto(ADMIN_URL, {waitUntil: 'networkidle2'});
                }

                // Username input
                if (debug) console.log("👤 Entering username...");
                await page.waitForSelector('#identifierId', {visible: true, timeout: 15000});
                await page.evaluate(() => document.querySelector('#identifierId').value = '');
                await page.type('#identifierId', username, {delay: 50});
                await page.click('#identifierNext');

                // Password input
                if (debug) console.log("🔐 Entering password...");
                await page.waitForSelector('input[type="password"]', {visible: true, timeout: 15000});
                await page.evaluate(() => {
                    const passwordInput = document.querySelector('input[type="password"]');
                    if (passwordInput) passwordInput.value = '';
                });
                await page.type('input[type="password"]', password, {delay: 50});
                await page.click('#passwordNext');

                // Wait for page load
                await new Promise(resolve => setTimeout(resolve, 5000));

                // Check if 2FA is required
                const needs2FA = await page.evaluate(() => {
                    try {
                        const selectors = [
                            'input[type="tel"]',           // Phone verification
                            '#totpPin',                    // TOTP input
                            '[data-challenge-type]',       // Challenge page
                            'div[jsname="XIvz0b"]',       // Google's internal verification div
                            '[aria-label*="verification"], [aria-label*="code"]'
                        ];

                        return selectors.some(selector => {
                            try {
                                const element = document.querySelector(selector);
                                return element &&
                                    element.offsetParent !== null &&
                                    element.style.display !== 'none' &&
                                    element.style.visibility !== 'hidden';
                            } catch (e) {
                                return false;
                            }
                        });
                    } catch (error) {
                        return false;
                    }
                });

                if (needs2FA) {
                    if (debug) console.log("🔢 2FA verification detected, generating TOTP...");

                    // Generate TOTP code
                    const token = speakeasy.totp({
                        secret: totpSecret,
                        encoding: 'base32',
                        time: Math.floor(Date.now() / 1000), // Current time
                        step: 30 // Google uses 30-second steps
                    });

                    if (debug) console.log("🎯 Generated TOTP:", token);

                    // Find and fill TOTP input
                    const totpSelectors = [
                        'input[type="tel"]',
                        '#totpPin',
                        'input[aria-label*="code"]',
                        'input[placeholder*="code"]',
                        'input[maxlength="6"]',
                        'input[maxlength="8"]'
                    ];

                    let totpFilled = false;
                    for (const selector of totpSelectors) {
                        try {
                            const element = await page.$(selector);
                            if (element) {
                                const isVisible = await page.evaluate(el => {
                                    return el && el.offsetParent !== null;
                                }, element);

                                if (isVisible) {
                                    if (debug) console.log(`📝 Filling TOTP in: ${selector}`);
                                    await page.evaluate(el => el.value = '', element);
                                    await page.type(selector, token, {delay: 100});
                                    totpFilled = true;
                                    break;
                                }
                            }
                        } catch (e) {

                        }
                    }

                    if (!totpFilled) {
                        throw new Error("Could not find TOTP input field");
                    }

                    // Submit TOTP
                    const submitSelectors = [
                        '#totpNext',
                        'button[type="submit"]',
                        '[data-primary-action-label="Next"]',
                        '[data-primary-action-label="Verify"]',
                        'div[role="button"][data-primary-action-label]'
                    ];

                    let submitted = false;
                    for (const selector of submitSelectors) {
                        try {
                            const button = await page.$(selector);
                            if (button) {
                                const isVisible = await page.evaluate(el => {
                                    return el && el.offsetParent !== null;
                                }, button);

                                if (isVisible) {
                                    if (debug) console.log(`🔘 Clicking submit: ${selector}`);
                                    await button.click();
                                    submitted = true;
                                    break;
                                }
                            }
                        } catch (e) {

                        }
                    }

                    if (!submitted) {
                        // Try pressing Enter as fallback
                        await page.keyboard.press('Enter');
                    }
                }

                // Wait for final navigation
                await page.waitForNavigation({
                    waitUntil: 'networkidle2',
                    timeout: 30000
                }).catch(() => {
                    // Sometimes navigation doesn't trigger, check URL instead
                });

                // Verify login success
                await new Promise(resolve => setTimeout(resolve, 2000));
                const currentUrl = page.url();
                const isLoggedIn = !currentUrl.includes('accounts.google.com/signin') &&
                    !currentUrl.includes('accounts.google.com/challenge');

                if (isLoggedIn) {
                    if (debug) console.log("✅ Login berhasil!");
                    return true; // Exit the function successfully
                } else {
                    throw new Error(`Login gagal - masih di halaman: ${currentUrl}`);
                }

            } catch (error) {
                retryCount++;
                if (debug) console.log(`❌ Attempt ${retryCount} failed:`, error.message);

                if (retryCount >= maxRetries) {
                    throw new Error(`Login gagal setelah ${maxRetries} percobaan: ${error.message}`);
                }

                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        // If we reach here, all retries failed
        throw new Error(`Login gagal setelah ${maxRetries} percobaan`);
    }
}