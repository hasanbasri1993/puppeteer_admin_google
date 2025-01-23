import { ADMIN_URL, ADMIN_LOGIN, ADMIN_LOGOUT } from '../config/constants';
const logger = require('pino')()

export async function performLogin(page, username, password, { logout = false } = {}) {
    if (logout) {
        logger.info("goto: " + ADMIN_LOGOUT);
        await page.goto(ADMIN_LOGOUT, { waitUntil: 'networkidle2' });
        setTimeout(async () => {
            logger.info("goto: " + ADMIN_LOGIN);
            await page.goto(ADMIN_LOGIN, { waitUntil: 'networkidle2' });
        }, 3000);
    } else {
        logger.info("goto: " + ADMIN_URL);
        await page.goto(ADMIN_URL, { waitUntil: 'networkidle2' });
    }
    logger.info("waitForSelector: '#identifierId'");
    await page.waitForSelector('#identifierId', { visible: true, timeout: 10000 });
    logger.info("type: '#identifierId': ", username);
    await page.type('#identifierId', username);
    await page.click('#identifierNext');
    logger.info("waitForSelector: 'input[type=password]'");
    await page.waitForSelector('input[type="password"]', { visible: true, timeout: 10000 });
    logger.info("type: input[type=password]: ", password);
    await page.type('input[type="password"]', password);
    await page.click('#passwordNext');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
}