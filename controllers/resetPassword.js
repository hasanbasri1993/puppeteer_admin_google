const fs = require('fs');
const path = require('path');
const {resetUserPassword, resetMultiplePasswords} = require('../services/googleApiService.js');
const logger = require('../utils/logger');

const STUDENT_EMAIL_PATTERN = /^(\d+)@daarululuumlido\.com$/;
const IDS_PATH = path.join(process.cwd(), 'ids.json');

function isKnownNis(nis) {
    const idsData = JSON.parse(fs.readFileSync(IDS_PATH, 'utf8'));
    return idsData.some(item => item.NIS === nis);
}

module.exports = {
    resetPassword: async (req, res) => {
        try {
            const {email, password, users} = req.body;

            // Handle single user reset
            if (email && password) {
                // Student emails (nis@daarululuumlido.com) must map to a real NIS in ids.json
                const studentMatch = email.match(STUDENT_EMAIL_PATTERN);
                if (studentMatch && !isKnownNis(studentMatch[1])) {
                    logger.error(`Password reset rejected: NIS ${studentMatch[1]} not found in ids.json`);
                    return res.status(400).json({
                        success: false,
                        error: `NIS ${studentMatch[1]} tidak ditemukan di data siswa (ids.json)`
                    });
                }

                logger.info(`Resetting password for single user: ${email}`);
                const result = await resetUserPassword(email, password);

                if (result.success) {
                    logger.info(`Password reset successful for: ${email}`);
                    return res.json({
                        success: true,
                        message: result.message,
                        user: result.user
                    });
                } else {
                    logger.error(`Password reset failed for: ${email} - ${result.error}`);
                    return res.status(400).json({
                        success: false,
                        error: result.error,
                        email: result.email
                    });
                }
            }

            // Handle multiple users reset
            if (users && Array.isArray(users)) {
                logger.info(`Resetting passwords for ${users.length} users`);

                // Validate users array
                const validUsers = users.filter(user => user.email && user.password);
                if (validUsers.length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'No valid users provided. Each user must have email and password.'
                    });
                }

                const results = await resetMultiplePasswords(validUsers);
                const successCount = results.filter(r => r.success).length;
                const failureCount = results.length - successCount;

                logger.info(`Password reset completed: ${successCount} successful, ${failureCount} failed`);

                return res.json({
                    success: true,
                    message: `Password reset completed for ${results.length} users`,
                    summary: {
                        total: results.length,
                        successful: successCount,
                        failed: failureCount
                    },
                    results: results
                });
            }

            // No valid input provided
            return res.status(400).json({
                success: false,
                error: 'Please provide either email+password or users array',
                usage: {
                    single: {email: 'user@domain.com', password: 'newpassword123'},
                    multiple: {
                        users: [{email: 'user1@domain.com', password: 'pass1'}, {
                            email: 'user2@domain.com',
                            password: 'pass2'
                        }]
                    }
                }
            });

        } catch (error) {
            logger.error('Reset password controller error:', error.message);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                details: error.message
            });
        }
    }
};
