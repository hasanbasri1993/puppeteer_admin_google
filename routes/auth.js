const express = require('express');
const passport = require('passport');
const router = express.Router();

// Google OAuth routes
router.get('/google',
    passport.authenticate('google', {scope: ['profile', 'email']})
);

router.get('/google/callback',
    passport.authenticate('google', {failureRedirect: '/'}),
    function (req, res) {
        // Successful authentication, redirect to dashboard
        res.redirect('/dashboard');
    }
);


module.exports = router;
