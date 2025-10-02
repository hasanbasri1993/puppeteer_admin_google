// List of authorized emails for reset password functionality (loaded from env)
const AUTHORIZED_EMAILS = process.env.AUTHORIZED_EMAILS
    ? process.env.AUTHORIZED_EMAILS.split(',').map(e => e.trim()).filter(Boolean)
    : [process.env.AUTHORIZED_EMAIL_1, process.env.AUTHORIZED_EMAIL_2].filter(Boolean);

// Helper to check if a given user object is authorized for reset password
const isUserAuthorizedForReset = (user) => {
    if (!user || !user.emails || !Array.isArray(user.emails) || user.emails.length === 0) {
        return false;
    }
    const userEmail = user.emails[0].value;
    return AUTHORIZED_EMAILS.includes(userEmail);
};

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/');
};

// Middleware to check if user is authorized for reset password
const isAuthorizedForReset = (req, res, next) => {
    if (req.isAuthenticated() && req.user && req.user.emails) {
        const userEmail = req.user.emails[0].value;

        if (AUTHORIZED_EMAILS.includes(userEmail)) {
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