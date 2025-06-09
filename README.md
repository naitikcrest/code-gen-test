# WhatsApp-like Chat Application

A comprehensive, full-stack chat application built with modern technologies, featuring real-time messaging, media sharing, group chats, and all the essential features you'd expect from a modern messaging platform.

## 🚀 Features

### ✅ **Core Messaging**
- **Real-time messaging** with Socket.IO
- **Message status tracking** (sent, delivered, read)
- **Typing indicators** and online status
- **Message reactions** with emoji support
- **Reply to messages** and message forwarding
- **Message search** across all chats
- **Message deletion** and editing

### 👥 **User Management**
- **JWT-based authentication** with refresh tokens
- **User profiles** with avatars and status
- **Contact management** and blocking
- **Online/offline status** tracking
- **Last seen** timestamps

### 💬 **Chat Features**
- **Individual chats** (1-on-1 messaging)
- **Group chats** with admin controls
- **Group member management** (add/remove members)
- **Group settings** (name, description, picture)
- **Chat notifications** and muting

### 📁 **Media & Files**
- **Image sharing** with thumbnails
- **Video sharing** with preview
- **Audio messages** recording and playback
- **Document sharing** (PDF, DOC, etc.)
- **File upload** with drag-and-drop
- **Media compression** for optimal performance

### 🎨 **User Interface**
- **WhatsApp-inspired design** with Material-UI
- **Responsive layout** for mobile and desktop
- **Dark/Light theme** support
- **Emoji picker** integration
- **Smooth animations** and transitions
- **Progressive Web App** (PWA) ready

### 🔒 **Security & Performance**
- **End-to-end message encryption** (planned)
- **Rate limiting** and input validation
- **SQL injection protection**
- **XSS prevention**
- **CORS configuration**
- **Database indexing** for performance

## 🛠️ Tech Stack

### **Backend**
- **Node.js** with Express.js
- **Socket.IO** for real-time communication
- **PostgreSQL** for data persistence
- **Redis** for caching and sessions
- **JWT** for authentication
- **Multer** for file uploads
- **Sharp** for image processing

### **Frontend**
- **React 18** with hooks and context
- **Redux Toolkit** for state management
- **Material-UI (MUI)** for components
- **Socket.IO Client** for real-time features
- **React Router** for navigation
- **Axios** for HTTP requests

### **DevOps & Tools**
- **Docker** and Docker Compose
- **PostgreSQL** database
- **Redis** for caching
- **Nginx** for reverse proxy (production)
- **PM2** for process management

## 📋 Prerequisites

- **Node.js** (v16 or higher)
- **PostgreSQL** (v12 or higher)
- **Redis** (v6 or higher)
- **Docker** and Docker Compose (optional)

## 🚀 Quick Start

### Option 1: Docker Compose (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd whatsapp-chat-app
   ```

2. **Set up environment variables**
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

3. **Start with Docker Compose**
   ```bash
   docker-compose up -d
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001
   - Database: localhost:5432
   - Redis: localhost:6379

### Option 2: Manual Setup

1. **Clone and setup backend**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit .env with your database credentials
   npm run dev
   ```

2. **Setup database**
   ```bash
   # Create PostgreSQL database
   createdb whatsapp_chat
   
   # Run migrations
   psql -d whatsapp_chat -f database/migrations/001_initial_schema.sql
   ```

3. **Setup frontend**
   ```bash
   cd frontend
   npm install
   cp .env.example .env
   npm start
   ```

## 📁 Project Structure

```
whatsapp-chat-app/
├── backend/                 # Node.js backend
│   ├── routes/             # API routes
│   ├── models/             # Database models
│   ├── services/           # Business logic
│   ├── middleware/         # Express middleware
│   ├── uploads/            # File uploads
│   └── server.js           # Main server file
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom hooks
│   │   ├── services/       # API services
│   │   ├── store/          # Redux store
│   │   └── styles/         # CSS styles
│   └── public/             # Static files
├── database/               # Database migrations
├── deployment/             # Deployment configs
├── docker-compose.yml      # Docker setup
└── README.md              # This file
```

## 🔧 Configuration

### Backend Configuration

Edit `backend/.env`:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/whatsapp_chat

# JWT Secrets (change in production!)
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-refresh-secret-key

# Redis
REDIS_URL=redis://localhost:6379

# File uploads
MAX_FILE_SIZE=10485760  # 10MB
UPLOAD_PATH=./uploads
```

### Frontend Configuration

Edit `frontend/.env`:

```env
# API endpoints
REACT_APP_API_URL=http://localhost:3001
REACT_APP_SOCKET_URL=http://localhost:3001

# Feature flags
REACT_APP_ENABLE_VOICE_CALLS=true
REACT_APP_ENABLE_VIDEO_CALLS=true
```

## 📱 API Documentation

### Authentication Endpoints

```bash
POST /api/auth/register     # Register new user
POST /api/auth/login        # Login user
POST /api/auth/logout       # Logout user
POST /api/auth/refresh      # Refresh access token
GET  /api/auth/me          # Get current user
```

### Chat Endpoints

```bash
GET    /api/chats              # Get user's chats
POST   /api/chats/individual   # Create individual chat
POST   /api/chats/group        # Create group chat
GET    /api/chats/:id          # Get chat details
PUT    /api/chats/:id          # Update chat (groups only)
POST   /api/chats/:id/members  # Add group member
DELETE /api/chats/:id/members/:userId  # Remove member
```

### Message Endpoints

```bash
GET  /api/messages/:chatId     # Get chat messages
POST /api/messages             # Send message
PUT  /api/messages/:id         # Edit message
DELETE /api/messages/:id       # Delete message
```

## 🔌 Socket.IO Events

### Client → Server Events

```javascript
// Connection
socket.emit('join_chat', { chatId })
socket.emit('leave_chat', { chatId })

// Messaging
socket.emit('send_message', { chatId, content, messageType })
socket.emit('message_delivered', { messageId })
socket.emit('message_read', { messageId })

// Typing
socket.emit('typing_start', { chatId })
socket.emit('typing_stop', { chatId })

// Reactions
socket.emit('add_reaction', { messageId, emoji })
socket.emit('remove_reaction', { messageId, emoji })
```

### Server → Client Events

```javascript
// Messages
socket.on('new_message', (messageData))
socket.on('message_status_update', (statusData))

// Typing
socket.on('user_typing', (typingData))

// Reactions
socket.on('message_reaction_added', (reactionData))
socket.on('message_reaction_removed', (reactionData))

// Status
socket.on('user_status_updated', (statusData))
socket.on('contact_status_changed', (statusData))
```

## 🧪 Testing

### Backend Testing
```bash
cd backend
npm test
```

### Frontend Testing
```bash
cd frontend
npm test
```

### Integration Testing
```bash
# Start all services
docker-compose up -d

# Run integration tests
npm run test:integration
```

## 🚀 Deployment

### Production Environment Variables

**Backend (.env.production):**
```env
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@prod-db:5432/whatsapp_chat
REDIS_URL=redis://prod-redis:6379
JWT_SECRET=your-production-jwt-secret
CLIENT_URL=https://your-domain.com
```

**Frontend (.env.production):**
```env
REACT_APP_API_URL=https://api.your-domain.com
REACT_APP_SOCKET_URL=https://api.your-domain.com
```

### Docker Production Deployment

1. **Build production images**
   ```bash
   docker-compose -f docker-compose.prod.yml build
   ```

2. **Deploy with Docker Swarm**
   ```bash
   docker stack deploy -c docker-compose.prod.yml whatsapp-chat
   ```

### Manual Production Deployment

1. **Backend deployment**
   ```bash
   cd backend
   npm install --production
   npm run build
   pm2 start ecosystem.config.js
   ```

2. **Frontend deployment**
   ```bash
   cd frontend
   npm install
   npm run build
   # Serve build folder with nginx
   ```

## 🔒 Security Considerations

- **Change default JWT secrets** in production
- **Use HTTPS** in production
- **Implement rate limiting** for API endpoints
- **Validate and sanitize** all user inputs
- **Use environment variables** for sensitive data
- **Regular security updates** for dependencies
- **Database connection pooling** and prepared statements
- **CORS configuration** for allowed origins

## 🎯 Roadmap

### Phase 1: Core Features ✅
- [x] Real-time messaging
- [x] User authentication
- [x] Group chats
- [x] Media sharing
- [x] Message status

### Phase 2: Advanced Features 🚧
- [ ] Voice and video calls (WebRTC)
- [ ] Message encryption
- [ ] Push notifications
- [ ] Chat backup/export
- [ ] Advanced search

### Phase 3: Enterprise Features 📋
- [ ] Admin dashboard
- [ ] Analytics and reporting
- [ ] Multi-language support
- [ ] API rate limiting tiers
- [ ] Webhook integrations

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **WhatsApp** for design inspiration
- **Socket.IO** for real-time communication
- **Material-UI** for beautiful components
- **PostgreSQL** for reliable data storage
- **Redis** for fast caching

## 📞 Support

For support, email support@example.com or join our Slack channel.

---

**Built with ❤️ by Codegen**

