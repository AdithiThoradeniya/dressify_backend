import express from 'express';
import bcrypt from 'bcryptjs';
import passport from 'passport';
import User from '../models/User.js';
import { ensureAuthenticated } from '../middleware/auth.js';

const router = express.Router();

// Signup route
router.post('/signup', async (req, res) => {
  const { fullName, email, password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
    return res.status(400).json({ success: false, message: 'Passwords do not match' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already in use' });
    }

    const newUser = new User({
      fullName,
      email,
      password // No manual hashing here
    });
    console.log('Saving new user:', newUser);

    await newUser.save();
    console.log('New user created and saved to database:', newUser);

    const token = newUser.getSignedJwtToken();

    res.status(201).json({ success: true, message: 'User created successfully', token });
  } catch (error) {
    console.error('Error creating user:', error.message, error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
});

// Login route
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Please provide email and password' });
  }

  try {
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    console.log('User found:', user);
    console.log('Entered password:', password);
    console.log('Stored hashed password:', user.password);

    const isMatch = await user.matchPassword(password);

    console.log('Password match result:', isMatch);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = user.getSignedJwtToken();
    console.log('User logged in:', user);

    res.status(200).json({ success: true, message: 'Logged in successfully', token });
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Protected routes
router.use('/protected', ensureAuthenticated);

router.get('/protected/some-route', (req, res) => {
  res.json({ success: true, message: 'You have accessed a protected route' });
});

// Delete Account Route
router.delete('/delete-account', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    console.log(`User deleted: ${user.email}`);
    res.status(200).json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Logout Route
router.post('/logout', (req, res) => {
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});


export default router;