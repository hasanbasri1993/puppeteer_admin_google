module.exports = {
    apps: [
        {
            name: 'puppeteer-admin-google',
            script: 'app.js',
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            node_args: '--expose-gc --max-old-space-size=4096',
            env: {
                NODE_ENV: 'production'
            },
            // Explicit paths so the "Log Server" dashboard page can find these
            // regardless of PM2_HOME on a given machine.
            out_file: './logs/out.log',
            error_file: './logs/error.log',
            merge_logs: true,
            time: true
        }
    ]
};
