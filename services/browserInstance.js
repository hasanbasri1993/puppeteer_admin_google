const BrowserService = require('./browserService');
const instance = new BrowserService();

module.exports = {
    instance,
    isInitialized: () => instance.isInitialized,
    close: () => instance.close()
};