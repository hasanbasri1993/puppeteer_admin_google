const { shell, app, BrowserWindow, ipcMain } = require('electron');

const puppeteer = require('puppeteer');
let win; // Declare the window variable outside the createWindow function

function createWindow() {
    win = new BrowserWindow({
        title: 'Gmail Turn Off Challange',
        width: 500,
        height: 580,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    //win.webContents.openDevTools();
    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
      });
    // Load your HTML file or any other setup here
    win.loadFile('index.html');
}


async function scrape(data) {
    const browser = await puppeteer.launch({ headless: false }); // Set headless to false to see the browser
    const page = await browser.newPage();
    const xPathLoginChallenge = "//div[contains(text(),'Turn off identity questions for 10 minutes after a')]";
    const xPathTurnOff = "//*[contains(text(), 'Turn off for 10 mins')]";
    const numbersArray = data['ids_gmail'].split(',').map(number => number.trim());
    const username = data['username'];
    const password = data['password'];

    try {
        // Navigate to admin.google.com
        await page.goto('https://admin.google.com');

        // Login process
        await page.type('#identifierId', username);
        await page.click('#identifierNext');
        await page.waitForSelector('input[type="password"]', { visible: true });
        await page.type('input[type="password"]', password);
        await page.click('#passwordNext');
        await page.waitForNavigation();

        // Loop through the array of numbers
        for (let i = 0; i < numbersArray.length; i++) {
            const number = numbersArray[i];
            // Perform any actions you need with each number here
            await page.goto(`https://admin.google.com/ac/users/${number}/security`).then(async () => {
                console.log(`Navigated to https://admin.google.com/ac/users/${number}/security`);

                await page.waitForXPath(xPathLoginChallenge, { visible: true });
                // Click on the element with the text 'Login Challenge'
                const loginChallengeElements = await page.$x(xPathLoginChallenge);
                if (loginChallengeElements.length > 0) {
                    await loginChallengeElements[0].click();

                    // Wait for the 'Turn off for 10 mins' span to be visible and clickable
                    await page.waitForXPath(xPathTurnOff, { visible: true });
                    const turnOffElements = await page.$x(xPathTurnOff);
                    if (turnOffElements.length > 0) {
                        await turnOffElements[0].click();
                    } else {
                        throw new Error("'Turn off for 10 mins' span not found");
                    }

                } else {
                    throw new Error("Login Challenge element not found");
                }
            });
            if (win) {
                win.webContents.send('update-data', { id: "progress", content: i + 1 });
            }
            await new Promise(resolve => setTimeout(resolve, 600));

        };

        // Close the browser if everything went well
       await page.goto('https://accounts.google.com/Logout?hl=en&continue=https://admin.google.com&timeStmp=1706761380&secTok=.AG5fkS_5ydBwpieKeRiZB7MOj9VskzIvOw&ec=GAdA7wI');
       await browser.close();

    } catch (error) {
        console.error('An error occurred:', error);
        // The browser will not be closed in case of an error
    }

}
// Listen for form submission
ipcMain.on('form-submission', (event, data) => {
    scrape(data);
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

