import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import User from '../models/User.js';
import { generateToken } from '../utils/jwtUtils.js';
import session from 'express-session';
import jwt from 'jsonwebtoken'; // Add this import for the verifyToken function

// Configure express-session
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true if using HTTPS
});

// Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: 'http://localhost:5000/auth/google/callback'
},
async (accessToken, refreshToken, profile, done) => {
  try {
    // Find user by Google ID
    let user = await User.findOne({ googleId: profile.id });

    if (!user) {
      // If user doesn't exist, check if an account with the same email exists
      user = await User.findOne({ email: profile.emails[0].value });

      if (user) {
        // Link Google account to existing user
        user.googleId = profile.id;
        await user.save();
        console.log('Linked Google account to existing user:', user);
      } else {
        // If no user with the same email exists, create a new user
        user = new User({
          googleId: profile.id,
          fullName: profile.displayName,
          email: profile.emails[0].value,
          // Add other fields as necessary
        });
        await user.save();
        console.log('New user created:', user);
      }
    } else {
      console.log('User found:', user);
    }

    // Generate JWT for the user after saving or finding
    const token = generateToken(user._id, user.role);

    // Attach the token to the user object
    user.token = token;

    // Send the token as part of the response to the frontend
    done(null, user);

  } catch (err) {
    console.error('Error during authentication:', err);
    done(err, false);
  }
}));

// JWT Strategy
passport.use(new JwtStrategy({
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET
}, async (jwtPayload, done) => {
  try {
    const user = await User.findById(jwtPayload.id);
    if (user) {
      return done(null, user);
    } else {
      return done(null, false);
    }
  } catch (err) {
    return done(err, false);
  }
}));

// Serialize user into the session
passport.serializeUser((user, done) => {
  done(null, user._id); // Serialize the user ID
});

// Deserialize user from the session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Enhanced middleware to get user from JWT token - logs more info for debugging
export const getUserFromToken = (req, res, next) => {
  // Check if there's an authorization header
  const authHeader = req.header('Authorization');
  if (!authHeader) {
    console.log('No Authorization header found');
    return res.status(403).send('No token provided');
  }

  passport.authenticate('jwt', { session: false }, (err, user) => {
    if (err) {
      console.error('JWT authentication error:', err);
      return res.status(403).send('Error authenticating token');
    }
    
    if (!user) {
      console.log('No user found with provided token');
      return res.status(403).send('Invalid token or no user found');
    }

    console.log('User authenticated successfully:', user._id);
    req.userId = user._id; // Attach the user ID to the request
    req.user = user; // Also attach the full user object
    next();
  })(req, res, next);
};

// Middleware to verify JWT token - improved with better error handling
export const verifyToken = (req, res, next) => {
  const authHeader = req.header('Authorization');

  if (!authHeader) {
    console.log('No Authorization header found in verifyToken');
    return res.status(401).json({ message: 'Access Denied: No token provided' });
  }

  // Extract the token from the Authorization header 
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    console.error('Token verification error:', err.message);
    res.status(401).json({ message: 'Invalid Token', error: err.message });
  }
};

// Enhanced ensureAuthenticated middleware with better logging
export const ensureAuthenticated = (req, res, next) => {
  const authHeader = req.header('Authorization');
  
  // Log auth header for debugging
  console.log('Authorization header:', authHeader ? 'Present' : 'Missing');
  
  passport.authenticate('jwt', { session: false }, (err, user) => {
    if (err) {
      console.error('Authentication error:', err);
      return res.status(401).json({ success: false, error: "Authentication error" });
    }
    
    if (!user) {
      console.log('No user found during authentication');
      return res.status(401).json({ success: false, error: "Unauthorized: Invalid token or expired session" });
    }
    
    console.log('User authenticated successfully:', user._id);
    req.user = user;
    next();
  })(req, res, next);
};

export { sessionMiddleware };
export default passport;