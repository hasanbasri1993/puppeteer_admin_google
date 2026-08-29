# Panduan Deploy Produksi

Server: Node.js/Express + Puppeteer (Google Admin automation), Redis (BullMQ), PM2.

## 1. Prasyarat sistem

- Node v22.18.0 (lihat `.nvmrc`)
- Redis server (lokal atau reachable via `REDIS_HOST`/`REDIS_PORT`)
- PM2 (`npm i -g pm2`)
- Chromium deps untuk Puppeteer (di Linux: `apt install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2` atau setara)

## 2. Environment (`.env`)

Copy `.env.example` -> `.env`, isi:

- `GOOGLE_ADMIN_USERNAME`, `GOOGLE_ADMIN_PASSWORD`, `GOOGLE_TOTP_SECRET` - akun admin Puppeteer login
- `PORT` (default 7123)
- `RELOGIN_TIME` - cron expr relogin sesi (default tiap 40 menit di kode, `.env.example` contoh tiap 5 menit - sesuaikan, jangan terlalu sering karena tiap relogin = 1 full login cycle)
- `HEADLESS=true` di produksi (headed cuma buat debug lokal)
- `DEBUG=` kosongkan di produksi (log verbose Puppeteer bikin noise)
- Pusher: `APP_ID`/`KEY`/`SECRET`/`CLUSTER`
- Telegram: `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`
- Google OAuth: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_CALLBACK_URL`/`PUBLIC_URL`
- `SESSION_SECRET` - **wajib diisi di produksi**, kode fallback ke `'your-secret-key'` kalau kosong (celah keamanan session hijack)
- `NODE_ENV=production` - **wajib**, ini yang bikin cookie session `secure`+`sameSite=none` (app.js:40-41). Tanpa ini cookie session gak secure di prod.
- `REDIS_HOST`/`REDIS_PORT` - kalau Redis bukan di `127.0.0.1:6379`
- `MAX_CONCURRENT_PAGES` - limit tab Puppeteer bersamaan (default 3, naikkan hati-hati, tiap tab = RAM Chromium)

File `token.json`/`credentials.json` (OAuth Admin SDK, dipakai `googleApiService.js`) harus ada di root, hasil dari flow `authorize()` lokal-CLI - jalankan sekali di mesin dev, lalu copy ke server (jangan commit ke git, sudah di-gitignore).

## 3. Redis - wajib `noeviction`

BullMQ butuh Redis dengan `maxmemory-policy=noeviction`. Kalau default (`allkeys-lru`/`volatile-lru`), Redis bisa evict job data saat memory penuh -> job turn-off hilang diam-diam.

```bash
redis-cli config set maxmemory-policy noeviction
```

Itu cuma runtime, hilang saat Redis restart. Persist di `redis.conf`:

```
maxmemory-policy noeviction
```

lalu restart Redis atau `redis-cli config rewrite` (kalau ada `dir`/`dbfilename` config permission write).

## 4. Jalankan via PM2

`ecosystem.config.js` sudah ada di root (app name `puppeteer-admin-google`, `node_args: --expose-gc --max-old-space-size=4096`, log ke `./logs/out.log` & `./logs/error.log`).

```bash
pm2 start ecosystem.config.js
pm2 save                 # persist process list
pm2 startup              # generate command buat auto-start pm2 saat server reboot - jalankan command yang di-print
```

Cek status:

```bash
pm2 list
pm2 logs puppeteer-admin-google
pm2 monit
```

## 5. Log rotation (pm2-logrotate)

Sudah ter-install & terkonfigurasi rotasi harian (jam 00:00, terlepas dari ukuran file):

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval "0 0 * * *"
pm2 set pm2-logrotate:workerInterval 30
pm2 set pm2-logrotate:dateFormat "YYYY-MM-DD"
```

Cek config aktif: `pm2 conf pm2-logrotate` atau `pm2 describe pm2-logrotate`.

Log juga bisa dilihat langsung dari dashboard: menu **Log Server** (admin-only), baca via `GET /api/admin/server-logs?type=out|error`.

## 6. Reverse proxy (Nginx contoh)

App listen di `PORT` (default 7123) plain HTTP. Taruh di belakang reverse proxy buat TLS + domain:

```nginx
server {
    listen 443 ssl;
    server_name your-domain;

    ssl_certificate     /path/fullchain.pem;
    ssl_certificate_key /path/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:7123;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`app.set('trust proxy', 1)` sudah ada di `app.js` - penting biar Express baca `X-Forwarded-*` dengan benar (session cookie `secure` check, dll).

## 7. Data files yang perlu di-backup rutin

Bukan di git (gitignored), harus di-backup manual/cron di server:

- `ids.json` - roster siswa (ada auto-backup single-slot ke `ids.backup.json` tiap upload dari UI, tapi cuma 1 slot - backup eksternal tetap perlu buat histori lebih dari 1 versi)
- `admins.json` - daftar admin
- `token.json`, `credentials.json` - OAuth Admin SDK
- `.sessions/` - file-based session store (kalau dihapus, semua user ke-logout)
- `.puppeteer-profile/` - profil Chrome persisten (kalau hilang, harus login+TOTP ulang dari nol)

## 8. Health check

- `GET /api/status` - status browser Puppeteer (`instance.getStatus()`)
- Dashboard -> **Diagnostik Browser** - screenshot halaman aktif + error terbaru
- Dashboard -> **Log Server** - tail log PM2
- Telegram - tiap request `/api` & event browser (init/relogin) dikirim ke chat yang dikonfigurasi, jadi channel independen dari PM2 log

## 9. Restart/update flow

```bash
git pull
npm install
pm2 restart puppeteer-admin-google
```

`ids.json` dibaca fresh tiap request (gak ada cache), jadi update roster siswa gak perlu restart.
