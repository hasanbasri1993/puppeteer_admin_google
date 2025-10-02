const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

function buildCallbackUrl() {
    const explicit = process.env.GOOGLE_CALLBACK_URL;
    if (explicit && explicit.startsWith('http')) return explicit;
    const base = process.env.PUBLIC_URL || '';
    if (!base) return '/auth/google/callback';
    const trimmedBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${trimmedBase}/auth/google/callback`;
}

passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: buildCallbackUrl()
    },
    function (accessToken, refreshToken, profile, done) {
        // Store user profile in session
        return done(null, profile);
    }
));

passport.serializeUser(function (user, done) {
    done(null, user);
});

passport.deserializeUser(function (user, done) {
    done(null, user);
});

module.exports = passport;