# Project Summary: Puppeteer Admin Google Backend

## Overview
This is a Node.js backend application that automates Google Admin Console operations using Puppeteer for web automation. The main purpose is to manage security challenges for Google Workspace users, specifically turning off identity questions for 10 minutes after login challenges.

## Project Structure

### Core Application Files
- **`app.js`** - Main Express server entry point
- **`package.json`** - Project dependencies and configuration
- **`README.md`** - Basic project documentation

### Configuration
- **`config/constants.js`** - Contains XPath selectors and URLs for Google Admin operations
- **`config/pusher.js`** - Pusher real-time communication configuration
- **`ids.json`** - Large JSON file containing student data (NIS, Google IDs, names, classes)

### Routes & Controllers
- **`routers/index.js`** - Express router defining API endpoints
- **`controllers/resetPassword.js`** - Handles password reset operations via Google API with email support
- **`controllers/turnOff.js`** - Main controller for turning off security challenges

### Services Layer
- **`services/authService.js`** - Authentication service with TOTP support for Google login
- **`services/browserInstance.js`** - Browser instance management wrapper
- **`services/browserService.js`** - Core Puppeteer browser automation service
- **`services/googleApiService.js`** - Google Admin Directory API integration
- **`services/pusherService.js`** - Real-time notifications via Pusher

### Middleware
- **`middlewares/initializationGoogleApi.js`** - Google API initialization check
- **`middlewares/initializationMiddleware.js`** - Browser service initialization check
- **`middlewares/initializationPusher.js`** - Pusher service initialization check

### Frontend Assets
- **`public/`** - Static frontend files (Vue.js application)

## Key Features

### 1. Google Admin Automation
- **Automated Login**: Uses Puppeteer to automate Google Admin Console login with TOTP 2FA support
- **Security Challenge Management**: Automatically turns off identity questions for 10 minutes
- **User Management**: Handles bulk operations on student accounts

### 2. Authentication System
- **TOTP Integration**: Uses Speakeasy library for Time-based One-Time Password generation
- **Retry Logic**: Implements retry mechanism for failed login attempts
- **Session Management**: Maintains browser sessions with automatic re-login

### 3. Real-time Communication
- **Pusher Integration**: Provides real-time status updates during operations
- **Progress Tracking**: Notifies frontend about operation progress and results

### 4. Google API Integration
- **Admin Directory API**: Lists and manages Google Workspace users
- **Password Reset API**: Resets user passwords via Google Admin API
- **OAuth2 Authentication**: Handles Google API authentication flow
- **Credential Management**: Stores and manages API tokens

## API Endpoints

### POST `/api/reset_password`
- Resets Google Workspace user passwords via Admin API
- Accepts single user or bulk password reset requests
- Supports email validation and password strength requirements
- Returns detailed success/failure status for each user

### GET `/api/hai`
- Simple health check endpoint
- Returns "Hello World"

### POST `/api/turn_off`
- Main endpoint for turning off security challenges
- Accepts comma-separated NIS (student ID) list
- Processes multiple users concurrently
- Returns detailed results for each user

## Technical Stack

### Backend Dependencies
- **Express.js** - Web framework
- **Puppeteer** - Browser automation
- **Google APIs** - Google Workspace integration
- **Pusher** - Real-time communication
- **Speakeasy** - TOTP generation
- **Pino** - Logging
- **CORS** - Cross-origin resource sharing
- **Node-cron** - Scheduled tasks

### Key Environment Variables
- `GOOGLE_ADMIN_USERNAME` - Admin account username
- `GOOGLE_ADMIN_PASSWORD` - Admin account password
- `GOOGLE_TOTP_SECRET` - TOTP secret key
- `PORT` - Server port (default: 7123)
- `HEADLESS` - Browser headless mode
- `RELOGIN_TIME` - Cron schedule for re-login
- Pusher configuration (APP_ID, KEY, SECRET, CLUSTER)

## Data Structure

### Student Data (`ids.json`)
Contains student information with fields:
- `ID_GOOGLE` - Google user ID
- `NIS` - Student identification number
- `KELAS` - Class information
- `NAMA` - Student name

## Security Features
- **TOTP Authentication** - Two-factor authentication for Google login
- **CORS Configuration** - Restricted to specific origin
- **Environment Variables** - Sensitive data stored in environment variables
- **Graceful Shutdown** - Proper cleanup on application termination

## Current Status
The application is in active development with recent modifications to:
- `app.js` - Main server configuration (port changed to 7123, fixed route ordering)
- `routers/index.js` - API routing (reset_password changed to POST)
- `services/authService.js` - Authentication service
- `services/googleApiService.js` - Added password reset functionality
- `controllers/resetPassword.js` - Complete rewrite with email support

The browser initialization code is currently commented out in `app.js`, suggesting the application may be in a testing or development phase.

## File Details

### Main Application (`app.js`)
- Express server setup with CORS configuration
- Static file serving for frontend
- Fixed middleware ordering to prevent API routes from being intercepted
- Browser instance initialization (currently disabled)
- Graceful shutdown handling
- Server runs on port 7123 by default

### Authentication Service (`services/authService.js`)
- Comprehensive Google login automation with TOTP support
- Multiple retry mechanisms for failed login attempts
- Support for both regular login and logout-then-login flows
- Debug logging and error handling

### Browser Service (`services/browserService.js`)
- Puppeteer browser management
- Automated security challenge handling
- Cron-based re-login scheduling
- XPath-based element interaction

### Turn Off Controller (`controllers/turnOff.js`)
- Bulk processing of student accounts
- Real-time progress updates via Pusher
- Concurrent execution for better performance
- Comprehensive error handling and logging

### Google API Service (`services/googleApiService.js`)
- OAuth2 authentication flow
- Google Admin Directory API integration
- User listing and management
- Password reset functionality for single and multiple users
- Email validation and password strength requirements
- Credential storage and management

## Dependencies Summary
```json
{
  "@google-cloud/local-auth": "2.1.0",
  "connect-history-api-fallback": "^2.0.0",
  "cors": "^2.8.5",
  "dotenv": "^16.4.7",
  "express": "^4.21.2",
  "googleapis": "105",
  "node-cron": "^3.0.3",
  "pino": "^9.6.0",
  "puppeteer": "24.1.0",
  "pusher": "^5.2.0",
  "qrcode": "^1.5.4",
  "speakeasy": "^2.0.0"
}
```

## Usage
1. Set up environment variables for Google credentials and Pusher configuration
2. Install dependencies with `npm install`
3. Run the application with `npm run dev`
4. The server will start on port 7123 (or specified PORT)
5. Frontend is served from the `/public` directory
6. API endpoints are available under `/api/` prefix

## API Usage Examples

### Reset Password API
**Single User:**
```bash
curl -X POST http://localhost:7123/api/reset_password \
  -H "Content-Type: application/json" \
  -d '{"email": "user@domain.com", "password": "newpassword123"}'
```

**Multiple Users:**
```bash
curl -X POST http://localhost:7123/api/reset_password \
  -H "Content-Type: application/json" \
  -d '{"users": [{"email": "user1@domain.com", "password": "pass1"}, {"email": "user2@domain.com", "password": "pass2"}]}'
```

## Notes
- The application is designed for educational institution use (based on student data structure)
- Browser automation is currently disabled in the main application flow
- Real-time updates are provided through Pusher integration
- The system handles large datasets (thousands of student records)
- Password reset API includes comprehensive validation and error handling
- All API routes are properly configured to avoid conflicts with static file serving
