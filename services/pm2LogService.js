const {execFile} = require('child_process');
const fs = require('fs');
const path = require('path');

const APP_NAME = process.env.PM2_APP_NAME || 'puppeteer-admin-google';
const FALLBACK_PATHS = {
    out: path.join(process.cwd(), 'logs', 'out.log'),
    error: path.join(process.cwd(), 'logs', 'error.log')
};

// ponytail: resolves log paths via `pm2 jlist` (source of truth for where PM2
// is actually writing), falling back to ecosystem.config.js's fixed paths if
// pm2 isn't reachable (e.g. running via `npm run dev` instead of pm2).
function resolveLogPaths() {
    return new Promise((resolve) => {
        execFile('pm2', ['jlist'], {timeout: 5000}, (err, stdout) => {
            if (err) return resolve(FALLBACK_PATHS);
            try {
                const list = JSON.parse(stdout);
                const proc = list.find(p => p.name === APP_NAME);
                if (!proc) return resolve(FALLBACK_PATHS);
                resolve({
                    out: proc.pm2_env.pm_out_log_path || FALLBACK_PATHS.out,
                    error: proc.pm2_env.pm_err_log_path || FALLBACK_PATHS.error
                });
            } catch (e) {
                resolve(FALLBACK_PATHS);
            }
        });
    });
}

function tailFile(filePath, maxLines) {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    return lines.slice(-maxLines);
}

async function getLogs(type, maxLines) {
    const paths = await resolveLogPaths();
    const filePath = paths[type];
    if (!filePath) throw new Error(`Tipe log tidak dikenal: ${type}`);
    return {path: filePath, lines: tailFile(filePath, maxLines)};
}

module.exports = {getLogs};
