const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/admin.directory.user'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');



/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
    try {
        const content = await fs.readFile(TOKEN_PATH);
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (err) {
        return null;
    }
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
    const content = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });
    await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
    console.log('Authorizing...');
    console.log(CREDENTIALS_PATH);
    let client = await loadSavedCredentialsIfExist();
    if (client) {
        return client;
    }
    client = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
    });
    if (client.credentials) {
        await saveCredentials(client);
    }
    return client;
}

/**
 * Lists the first 10 users in the domain.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function listUsers(auth) {
    const service = google.admin({ version: 'directory_v1', auth });
    const res = await service.users.list({
        maxResults: 10,
        orderBy: 'email',
    });

    const users = res.data.users;
    if (!users || users.length === 0) {
        console.log('No users found.');
        return;
    }

    console.log('Users:');
    users.forEach((user) => {
        console.log(`${user.primaryEmail} (${user.name.fullName})`);
    });
}

async function listUserExport() {
    const auth = await authorize();
    await listUsers(auth);
}

/**
 * Resets password for a specific user by email address
 * @param {string} email - User's email address
 * @param {string} newPassword - New password to set
 * @returns {Promise<Object>} - Result object with success status and details
 */
async function resetUserPassword(email, newPassword) {
    try {
        const auth = await authorize();
        const service = google.admin({ version: 'directory_v1', auth });
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new Error('Invalid email format');
        }
        
        // Validate password strength (basic validation)
        if (!newPassword || newPassword.length < 8) {
            throw new Error('Password must be at least 8 characters long');
        }
        
        // Update user password
        const result = await service.users.update({
            userKey: email,
            resource: {
                password: newPassword,
                changePasswordAtNextLogin: true // Force user to change password on next login
            }
        });
        
        return {
            success: true,
            message: `Password reset successfully for ${email}`,
            user: {
                email: result.data.primaryEmail,
                name: result.data.name?.fullName || 'N/A'
            }
        };
        
    } catch (error) {
        console.error('Error resetting password:', error.message);
        return {
            success: false,
            error: error.message,
            email: email
        };
    }
}

/**
 * Resets password for multiple users
 * @param {Array} users - Array of objects with email and password
 * @returns {Promise<Array>} - Array of results for each user
 */
async function resetMultiplePasswords(users) {
    const results = [];
    
    for (const user of users) {
        const result = await resetUserPassword(user.email, user.password);
        results.push({
            email: user.email,
            ...result
        });
        
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
}

module.exports = { 
    listUserExport, 
    resetUserPassword, 
    resetMultiplePasswords 
};