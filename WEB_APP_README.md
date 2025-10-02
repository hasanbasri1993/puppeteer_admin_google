# Web Application - Admin Panel

Aplikasi web internal untuk mengelola Turn Off Challenge dan Reset Password menggunakan Node.js, Express, EJS, dan Tailwind CSS.

## Fitur

1. **Google OAuth Login** - Login menggunakan Google OAuth 2.0
2. **Dashboard** - Halaman utama dengan sidebar dan content area
3. **Turn Off Challenge** - Nonaktifkan tantangan login untuk siswa
4. **Reset Password** - Reset password untuk siswa atau pengguna

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Konfigurasi Environment Variables

Buat file `.env` dengan konfigurasi berikut:

```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# Session Configuration
SESSION_SECRET=your_session_secret_here

# Server Configuration
PORT=7123

# Existing configuration (keep your existing values)
GOOGLE_ADMIN_USERNAME=your_admin_username
GOOGLE_ADMIN_PASSWORD=your_admin_password
```

### 3. Setup Google OAuth

1. Buka [Google Cloud Console](https://console.cloud.google.com/)
2. Buat project baru atau pilih project yang ada
3. Aktifkan Google+ API
4. Buat OAuth 2.0 credentials
5. Tambahkan authorized redirect URIs:
   - `http://localhost:7123/auth/google/callback`
6. Copy Client ID dan Client Secret ke file `.env`

### 4. Konfigurasi Email yang Diizinkan

Edit file `middlewares/authMiddleware.js` dan tambahkan email yang diizinkan untuk fitur Reset Password:

```javascript
const AUTHORIZED_EMAILS = [
  'admin1@email.com',
  'admin2@email.com',
  // Tambahkan email lain di sini
];
```

## Struktur File

```
backend/
├── views/
│   ├── layout.ejs              # Layout utama
│   ├── login.ejs               # Halaman login
│   ├── dashboard.ejs           # Halaman dashboard
│   └── partials/
│       ├── turn-off-challenge.ejs  # UI Turn Off Challenge
│       └── reset-password.ejs      # UI Reset Password
├── routes/
│   └── auth.js                 # Route autentikasi
├── middlewares/
│   └── authMiddleware.js       # Middleware autentikasi
├── config/
│   └── passport.js             # Konfigurasi Passport
├── ids.json                    # Data siswa (existing)
└── app.js                      # Aplikasi utama
```

## API Endpoints

### Web Routes
- `GET /` - Halaman login (redirect ke dashboard jika sudah login)
- `GET /dashboard` - Dashboard utama
- `GET /logout` - Logout

### Auth Routes
- `GET /auth/google` - Mulai Google OAuth
- `GET /auth/google/callback` - Callback Google OAuth

### API Routes
- `GET /api/load-content/:page` - Load content untuk dashboard
- `GET /api/get-classes` - Ambil daftar kelas dari ids.json
- `GET /api/get-nis-by-class?kelas=...` - Ambil NIS berdasarkan kelas
- `POST /api/turn-off-challenge` - Proses turn off challenge
- `POST /api/reset-password` - Proses reset password

## Cara Menggunakan

1. **Login**: Akses `http://localhost:7123` dan login dengan Google
2. **Dashboard**: Setelah login, akan diarahkan ke dashboard
3. **Turn Off Challenge**: 
   - Klik "Turn Off Challenge" di sidebar
   - Pilih tab "Per Kelas" atau "Batch NIS"
   - Isi data dan klik "Proses"
4. **Reset Password**:
   - Klik "Reset Password" di sidebar
   - Pilih tab "Santri" atau "Umum (Batch)"
   - Isi data dan klik "Reset Password"

## Data Structure

File `ids.json` berisi data siswa dengan struktur:
```json
[
  {
    "ID_GOOGLE": "105581611106371258890",
    "NIS": "196192",
    "KELAS": "6 A (MIA)",
    "NAMA": "Muhammad Fakhri Syihab"
  }
]
```

## Teknologi yang Digunakan

- **Backend**: Node.js, Express.js
- **View Engine**: EJS
- **Styling**: Tailwind CSS
- **Authentication**: Passport.js dengan Google OAuth 2.0
- **Session**: express-session
- **Frontend**: Vanilla JavaScript dengan Fetch API

## Catatan

- Aplikasi ini berjalan sebagai Single Page Application (SPA) setelah login
- Semua komunikasi dengan backend menggunakan Fetch API
- Session disimpan di server menggunakan express-session
- Middleware autentikasi melindungi route yang memerlukan login
- Fitur Reset Password hanya dapat diakses oleh email yang diizinkan
