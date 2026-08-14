# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Node.js/Express backend that automates Google Admin Console operations with Puppeteer, primarily to turn off "identity questions" login challenges for students (`ids.json`) at what looks like an educational institution (`daarululuumlido.com`). It also exposes a Google Workspace password-reset API via the Admin SDK, a server-rendered EJS dashboard, Google OAuth login (Passport), and Telegram-based request logging.

There used to be a separate Vite+Vue frontend in `frontend/`, but it was deliberately removed in commit `41d5fa2` ("refactor into onefolder root") when the project moved to the server-rendered EJS views under `views/`. There is no bundler/build step anywhere in this repo — don't reintroduce a `frontend/` or `dist/` folder expecting it to be wired in; the dashboard is plain EJS + vanilla JS served directly by Express.

## Commands

```bash
npm run dev     # node app.js — plain run
npm start       # nodemon with --expose-gc --max-old-space-size=4096 (note: `start` script uses `set` which is Windows cmd syntax, not POSIX — use `npm run dev` or run nodemon directly on Linux/macOS)
```

There is no test suite, lint config, or build step in this repo.

Node version is pinned via `.nvmrc` (v22.18.0).

Environment variables are documented in `.env.example` — copy to `.env` before running. Key ones: `GOOGLE_ADMIN_USERNAME`/`PASSWORD`/`GOOGLE_TOTP_SECRET` (Puppeteer login), `PORT` (default 7123), `RELOGIN_TIME` (cron expression), `HEADLESS`, Pusher `APP_ID`/`KEY`/`SECRET`/`CLUSTER`, Telegram `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`, Google OAuth `GOOGLE_CLIENT_ID`/`SECRET`/`GOOGLE_CALLBACK_URL`/`PUBLIC_URL`. Authorized-admin emails are **not** env-based (see `admins.json` below).

## Architecture

**Two parallel Google auth mechanisms, don't confuse them:**
- **Puppeteer + TOTP** (`services/authService.js`, `services/browserService.js`) drives a headless/headed Chrome session logged into `admin.google.com` as the admin user, using `speakeasy` for TOTP codes. This is how the turn-off-challenge feature works — there's no public Admin API for it, so it's simulated via DOM clicks on XPath selectors defined in `config/constants.js`.
- **OAuth2 (Passport + `googleapis` Admin SDK)** (`config/passport.js`, `services/googleApiService.js`) is a separate, real API-based flow used only for dashboard login (`/auth/google`) and the password-reset endpoint. `token.json`/`credentials.json` back a *second*, independent OAuth client used specifically by `googleApiService.js`'s `authorize()` (Node-CLI-style local-auth flow) — this is distinct from the Passport session used for dashboard login.

**One long-lived Puppeteer instance, not per-request.** `services/browserInstance.js` creates a singleton `BrowserService` at module load. `app.js` initializes it once at startup (`instance.initialize(...)` then `instance.performRelogin(...)`), and the browser + logged-in session persists across requests. `browserService.js` schedules a cron-based relogin (`RELOGIN_TIME`, default every 40 min) to keep the admin session alive, plus its own health-check/crash-recovery loop (`handleBrowserCrash`, capped at `maxCrashRecoveryAttempts`) and periodic GC/memory logging (`startMemoryCleanup`). A manual relogin can also be triggered via `POST /api/relogin`.

**Queued turn-off requests.** `controllers/turnOff.js` looks up NIS (student ID) → `ID_GOOGLE` mappings from `ids.json`, then submits the request to `services/browserJobQueue.js`. The queue is FIFO with one active request job because all requests share one Puppeteer browser session; each job processes `BATCH_SIZE` students in parallel. `BrowserService` enforces `MAX_CONCURRENT_PAGES` as a global page limit. A job key combines the signed-in user's email and the client-generated `requestId`; duplicate request keys are rejected, while Pusher progress remains isolated to that request's `turn_off_<requestId>` channel. When Redis is reachable (default `127.0.0.1:6379`), BullMQ persists jobs; otherwise the same service falls back to memory for the running process.

**Routing is split three ways**, all mounted in `app.js`:
- `routes/index.js` → mounted at `/api`, wrapped in `telegramLoggingMiddleware` (must stay *before* the routes so it can observe every `/api` request/response, including status code and timing). Two dead-stub duplicate endpoints (hyphenated `turn-off-challenge` and `reset-password`, left over from an earlier iteration and never wired to any view) were removed — the real ones are `turn_off` and `reset_password`.
- `routes/pages.js` → mounted at `/pages`, serves EJS partials for the dashboard's client-side "SPA-like" navigation (`GET /pages/load-content/:page` renders `views/partials/<page>.ejs`) plus `ids.json`-backed lookups (`/get-classes`, `/get-nis-by-class`).
- `routes/auth.js` → mounted at `/auth`, Google OAuth login/callback via Passport.

**Dashboard is server-rendered EJS + vanilla JS, not an SPA.** `views/dashboard.ejs` is a shell (Tailwind via CDN, Toastify for alerts) that fetches partial HTML fragments from `/pages/load-content/:page` and swaps them into the DOM; each partial (`views/partials/*.ejs`) has its own inline `<script>` doing `fetch()` calls to the `/api` and `/pages` endpoints. There's no bundler/build step for the frontend.

**Access control has two tiers**, both in `middlewares/authMiddleware.js`: `isAuthenticated` (any logged-in Google account, via Passport session) gates the dashboard generally; `isAuthorizedForReset`/`isUserAuthorizedForReset` gate the "admin" tier — Reset Password, Kelola Admin, and Upload Data Siswa menu items/pages, plus the corresponding `/api/*` endpoints. `routes/index.js`'s `POST /api/turn_off` currently has no auth middleware applied, unlike the admin-tier endpoints.

**Admin list is a runtime file, not env config.** `services/adminService.js` persists authorized admin emails in `admins.json` (root-level, git-tracked like `ids.json`), auto-seeding it with `hasanbasri@daarululuumlido.com` if the file is missing/empty/invalid. `middlewares/authMiddleware.js` calls `adminService.isAdmin(email)` instead of checking an env var. Managed via the "Kelola Admin" dashboard page (`views/partials/manage-admin.ejs` → `GET/POST /api/admin/list|add|remove`, `controllers/adminController.js`); `removeAdmin` refuses to drop the last remaining admin so the list can't empty itself out. Email validation is intentionally strict (`[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`) — the admin list is rendered back into the dashboard, so a looser regex would open a stored-XSS path via a crafted "email".

**`ids.json` can be replaced from the UI.** "Upload Data Siswa" (`views/partials/upload-ids.ejs` → `POST /api/admin/upload-ids`, multipart via `multer` memory storage) lets an admin upload a new JSON file that wholesale-replaces `ids.json`. `adminController.uploadIds` validates the payload is a non-empty array of objects each containing `ID_GOOGLE`/`NIS`/`KELAS`/`NAMA` before writing, and copies the previous file to `ids.backup.json` (gitignored, single-slot, overwritten each upload) first — that's the only rollback path if a bad upload gets through.

**Telegram logging is separate from app logging.** `utils/logger.js` (backed by Node.js' built-in console) handles normal stdout app logging. `services/telegramLogger.js` + `middlewares/telegramLogging.js` additionally push a formatted message to a Telegram chat for every `/api` request (method, URL, status, response time, and — if authenticated — the user's name/email), and `browserService.js`/`authService.js` also push ad hoc system-event messages (browser init, relogin success/failure) via the same logger. Treat these as two independent channels when debugging — a failure might show in one and not the other.

**`ids.json`** is the student roster (`ID_GOOGLE`, `NIS`, `KELAS`, `NAMA`) read fresh from disk on each request (`turnOff.js`, `routes/pages.js`) — no caching/in-memory copy, so edits to the file take effect immediately without a restart.

The Pusher integration is `config/pusher.js`, used directly by `controllers/turnOff.js` — there is no separate `services/pusherService.js` (a dead-code file with hardcoded credentials was removed).
