import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { generateToken } from '../utils/jwtUtils.js'; // Ensure you have this utility function

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    match: [
      /^\w+([\.-]?\w+)@\w+([\.-]?\w+)(\.\w{2,3})+$/,
      'Please provide a valid email'
    ],
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId; // Password not required if using Google auth
    },
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't return password in queries
  },
  role: {
    type: String,
    enum: ['customer', 'retailer', 'admin'],
    default: 'customer'
  },
  googleId: {
    type: String,
    sparse: true, // Ensure sparse index to allow multiple null values
    default: null
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  verificationCode: {
    type: String,
    select: false
  },
  verificationCodeExpires: {
    type: Date,
    select: false
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Encrypt password using bcrypt
userSchema.pre('save', async function(next) {
  // Only run if password is modified and not empty
  if (!this.isModified('password') || !this.password) {
    return next();
  }
  
  // Hash the password
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function(enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate verification code
userSchema.methods.generateVerificationCode = function() {
  // Generate a 6 digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Hash the code
  const salt = bcrypt.genSaltSync(10);
  this.verificationCode = bcrypt.hashSync(code, salt);
  
  // Set expiry (15 minutes)
  this.verificationCodeExpires = Date.now() + 15 * 60 * 1000;
  
  return code;
};

// Check if verification code is valid
userSchema.methods.verifyCode = async function(enteredCode) {
  if (!this.verificationCode || !this.verificationCodeExpires) {
    return false;
  }
  
  // Check if code has expired
  if (this.verificationCodeExpires < Date.now()) {
    return false;
  }
  
  // Check if code matches
  return await bcrypt.compare(enteredCode, this.verificationCode);
};

// Generate JWT token
userSchema.methods.getSignedJwtToken = function() {
  return generateToken(this._id, this.role);
};

const User = mongoose.model('User', userSchema);

export default User;