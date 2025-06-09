const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';

// Middleware to verify JWT token for HTTP requests
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'No token provided or invalid format'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Get user from database
      const db = req.app.locals.db;
      const userResult = await db.query(
        'SELECT id, username, email, first_name, last_name, profile_picture, status, phone FROM users WHERE id = $1 AND is_active = true',
        [decoded.userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(401).json({
          error: 'Access denied',
          message: 'User not found or inactive'
        });
      }

      req.user = userResult.rows[0];
      next();
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Token expired',
          message: 'Please refresh your token'
        });
      }
      
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Token verification failed'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication failed'
    });
  }
};

// Verify token for Socket.IO connections
const verifySocketToken = async (token, db) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const userResult = await db.query(
      'SELECT id, username, email, first_name, last_name, profile_picture, status, phone FROM users WHERE id = $1 AND is_active = true',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found or inactive');
    }

    return userResult.rows[0];
  } catch (error) {
    throw new Error('Invalid token');
  }
};

// Generate JWT tokens
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { userId },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

// Verify refresh token
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET);
  } catch (error) {
    throw new Error('Invalid refresh token');
  }
};

// Hash password
const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

// Compare password
const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

// Optional middleware for admin-only routes
const adminMiddleware = async (req, res, next) => {
  try {
    // Check if user has admin role (you can extend the user model to include roles)
    const db = req.app.locals.db;
    const adminCheck = await db.query(
      'SELECT role FROM users WHERE id = $1',
      [req.user.id]
    );

    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
      return res.status(403).json({
        error: 'Access forbidden',
        message: 'Admin privileges required'
      });
    }

    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Authorization check failed'
    });
  }
};

// Middleware to check if user is member of a chat
const chatMemberMiddleware = async (req, res, next) => {
  try {
    const chatId = req.params.chatId || req.body.chatId;
    
    if (!chatId) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Chat ID is required'
      });
    }

    const db = req.app.locals.db;
    const memberCheck = await db.query(
      'SELECT id FROM chat_participants WHERE chat_id = $1 AND user_id = $2 AND is_active = true',
      [chatId, req.user.id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({
        error: 'Access forbidden',
        message: 'You are not a member of this chat'
      });
    }

    next();
  } catch (error) {
    console.error('Chat member middleware error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Chat membership check failed'
    });
  }
};

// Middleware to check if user is admin of a group chat
const groupAdminMiddleware = async (req, res, next) => {
  try {
    const chatId = req.params.chatId || req.body.chatId;
    
    if (!chatId) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Chat ID is required'
      });
    }

    const db = req.app.locals.db;
    const adminCheck = await db.query(
      'SELECT id FROM chat_participants WHERE chat_id = $1 AND user_id = $2 AND role = $3 AND is_active = true',
      [chatId, req.user.id, 'admin']
    );

    if (adminCheck.rows.length === 0) {
      return res.status(403).json({
        error: 'Access forbidden',
        message: 'Admin privileges required for this chat'
      });
    }

    next();
  } catch (error) {
    console.error('Group admin middleware error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Admin check failed'
    });
  }
};

module.exports = {
  authMiddleware,
  verifySocketToken,
  generateTokens,
  verifyRefreshToken,
  hashPassword,
  comparePassword,
  adminMiddleware,
  chatMemberMiddleware,
  groupAdminMiddleware
};

// Export as default for backward compatibility
module.exports.default = authMiddleware;

