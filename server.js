const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Configure CORS for Socket.IO
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// JWT Secret (in production, use environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Mock user database (replace with real database in production)
const users = new Map();
const groups = new Map();

// Authentication middleware for Socket.IO
const authenticateSocket = (socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.userId;
    socket.username = decoded.username;
    next();
  } catch (err) {
    next(new Error('Authentication error: Invalid token'));
  }
};

// Apply authentication middleware
io.use(authenticateSocket);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`User ${socket.username} (${socket.userId}) connected with socket ID: ${socket.id}`);
  
  // Store user socket mapping
  users.set(socket.userId, {
    socketId: socket.id,
    username: socket.username,
    joinedAt: new Date()
  });

  // Send welcome message to connected user
  socket.emit('response', {
    type: 'welcome',
    message: `Welcome ${socket.username}! You are successfully connected.`,
    timestamp: new Date()
  });

  // Broadcast to all users that someone joined
  socket.broadcast.emit('response', {
    type: 'user_joined',
    message: `${socket.username} joined the server`,
    username: socket.username,
    timestamp: new Date()
  });

  // Handle joining a group/room
  socket.on('join_group', (data) => {
    const { groupName } = data;
    
    if (!groupName) {
      socket.emit('response', {
        type: 'error',
        message: 'Group name is required',
        timestamp: new Date()
      });
      return;
    }

    // Leave all previous rooms (except the default room)
    socket.rooms.forEach(room => {
      if (room !== socket.id) {
        socket.leave(room);
      }
    });

    // Join the new group
    socket.join(groupName);
    
    // Initialize group if it doesn't exist
    if (!groups.has(groupName)) {
      groups.set(groupName, new Set());
    }
    
    // Add user to group
    groups.get(groupName).add(socket.userId);
    
    console.log(`User ${socket.username} joined group: ${groupName}`);
    
    // Confirm to user they joined the group
    socket.emit('response', {
      type: 'joined_group',
      message: `You joined group: ${groupName}`,
      groupName: groupName,
      timestamp: new Date()
    });

    // Notify others in the group
    socket.to(groupName).emit('response', {
      type: 'user_joined_group',
      message: `${socket.username} joined the group`,
      username: socket.username,
      groupName: groupName,
      timestamp: new Date()
    });
  });

  // Handle messages
  socket.on('message', (data) => {
    const { content, groupName, recipientId } = data;
    
    if (!content) {
      socket.emit('response', {
        type: 'error',
        message: 'Message content is required',
        timestamp: new Date()
      });
      return;
    }

    const messageData = {
      type: 'message',
      content: content,
      sender: socket.username,
      senderId: socket.userId,
      timestamp: new Date()
    };

    // If groupName is specified, send to group
    if (groupName) {
      messageData.groupName = groupName;
      socket.to(groupName).emit('response', messageData);
      
      // Confirm message sent to sender
      socket.emit('response', {
        type: 'message_sent',
        message: `Message sent to group: ${groupName}`,
        originalMessage: content,
        timestamp: new Date()
      });
      
      console.log(`Message from ${socket.username} to group ${groupName}: ${content}`);
    }
    // If recipientId is specified, send direct message
    else if (recipientId) {
      const recipient = users.get(recipientId);
      if (recipient) {
        messageData.type = 'direct_message';
        io.to(recipient.socketId).emit('response', messageData);
        
        // Confirm message sent to sender
        socket.emit('response', {
          type: 'message_sent',
          message: `Direct message sent to ${recipient.username}`,
          originalMessage: content,
          timestamp: new Date()
        });
        
        console.log(`Direct message from ${socket.username} to ${recipient.username}: ${content}`);
      } else {
        socket.emit('response', {
          type: 'error',
          message: 'Recipient not found or offline',
          timestamp: new Date()
        });
      }
    }
    // Otherwise, broadcast to all connected users
    else {
      messageData.type = 'broadcast_message';
      socket.broadcast.emit('response', messageData);
      
      // Confirm message sent to sender
      socket.emit('response', {
        type: 'message_sent',
        message: 'Message broadcasted to all users',
        originalMessage: content,
        timestamp: new Date()
      });
      
      console.log(`Broadcast message from ${socket.username}: ${content}`);
    }
  });

  // Handle custom response events
  socket.on('response', (data) => {
    console.log(`Response from ${socket.username}:`, data);
    
    // Echo the response back with additional metadata
    socket.emit('response', {
      type: 'response_received',
      message: 'Your response was received',
      originalData: data,
      timestamp: new Date()
    });
  });

  // Handle getting online users
  socket.on('get_online_users', () => {
    const onlineUsers = Array.from(users.entries()).map(([userId, userData]) => ({
      userId,
      username: userData.username,
      joinedAt: userData.joinedAt
    }));
    
    socket.emit('response', {
      type: 'online_users',
      users: onlineUsers,
      count: onlineUsers.length,
      timestamp: new Date()
    });
  });

  // Handle getting groups
  socket.on('get_groups', () => {
    const groupList = Array.from(groups.entries()).map(([groupName, members]) => ({
      groupName,
      memberCount: members.size
    }));
    
    socket.emit('response', {
      type: 'groups_list',
      groups: groupList,
      timestamp: new Date()
    });
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`User ${socket.username} (${socket.userId}) disconnected: ${reason}`);
    
    // Remove user from users map
    users.delete(socket.userId);
    
    // Remove user from all groups
    groups.forEach((members, groupName) => {
      if (members.has(socket.userId)) {
        members.delete(socket.userId);
        // If group is empty, remove it
        if (members.size === 0) {
          groups.delete(groupName);
        }
      }
    });

    // Notify all users that someone left
    socket.broadcast.emit('response', {
      type: 'user_left',
      message: `${socket.username} left the server`,
      username: socket.username,
      timestamp: new Date()
    });
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error(`Socket error for user ${socket.username}:`, error);
    socket.emit('response', {
      type: 'error',
      message: 'An error occurred',
      error: error.message,
      timestamp: new Date()
    });
  });
});

// REST API endpoints for authentication
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  // Simple authentication (replace with real authentication in production)
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  // Mock authentication - in production, verify against database
  if (password === 'password123') {
    const userId = Date.now().toString(); // Generate unique user ID
    const token = jwt.sign(
      { userId, username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      success: true,
      token,
      user: { userId, username }
    });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    connectedUsers: users.size,
    activeGroups: groups.size
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Socket.IO server running on port ${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}`);
  console.log(`🔗 HTTP endpoint: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

