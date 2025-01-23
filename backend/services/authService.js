import { ADMIN_URL, ADMIN_LOGIN, ADMIN_LOGOUT } from '../config/constants';

export async function performLogin(page, username, password, { logout = false } = {}) {
    if (logout) {
        await page.goto(ADMIN_LOGOUT, { waitUntil: 'networkidle2' });
        setTimeout(async () => {
            await page.goto(ADMIN_LOGIN, { waitUntil: 'networkidle2' });
        }, 3000);
    } else {
        await page.goto(ADMIN_URL, { waitUntil: 'networkidle2' });
    }
    await page.waitForSelector('#identifierId', { visible: true, timeout: 10000 });
    await page.type('#identifierId', username);
    await page.click('#identifierNext');
    await page.waitForSelector('input[type="password"]', { visible: true, timeout: 10000 });
    await page.type('input[type="password"]', password);
    await page.click('#passwordNext');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
}