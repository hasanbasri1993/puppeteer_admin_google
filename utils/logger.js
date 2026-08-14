// Lightweight application logger backed by Node.js' built-in console.
module.exports = {
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console)
};
