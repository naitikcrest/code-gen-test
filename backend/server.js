const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const Redis = require('redis');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chats');
const messageRoutes = require('./routes/messages');
const userRoutes = require('./routes/users');
const mediaRoutes = require('./routes/media');

// Import middleware
const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

// Import services
const SocketService = require('./services/socketService');
const DatabaseService = require('./services/databaseService');

const app = express();
const server = http.createServer(app);

// Initialize database connection
const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres123@localhost:5432/whatsapp_chat',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize Redis connection
const redis = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redis.on('error', (err) => console.error('Redis Client Error', err));
redis.connect();

// Initialize Socket.IO with Redis adapter
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Security middleware
app.use(helmet());
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// CORS configuration
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(morgan('combined'));

// Static files for media uploads
app.use('/uploads', express.static('uploads'));

// Initialize services
const databaseService = new DatabaseService(db);
const socketService = new SocketService(io, db, redis);

// Make services available to routes
app.locals.db = db;
app.locals.redis = redis;
app.locals.io = io;

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/chats', authMiddleware, chatRoutes);
app.use('/api/messages', authMiddleware, messageRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/media', authMiddleware, mediaRoutes);

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Check database connection
    await db.query('SELECT 1');
    
    // Check Redis connection
    await redis.ping();
    
    res.json({
      status: 'OK',
      timestamp: new Date(),
      services: {
        database: 'connected',
        redis: 'connected',
        socket: 'running'
      },
      connectedUsers: socketService.getConnectedUsersCount(),
      activeChats: await socketService.getActiveChatsCount()
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date(),
      error: error.message
    });
  }
});

// Socket.IO Authentication Middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    const user = await authMiddleware.verifySocketToken(token, db);
    socket.userId = user.id;
    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Authentication error: Invalid token'));
  }
});

// Socket.IO Connection Handling
io.on('connection', (socket) => {
  console.log(`User ${socket.user.username} (${socket.userId}) connected`);
  
  // Initialize socket service for this connection
  socketService.handleConnection(socket);

  // Handle user going online
  socketService.handleUserOnline(socket);

  // Join user to their personal room for notifications
  socket.join(`user_${socket.userId}`);

  // Join user to all their chat rooms
  socketService.joinUserChats(socket);

  // Handle chat events
  socket.on('join_chat', (data) => socketService.handleJoinChat(socket, data));
  socket.on('leave_chat', (data) => socketService.handleLeaveChat(socket, data));
  
  // Handle message events
  socket.on('send_message', (data) => socketService.handleSendMessage(socket, data));
  socket.on('message_delivered', (data) => socketService.handleMessageDelivered(socket, data));
  socket.on('message_read', (data) => socketService.handleMessageRead(socket, data));
  socket.on('typing_start', (data) => socketService.handleTypingStart(socket, data));
  socket.on('typing_stop', (data) => socketService.handleTypingStop(socket, data));
  
  // Handle message reactions
  socket.on('add_reaction', (data) => socketService.handleAddReaction(socket, data));
  socket.on('remove_reaction', (data) => socketService.handleRemoveReaction(socket, data));
  
  // Handle group events
  socket.on('create_group', (data) => socketService.handleCreateGroup(socket, data));
  socket.on('add_group_member', (data) => socketService.handleAddGroupMember(socket, data));
  socket.on('remove_group_member', (data) => socketService.handleRemoveGroupMember(socket, data));
  socket.on('update_group_info', (data) => socketService.handleUpdateGroupInfo(socket, data));
  
  // Handle call events
  socket.on('initiate_call', (data) => socketService.handleInitiateCall(socket, data));
  socket.on('accept_call', (data) => socketService.handleAcceptCall(socket, data));
  socket.on('decline_call', (data) => socketService.handleDeclineCall(socket, data));
  socket.on('end_call', (data) => socketService.handleEndCall(socket, data));
  
  // Handle WebRTC signaling
  socket.on('webrtc_offer', (data) => socketService.handleWebRTCOffer(socket, data));
  socket.on('webrtc_answer', (data) => socketService.handleWebRTCAnswer(socket, data));
  socket.on('webrtc_ice_candidate', (data) => socketService.handleWebRTCIceCandidate(socket, data));
  
  // Handle user status updates
  socket.on('update_status', (data) => socketService.handleUpdateStatus(socket, data));
  socket.on('update_profile', (data) => socketService.handleUpdateProfile(socket, data));
  
  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`User ${socket.user.username} disconnected: ${reason}`);
    socketService.handleDisconnection(socket, reason);
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error(`Socket error for user ${socket.user.username}:`, error);
    socket.emit('error', {
      type: 'socket_error',
      message: 'An error occurred',
      error: error.message,
      timestamp: new Date()
    });
  });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 WhatsApp Chat Server running on port ${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}`);
  console.log(`🔗 HTTP endpoint: http://localhost:${PORT}`);
  console.log(`🗄️ Database: ${process.env.DATABASE_URL ? 'Connected' : 'Local PostgreSQL'}`);
  console.log(`🔴 Redis: ${process.env.REDIS_URL ? 'Connected' : 'Local Redis'}`);
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`${signal} received, shutting down gracefully`);
  
  // Close server
  server.close(async () => {
    console.log('HTTP server closed');
    
    // Close database connections
    try {
      await db.end();
      console.log('Database connection closed');
    } catch (error) {
      console.error('Error closing database connection:', error);
    }
    
    // Close Redis connection
    try {
      await redis.quit();
      console.log('Redis connection closed');
    } catch (error) {
      console.error('Error closing Redis connection:', error);
    }
    
    process.exit(0);
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

module.exports = { app, server, io, db, redis };

