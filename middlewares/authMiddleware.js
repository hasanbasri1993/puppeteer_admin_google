const adminService = require('../services/adminService');

// Helper to check if a given user object is authorized for reset password
const isUserAuthorizedForReset = (user) => {
    if (!user || !user.emails || !Array.isArray(user.emails) || user.emails.length === 0) {
        return false;
    }
    const userEmail = user.emails[0].value;
    return adminService.isAdmin(userEmail);
};

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/');
};

// Middleware to check if user is an authorized admin (reset password, admin management, ids.json upload)
const isAuthorizedForReset = (req, res, next) => {
    if (req.isAuthenticated() && req.user && req.user.emails) {
        const userEmail = req.user.emails[0].value;

        if (adminService.isAdmin(userEmail)) {
            return next();
        }
    }

    res.status(403).json({
        status: 'error',
        message: 'Anda tidak memiliki izin untuk mengakses fitur ini'
    });
};

module.exports = {
    isAuthenticated,
    isAuthorizedForReset,
    isUserAuthorizedForReset
};
