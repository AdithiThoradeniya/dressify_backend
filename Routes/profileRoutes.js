import express from 'express';
import User from '../models/User.js';
import passport from '../middleware/auth.js'; 

const router = express.Router();

// Get User Profile Route
router.get('/profile', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error('Error fetching profile:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update User Profile Route
router.put('/profile/update', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const { fullName, email } = req.body;
    
    // Validate input
    if (!fullName || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }
    
    // Check if email already exists (but not for the current user)
    const existingUser = await User.findOne({ email, _id: { $ne: req.user.id } });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already in use by another account' });
    }
    
    // Find and update the user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Update fields
    user.fullName = fullName;
    user.email = email;
    
    await user.save();
    
    // Return the updated user without the password
    const updatedUser = await User.findById(req.user.id).select('-password');
    res.json(updatedUser);
    
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;