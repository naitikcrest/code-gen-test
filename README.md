# Socket.IO Server with Authentication

A robust Node.js Socket.IO server implementation with JWT authentication and comprehensive event handling for real-time communication.

## Features

- 🔐 **JWT Authentication**: Secure token-based authentication for socket connections
- 👥 **Group/Room Management**: Join and leave groups with real-time notifications
- 💬 **Multiple Message Types**: Broadcast, group, and direct messaging
- 🔄 **Real-time Events**: Connection, disconnection, and custom event handling
- 📊 **User Management**: Track online users and group memberships
- 🛡️ **Error Handling**: Comprehensive error handling and validation
- 🌐 **CORS Support**: Configurable CORS for cross-origin requests

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd socket-server-nodejs
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Update the `.env` file with your configuration:
```env
PORT=3001
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
CLIENT_URL=http://localhost:3000
```

## Usage

### Start the Server

Development mode (with auto-restart):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

The server will start on `http://localhost:3001` (or your configured PORT).

### Authentication

Before connecting to the socket, clients need to authenticate:

```javascript
// Login to get JWT token
const response = await fetch('http://localhost:3001/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'your-username',
    password: 'password123' // Default password for demo
  })
});

const { token } = await response.json();
```

### Socket Connection

Connect to the socket server with the JWT token:

```javascript
const socket = io('http://localhost:3001', {
  auth: {
    token: token // JWT token from authentication
  }
});
```

## Socket Events

### Client → Server Events

#### `join_group`
Join a specific group/room:
```javascript
socket.emit('join_group', {
  groupName: 'general'
});
```

#### `message`
Send messages (broadcast, group, or direct):
```javascript
// Broadcast to all users
socket.emit('message', {
  content: 'Hello everyone!'
});

// Send to specific group
socket.emit('message', {
  content: 'Hello group!',
  groupName: 'general'
});

// Send direct message
socket.emit('message', {
  content: 'Hello there!',
  recipientId: 'user123'
});
```

#### `get_online_users`
Get list of online users:
```javascript
socket.emit('get_online_users');
```

#### `get_groups`
Get list of active groups:
```javascript
socket.emit('get_groups');
```

#### `response`
Send custom response data:
```javascript
socket.emit('response', {
  type: 'custom',
  data: 'your-data'
});
```

### Server → Client Events

#### `response`
Universal response event for all server communications:
```javascript
socket.on('response', (data) => {
  console.log('Server response:', data);
  // data.type can be: 'welcome', 'joined_group', 'message', 'error', etc.
});
```

Response types include:
- `welcome` - Welcome message on connection
- `joined_group` - Confirmation of joining a group
- `user_joined` - Notification when a user joins
- `user_left` - Notification when a user leaves
- `message` - Regular message
- `direct_message` - Direct message
- `broadcast_message` - Broadcast message
- `message_sent` - Confirmation of sent message
- `online_users` - List of online users
- `groups_list` - List of active groups
- `error` - Error messages

## API Endpoints

### POST `/auth/login`
Authenticate and get JWT token:
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "password123"}'
```

### GET `/health`
Health check endpoint:
```bash
curl http://localhost:3001/health
```

## Client Example

Open `client-example.html` in your browser to test the socket server with a simple web interface.

## Architecture

```
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── .env.example          # Environment variables template
├── client-example.html   # Test client interface
└── README.md            # Documentation
```

## Security Considerations

- 🔑 Change the default JWT secret in production
- 🛡️ Implement proper user authentication (currently uses mock auth)
- 🔒 Use HTTPS in production
- 🚫 Implement rate limiting for message sending
- 📝 Add input validation and sanitization
- 🗄️ Use a proper database for user and group management

## Production Deployment

1. Set environment variables:
```bash
export NODE_ENV=production
export JWT_SECRET=your-production-secret
export PORT=3001
```

2. Use a process manager like PM2:
```bash
npm install -g pm2
pm2 start server.js --name socket-server
```

3. Set up reverse proxy (nginx example):
```nginx
location / {
  proxy_pass http://localhost:3001;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection 'upgrade';
  proxy_set_header Host $host;
  proxy_cache_bypass $http_upgrade;
}
```

## Testing

The server includes comprehensive logging and error handling. Monitor the console output for connection events, messages, and errors.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

