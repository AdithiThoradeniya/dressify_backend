import 'dotenv/config';
import express from 'express';
import path from 'path';
import mongoose from 'mongoose';
import passport from './middleware/auth.js';
import { configureRoutes } from './Routes/index.js';
import { generateToken } from './utils/jwtUtils.js';
import { setUpMiddleware } from './middleware/setUpMiddleware.js';
import { setupErrorHandlers } from './utils/systemUtils.js';
import { getContentType } from './utils/fileUtils.js';
import { CONFIG } from './config/config.js';
import bodyParser from 'body-parser';
import { sessionMiddleware } from './middleware/auth.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import connectDB from './config/db.js';
import authRoutes from './Routes/authRoutes.js';
import profileRoutes from './Routes/profileRoutes.js';
import { utilityRoutes } from './Routes/utilityRoutes.js';

// Get directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize express app
const app = express();
const PORT = process.env.PORT || 5000;

// Set up middleware (CORS, JSON parsing, etc.)
setUpMiddleware(app);

// Connect to MongoDB using the connectDB function from db.js
connectDB();

// Body parsing middleware (before passport initialization)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: CONFIG.MAX_FILE_SIZE }));
app.use(bodyParser.urlencoded({ limit: CONFIG.MAX_FILE_SIZE, extended: true }));

// Initialize passport
app.use(passport.initialize());

// Middleware to attach activeUploads to req object
let activeUploads = 0;
app.use((req, res, next) => {
  req.activeUploads = activeUploads;
  next();
});

// Auth routes 
app.use('/api', authRoutes);

// profile routes 
app.use('/api', profileRoutes);

// Configure API routes
configureRoutes(app);

// Setup utility routes
utilityRoutes(app);

// Setup static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, path) => {
    res.setHeader('Content-Type', getContentType(path));
    res.setHeader('Access-Control-Allow-Origin', CONFIG.FRONTEND_URL);
    res.setHeader('Access-Control-Allow-Methods', 'GET');
  }
}));

// Apply session middleware only for Google authentication routes
app.use('/auth/google', sessionMiddleware);

// Google OAuth routes for signup
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication failed' });
    }

    // Generate the token after authentication
    // Make sure req.newUser exists or use req.user
    const token = req.newUser ? req.newUser.getSignedJwtToken() : req.user.getSignedJwtToken();

    // Send token to frontend - Updated to redirect to auth/callback
    res.redirect(`${CONFIG.FRONTEND_URL}/auth/callback?token=${token}`);
  }
);

// Google OAuth routes for login
app.get('/auth/google/login', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/login/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication failed' });
    }

    // Generate the token after authentication
    const token = req.user.getSignedJwtToken();

    // Send token to frontend - Updated to redirect to auth/callback
    res.redirect(`${CONFIG.FRONTEND_URL}/auth/callback?token=${token}`);
  }
);

// Set up error handling - should be last
setupErrorHandlers(app);

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`CORS configured for: ${CONFIG.FRONTEND_URL}`);
});

export default app;