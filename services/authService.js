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

                // Wait for navigation after password submission
                if (debug) console.log("⏳ Waiting for page navigation after password...");
                try {
                    await page.waitForNavigation({
                        waitUntil: 'networkidle0',
                        timeout: 15000
                    });
                } catch (e) {
                    // If navigation timeout, wait a bit more
                    if (debug) console.log("⏳ Navigation timeout, waiting additional time...");
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }

                // Wait a bit more for page to fully load
                await new Promise(resolve => setTimeout(resolve, 3000));

                // Helper function to check if OTP input is required
                const checkIfOTPRequired = async () => {
                    // First check URL to see if we're still on a challenge page
                    const currentUrl = page.url();
                    if (debug) console.log("🔍 Current URL:", currentUrl);
                    
                    const isOnChallengePage = currentUrl.includes('accounts.google.com/challenge') || 
                                             currentUrl.includes('accounts.google.com/signin/challenge') ||
                                             currentUrl.includes('challenge');
                    
                    // Check for text indicating 2-Step Verification
                    const has2StepVerificationText = await page.evaluate(() => {
                        const text = document.body.innerText || document.body.textContent || '';
                        return text.includes('2-Step Verification') || 
                               text.includes('verification code') ||
                               text.includes('Google Authenticator');
                    });

                    if (debug) {
                        console.log("🔍 Is on challenge page:", isOnChallengePage);
                        console.log("🔍 Has 2-Step Verification text:", has2StepVerificationText);
                    }
                    
                    if (!isOnChallengePage && !currentUrl.includes('accounts.google.com/signin') && !has2StepVerificationText) {
                        // We're not on a challenge page anymore, likely logged in
                        return false;
                    }
                    
                    // Then check for OTP input fields
                    const hasOTPInput = await page.evaluate(() => {
                        try {
                            const selectors = [
                                'input[type="tel"]',           // Phone verification
                                '#totpPin',                    // TOTP input
                                '[data-challenge-type]',       // Challenge page
                                'div[jsname="XIvz0b"]',       // Google's internal verification div
                                'input[aria-label*="verification"]',
                                'input[aria-label*="code"]',
                                'input[placeholder*="code"]',
                                'input[name*="totp"]',
                                'input[id*="totp"]',
                                'input[autocomplete="one-time-code"]'
                            ];

                            // Check if any selector matches a visible input
                            for (const selector of selectors) {
                                try {
                                    const elements = document.querySelectorAll(selector);
                                    for (const element of elements) {
                                        if (element && 
                                            element.offsetParent !== null &&
                                            element.style.display !== 'none' &&
                                            element.style.visibility !== 'hidden' &&
                                            !element.disabled) {
                                            // Check if input is empty or has placeholder text indicating it needs input
                                            const isEmpty = !element.value || element.value.length === 0;
                                            if (isEmpty) {
                                                return true;
                                            }
                                        }
                                    }
                                } catch (e) {
                                    // Continue to next selector
                                }
                            }
                            return false;
                        } catch (error) {
                            return false;
                        }
                    });

                    if (debug) console.log("🔍 Has OTP input field:", hasOTPInput);
                    
                    // Return true if we're on challenge page OR have 2-step verification text OR have OTP input
                    return isOnChallengePage || has2StepVerificationText || hasOTPInput;
                };

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

                // Handle multiple OTP requests (Google sometimes asks for a second code)
                let maxOTPAttempts = 5; // Increased to handle multiple requests
                let otpAttempts = 0;
                
                // First check immediately after password submission
                let needsOTP = await checkIfOTPRequired();
                
                while (otpAttempts < maxOTPAttempts) {
                    if (needsOTP) {
                        otpAttempts++;
                        if (debug) console.log(`🔢 2-Step Verification detected (attempt ${otpAttempts}/${maxOTPAttempts}), generating TOTP...`);
                        
                        await fillAndSubmitOTP();
                        
                        // Wait longer after submission to see if Google asks for another code
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        
                        // Check again if another OTP is needed
                        needsOTP = await checkIfOTPRequired();
                    } else {
                        // No more OTP required, break out of loop
                        if (debug && otpAttempts > 0) console.log("✅ No more OTP required, proceeding...");
                        break;
                    }
                }
                
                if (otpAttempts >= maxOTPAttempts && needsOTP) {
                    throw new Error(`Maximum OTP attempts (${maxOTPAttempts}) reached but OTP is still required`);
                }
                
                if (otpAttempts === 0 && needsOTP) {
                    if (debug) console.log("⚠️ OTP was required but not detected properly");
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