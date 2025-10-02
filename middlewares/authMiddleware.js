// List of authorized emails for reset password functionality
const AUTHORIZED_EMAILS = [
  'admin1@email.com',
  'admin2@email.com',
  // Add more authorized emails here
];

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
  isAuthorizedForReset
};