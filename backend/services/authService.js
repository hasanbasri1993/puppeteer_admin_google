import { ADMIN_URL } from '../config/constants';

export async function performLogin(page, username, password) {
    await page.goto(ADMIN_URL, { waitUntil: 'networkidle2' });
    await page.type('#identifierId', username);
    await page.click('#identifierNext');
    await page.waitForSelector('input[type="password"]', { visible: true, timeout: 10000 });
    await page.type('input[type="password"]', password);
    await page.click('#passwordNext');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
}