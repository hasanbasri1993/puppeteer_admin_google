const {ADMIN_URL, ADMIN_LOGIN, ADMIN_LOGOUT} = require('../config/constants');
const logger = require('../utils/logger')
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
            debug = process.env.DEBUG,
            maxWaitMs = 90000,
            unknownStateDelayMs = 1000
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
                    await page.goto(ADMIN_URL, {waitUntil: 'domcontentloaded'});

                    // A persisted Chrome profile may already have a valid Google
                    // session. Do not wait for network-idle or submit credentials
                    // again in that case.
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    const currentUrl = page.url();
                    if (currentUrl.includes('admin.google.com') &&
                        !currentUrl.includes('signin') &&
                        !currentUrl.includes('challenge')) {
                        if (debug) console.log("✅ Existing Google session is still valid");
                        return true;
                    }
                }

                // Click any visible button/div/span whose text matches one of
                // `texts` (case-insensitive, trimmed). Returns true if clicked.
                // Google's account-chooser "Verify it's you" re-auth screen has
                // no stable id/attribute to target - just a plain "Next" label.
                const clickByVisibleText = (texts) => page.evaluate((texts) => {
                    const wanted = texts.map(t => t.toLowerCase());
                    const candidates = document.querySelectorAll('button, [role="button"], a, span');
                    for (const el of candidates) {
                        const label = (el.innerText || el.textContent || '').trim().toLowerCase();
                        if (wanted.includes(label) && el.offsetParent !== null) {
                            (el.closest('button, [role="button"], a') || el).click();
                            return true;
                        }
                    }
                    return false;
                }, texts);

                // Check if an active, visible, enabled OTP input field actually exists
                const hasActiveOTPInput = () => page.evaluate(() => {
                    const selectors = [
                        'input[type="tel"]',
                        '#totpPin',
                        'input[autocomplete="one-time-code"]',
                        'input[aria-label*="verification"]',
                        'input[aria-label*="code"]',
                        'input[placeholder*="code"]'
                    ];
                    for (const selector of selectors) {
                        for (const el of document.querySelectorAll(selector)) {
                            if (el && el.offsetParent !== null && !el.disabled) return true;
                        }
                    }
                    return false;
                }).catch(() => false);

                // Helper function to fill and submit OTP
                const fillAndSubmitOTP = async () => {
                    // Generate new TOTP code (generate fresh each time since codes change every 30 seconds)
                    const token = speakeasy.totp({
                        secret: totpSecret,
                        encoding: 'base32',
                        time: Math.floor(Date.now() / 1000), // Current time
                        step: 30 // Google uses 30-second steps
                    });

                    if (debug) console.log("🎯 Generated TOTP:", token);

                    // Find and fill TOTP input - wait for it to appear first
                    if (debug) console.log("🔍 Looking for TOTP input field...");
                    
                    // Wait for any input field to appear (Google might show different fields)
                    try {
                        await page.waitForSelector('input[type="tel"], input[autocomplete="one-time-code"], #totpPin, input[maxlength="6"], input[maxlength="8"]', {
                            visible: true,
                            timeout: 10000
                        });
                    } catch (e) {
                        if (debug) console.log("⏳ TOTP input field not found immediately, continuing search...");
                    }

                    const totpSelectors = [
                        'input[type="tel"]',
                        'input[autocomplete="one-time-code"]',
                        '#totpPin',
                        'input[aria-label*="code"]',
                        'input[aria-label*="verification"]',
                        'input[placeholder*="code"]',
                        'input[placeholder*="verification"]',
                        'input[maxlength="6"]',
                        'input[maxlength="8"]',
                        'input[name*="totp"]',
                        'input[id*="totp"]',
                        'input[id*="code"]'
                    ];

                    let totpFilled = false;
                    for (const selector of totpSelectors) {
                        try {
                            const elements = await page.$$(selector);
                            for (const element of elements) {
                                const isVisible = await page.evaluate(el => {
                                    return el && 
                                           el.offsetParent !== null &&
                                           el.style.display !== 'none' &&
                                           el.style.visibility !== 'hidden' &&
                                           !el.disabled;
                                }, element);

                                if (isVisible) {
                                    if (debug) console.log(`📝 Filling TOTP in: ${selector}`);
                                    // Clear the input first
                                    await page.evaluate(el => el.value = '', element);
                                    await element.focus();
                                    // Type the token (this triggers proper input events)
                                    await page.type(selector, token, {delay: 50});
                                    totpFilled = true;
                                    break;
                                }
                            }
                            if (totpFilled) break;
                        } catch (e) {
                            if (debug) console.log(`⚠️ Error with selector ${selector}:`, e.message);
                            // Continue to next selector
                        }
                    }

                    if (!totpFilled) {
                        // Last resort: try to find any input that might be the code field
                        const allInputs = await page.$$('input');
                        for (const input of allInputs) {
                            const inputInfo = await page.evaluate(el => {
                                return {
                                    type: el.type,
                                    maxLength: el.maxLength,
                                    placeholder: el.placeholder || '',
                                    ariaLabel: el.getAttribute('aria-label') || '',
                                    visible: el.offsetParent !== null && el.style.display !== 'none'
                                };
                            }, input);
                            
                            if (inputInfo.visible && 
                                (inputInfo.type === 'tel' || 
                                 inputInfo.maxLength === 6 || 
                                 inputInfo.maxLength === 8 ||
                                 inputInfo.placeholder.toLowerCase().includes('code') ||
                                 inputInfo.ariaLabel.toLowerCase().includes('code'))) {
                                if (debug) console.log("📝 Found potential TOTP input, filling...");
                                await page.evaluate(el => el.value = '', input);
                                await input.focus();
                                // Type the token (this triggers proper input events)
                                await page.keyboard.type(token, {delay: 50});
                                totpFilled = true;
                                break;
                            }
                        }
                    }

                    if (!totpFilled) {
                        throw new Error("Could not find TOTP input field. Page might have changed or verification method is different.");
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
                            // Continue to next selector
                        }
                    }

                    if (!submitted) {
                        // Try pressing Enter as fallback
                        await page.keyboard.press('Enter');
                    }

                    // Wait for page to process the submission
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Try to wait for navigation, but don't fail if it doesn't happen
                    try {
                        await page.waitForNavigation({
                            waitUntil: 'networkidle0',
                            timeout: 5000
                        }).catch(() => {
                            // Navigation might not happen, that's okay
                        });
                    } catch (e) {
                        // Ignore navigation errors
                    }
                    
                    // Additional wait for page to settle
                    await new Promise(resolve => setTimeout(resolve, 3000));
                };

                // On every loop tick, look at whatever screen is currently up
                // and act on it - Google can show these in any order/combination
                // (account-chooser "Next", username, password, OTP), so re-check
                // state after each action instead of assuming a fixed sequence.
                const detectAndActOnCurrentScreen = async () => {
                    const currentUrl = page.url();
                    if (currentUrl.includes('admin.google.com') &&
                        !currentUrl.includes('signin') &&
                        !currentUrl.includes('challenge')) {
                        return 'logged_in';
                    }

                    if (await hasActiveOTPInput()) {
                        if (debug) console.log("🔢 OTP input detected, generating TOTP...");
                        await fillAndSubmitOTP();
                        return 'otp';
                    }

                    const hasPassword = await page.$eval('input[type="password"]', el => (
                        el.offsetParent !== null && !el.disabled
                    )).catch(() => false);
                    if (hasPassword) {
                        if (debug) console.log("🔐 Entering password...");
                        await page.evaluate(() => {
                            const el = document.querySelector('input[type="password"]');
                            if (el) el.value = '';
                        });
                        await page.type('input[type="password"]', password, {delay: 50});
                        await page.click('#passwordNext');
                        await page.waitForNavigation({waitUntil: 'networkidle0', timeout: 15000}).catch(() => {});
                        await new Promise(resolve => setTimeout(resolve, 1500));
                        return 'password';
                    }

                    const hasUsername = await page.$eval('#identifierId', el => (
                        el.offsetParent !== null && !el.disabled
                    )).catch(() => false);
                    if (hasUsername) {
                        if (debug) console.log("👤 Entering username...");
                        await page.evaluate(() => { document.querySelector('#identifierId').value = ''; });
                        await page.type('#identifierId', username, {delay: 50});
                        await page.click('#identifierNext');
                        await page.waitForNavigation({waitUntil: 'networkidle0', timeout: 15000}).catch(() => {});
                        await new Promise(resolve => setTimeout(resolve, 1500));
                        return 'username';
                    }

                    // No known input field: likely the account-chooser "Verify
                    // it's you" confirmation screen, just a "Next" button.
                    if (await clickByVisibleText(['Next', 'Berikutnya'])) {
                        if (debug) console.log("🔘 Clicked 'Next' on confirmation screen...");
                        await new Promise(resolve => setTimeout(resolve, 1500));
                        return 'next';
                    }

                    return 'unknown';
                };

                const overallDeadline = Date.now() + maxWaitMs;
                const maxSteps = 20;
                let state = 'unknown';
                for (let step = 0; step < maxSteps && Date.now() < overallDeadline; step++) {
                    state = await detectAndActOnCurrentScreen();
                    if (state === 'logged_in') break;
                    if (state === 'unknown') await new Promise(resolve => setTimeout(resolve, unknownStateDelayMs));
                }

                if (state !== 'logged_in') {
                    // Give the last action a moment to settle, then re-check the URL.
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    const currentUrl = page.url();
                    const isLoggedIn = !currentUrl.includes('accounts.google.com/signin') &&
                        !currentUrl.includes('accounts.google.com/challenge');
                    if (!isLoggedIn) {
                        throw new Error(`Login gagal - masih di halaman: ${currentUrl}`);
                    }
                }

                if (debug) console.log("✅ Login berhasil!");
                return true;

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
