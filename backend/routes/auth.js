const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { 
  hashPassword, 
  comparePassword, 
  generateTokens, 
  verifyRefreshToken,
  authMiddleware 
} = require('../middleware/auth');

const router = express.Router();

// Rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation rules
const registerValidation = [
  body('username')
    .isLength({ min: 3, max: 50 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username must be 3-50 characters and contain only letters, numbers, and underscores'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must be at least 8 characters with uppercase, lowercase, number, and special character'),
  body('firstName')
    .isLength({ min: 1, max: 100 })
    .trim()
    .withMessage('First name is required and must be less than 100 characters'),
  body('lastName')
    .isLength({ min: 1, max: 100 })
    .trim()
    .withMessage('Last name is required and must be less than 100 characters'),
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number')
];

const loginValidation = [
  body('identifier')
    .notEmpty()
    .withMessage('Username or email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Register new user
router.post('/register', authLimiter, registerValidation, async (req, res) => {
  try {
    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { username, email, password, firstName, lastName, phone } = req.body;
    const db = req.app.locals.db;

    // Check if user already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: 'User already exists',
        message: 'Username or email is already taken'
      });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const result = await db.query(
      `INSERT INTO users (username, email, password_hash, first_name, last_name, phone) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, username, email, first_name, last_name, phone, created_at`,
      [username, email, passwordHash, firstName, lastName, phone]
    );

    const user = result.rows[0];

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Store refresh token in database
    await db.query(
      'INSERT INTO user_sessions (user_id, session_token, device_info, ip_address, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [
        user.id, 
        refreshToken, 
        req.headers['user-agent'] || 'Unknown', 
        req.ip,
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      ]
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        createdAt: user.created_at
      },
      tokens: {
        accessToken,
        refreshToken
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: 'An error occurred during registration'
    });
  }
});

// Login user
router.post('/login', authLimiter, loginValidation, async (req, res) => {
  try {
    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { identifier, password } = req.body;
    const db = req.app.locals.db;

    // Find user by username or email
    const userResult = await db.query(
      'SELECT id, username, email, password_hash, first_name, last_name, phone, profile_picture, status FROM users WHERE (username = $1 OR email = $1) AND is_active = true',
      [identifier]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Username/email or password is incorrect'
      });
    }

    const user = userResult.rows[0];

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Username/email or password is incorrect'
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Store refresh token in database
    await db.query(
      'INSERT INTO user_sessions (user_id, session_token, device_info, ip_address, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [
        user.id, 
        refreshToken, 
        req.headers['user-agent'] || 'Unknown', 
        req.ip,
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      ]
    );

    // Update user status to online
    await db.query(
      'UPDATE users SET status = $1, last_seen = CURRENT_TIMESTAMP WHERE id = $2',
      ['online', user.id]
    );

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        profilePicture: user.profile_picture,
        status: 'online'
      },
      tokens: {
        accessToken,
        refreshToken
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'An error occurred during login'
    });
  }
});

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        error: 'Refresh token required',
        message: 'Please provide a refresh token'
      });
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    const db = req.app.locals.db;

    // Check if refresh token exists in database
    const sessionResult = await db.query(
      'SELECT user_id FROM user_sessions WHERE session_token = $1 AND is_active = true AND expires_at > CURRENT_TIMESTAMP',
      [refreshToken]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid refresh token',
        message: 'Refresh token is invalid or expired'
      });
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(decoded.userId);

    // Update refresh token in database
    await db.query(
      'UPDATE user_sessions SET session_token = $1, expires_at = $2 WHERE session_token = $3',
      [
        newRefreshToken,
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        refreshToken
      ]
    );

    res.json({
      success: true,
      tokens: {
        accessToken,
        refreshToken: newRefreshToken
      }
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({
      error: 'Token refresh failed',
      message: 'Invalid or expired refresh token'
    });
  }
});

// Logout user
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const db = req.app.locals.db;

    // Invalidate refresh token
    if (refreshToken) {
      await db.query(
        'UPDATE user_sessions SET is_active = false WHERE session_token = $1',
        [refreshToken]
      );
    }

    // Update user status to offline
    await db.query(
      'UPDATE users SET status = $1, last_seen = CURRENT_TIMESTAMP WHERE id = $2',
      ['offline', req.user.id]
    );

    res.json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: 'An error occurred during logout'
    });
  }
});

// Get current user profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;
    
    const userResult = await db.query(
      'SELECT id, username, email, first_name, last_name, phone, profile_picture, bio, status, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User profile not found'
      });
    }

    const user = userResult.rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        profilePicture: user.profile_picture,
        bio: user.bio,
        status: user.status,
        createdAt: user.created_at
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'Failed to get profile',
      message: 'An error occurred while fetching profile'
    });
  }
});

// Logout from all devices
router.post('/logout-all', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;

    // Invalidate all refresh tokens for the user
    await db.query(
      'UPDATE user_sessions SET is_active = false WHERE user_id = $1',
      [req.user.id]
    );

    // Update user status to offline
    await db.query(
      'UPDATE users SET status = $1, last_seen = CURRENT_TIMESTAMP WHERE id = $2',
      ['offline', req.user.id]
    );

    res.json({
      success: true,
      message: 'Logged out from all devices'
    });

  } catch (error) {
    console.error('Logout all error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: 'An error occurred during logout'
    });
  }
});

module.exports = router;

