class SocketService {
  constructor(io, db, redis) {
    this.io = io;
    this.db = db;
    this.redis = redis;
    this.connectedUsers = new Map(); // userId -> socketId
    this.userSockets = new Map(); // socketId -> user info
  }

  // Handle new socket connection
  handleConnection(socket) {
    this.connectedUsers.set(socket.userId, socket.id);
    this.userSockets.set(socket.id, {
      userId: socket.userId,
      user: socket.user
    });

    console.log(`User ${socket.user.username} connected. Total users: ${this.connectedUsers.size}`);
  }

  // Handle user going online
  async handleUserOnline(socket) {
    try {
      // Update user status in database
      await this.db.query(
        'UPDATE users SET status = $1, last_seen = CURRENT_TIMESTAMP WHERE id = $2',
        ['online', socket.userId]
      );

      // Notify contacts that user is online
      await this.notifyContactsStatusChange(socket.userId, 'online');

      // Send welcome message
      socket.emit('user_status_updated', {
        type: 'welcome',
        message: `Welcome back, ${socket.user.first_name}!`,
        status: 'online',
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error handling user online:', error);
    }
  }

  // Join user to all their chat rooms
  async joinUserChats(socket) {
    try {
      const chatsResult = await this.db.query(
        'SELECT chat_id FROM chat_participants WHERE user_id = $1 AND is_active = true',
        [socket.userId]
      );

      chatsResult.rows.forEach(row => {
        socket.join(`chat_${row.chat_id}`);
      });

      console.log(`User ${socket.user.username} joined ${chatsResult.rows.length} chat rooms`);
    } catch (error) {
      console.error('Error joining user chats:', error);
    }
  }

  // Handle joining a specific chat
  async handleJoinChat(socket, data) {
    try {
      const { chatId } = data;

      // Verify user is member of the chat
      const memberCheck = await this.db.query(
        'SELECT id FROM chat_participants WHERE chat_id = $1 AND user_id = $2 AND is_active = true',
        [chatId, socket.userId]
      );

      if (memberCheck.rows.length === 0) {
        socket.emit('error', {
          type: 'access_denied',
          message: 'You are not a member of this chat'
        });
        return;
      }

      socket.join(`chat_${chatId}`);
      
      // Mark messages as delivered
      await this.markMessagesAsDelivered(chatId, socket.userId);

      socket.emit('chat_joined', {
        chatId,
        message: 'Successfully joined chat',
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error joining chat:', error);
      socket.emit('error', {
        type: 'join_chat_error',
        message: 'Failed to join chat'
      });
    }
  }

  // Handle leaving a chat
  handleLeaveChat(socket, data) {
    const { chatId } = data;
    socket.leave(`chat_${chatId}`);
    
    socket.emit('chat_left', {
      chatId,
      message: 'Left chat',
      timestamp: new Date()
    });
  }

  // Handle sending a message
  async handleSendMessage(socket, data) {
    try {
      const { chatId, content, messageType = 'text', replyToMessageId, mediaUrl, mediaFilename } = data;

      // Verify user is member of the chat
      const memberCheck = await this.db.query(
        'SELECT id FROM chat_participants WHERE chat_id = $1 AND user_id = $2 AND is_active = true',
        [chatId, socket.userId]
      );

      if (memberCheck.rows.length === 0) {
        socket.emit('error', {
          type: 'access_denied',
          message: 'You are not a member of this chat'
        });
        return;
      }

      // Insert message into database
      const messageResult = await this.db.query(`
        INSERT INTO messages (chat_id, sender_id, content, message_type, reply_to_message_id, media_url, media_filename)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [chatId, socket.userId, content, messageType, replyToMessageId, mediaUrl, mediaFilename]);

      const message = messageResult.rows[0];

      // Get sender info
      const senderInfo = {
        id: socket.user.id,
        username: socket.user.username,
        firstName: socket.user.first_name,
        lastName: socket.user.last_name,
        profilePicture: socket.user.profile_picture
      };

      // Prepare message data for broadcast
      const messageData = {
        id: message.id,
        chatId: message.chat_id,
        content: message.content,
        messageType: message.message_type,
        mediaUrl: message.media_url,
        mediaFilename: message.media_filename,
        replyToMessageId: message.reply_to_message_id,
        sender: senderInfo,
        createdAt: message.created_at,
        timestamp: new Date()
      };

      // Get chat participants for message status tracking
      const participantsResult = await this.db.query(
        'SELECT user_id FROM chat_participants WHERE chat_id = $1 AND is_active = true',
        [chatId]
      );

      // Create message status entries for all participants except sender
      const statusValues = participantsResult.rows
        .filter(p => p.user_id !== socket.userId)
        .map(p => `('${message.id}', '${p.user_id}', 'sent')`)
        .join(', ');

      if (statusValues) {
        await this.db.query(
          `INSERT INTO message_status (message_id, user_id, status) VALUES ${statusValues}`
        );
      }

      // Broadcast message to chat room
      this.io.to(`chat_${chatId}`).emit('new_message', messageData);

      // Send delivery confirmations to online users
      await this.sendDeliveryConfirmations(chatId, message.id, socket.userId);

      // Update chat's last activity
      await this.db.query(
        'UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [chatId]
      );

      // Confirm message sent to sender
      socket.emit('message_sent', {
        messageId: message.id,
        chatId,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', {
        type: 'send_message_error',
        message: 'Failed to send message'
      });
    }
  }

  // Handle message delivered status
  async handleMessageDelivered(socket, data) {
    try {
      const { messageId } = data;

      await this.db.query(
        'UPDATE message_status SET status = $1, timestamp = CURRENT_TIMESTAMP WHERE message_id = $2 AND user_id = $3',
        ['delivered', messageId, socket.userId]
      );

      // Notify sender about delivery
      const messageResult = await this.db.query(
        'SELECT sender_id, chat_id FROM messages WHERE id = $1',
        [messageId]
      );

      if (messageResult.rows.length > 0) {
        const senderId = messageResult.rows[0].sender_id;
        const senderSocketId = this.connectedUsers.get(senderId);
        
        if (senderSocketId) {
          this.io.to(senderSocketId).emit('message_status_update', {
            messageId,
            status: 'delivered',
            userId: socket.userId,
            timestamp: new Date()
          });
        }
      }

    } catch (error) {
      console.error('Error updating message delivered status:', error);
    }
  }

  // Handle message read status
  async handleMessageRead(socket, data) {
    try {
      const { messageId } = data;

      await this.db.query(
        'UPDATE message_status SET status = $1, timestamp = CURRENT_TIMESTAMP WHERE message_id = $2 AND user_id = $3',
        ['read', messageId, socket.userId]
      );

      // Notify sender about read status
      const messageResult = await this.db.query(
        'SELECT sender_id, chat_id FROM messages WHERE id = $1',
        [messageId]
      );

      if (messageResult.rows.length > 0) {
        const senderId = messageResult.rows[0].sender_id;
        const senderSocketId = this.connectedUsers.get(senderId);
        
        if (senderSocketId) {
          this.io.to(senderSocketId).emit('message_status_update', {
            messageId,
            status: 'read',
            userId: socket.userId,
            timestamp: new Date()
          });
        }
      }

    } catch (error) {
      console.error('Error updating message read status:', error);
    }
  }

  // Handle typing start
  async handleTypingStart(socket, data) {
    try {
      const { chatId } = data;
      
      socket.to(`chat_${chatId}`).emit('user_typing', {
        chatId,
        userId: socket.userId,
        username: socket.user.username,
        isTyping: true,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error handling typing start:', error);
    }
  }

  // Handle typing stop
  async handleTypingStop(socket, data) {
    try {
      const { chatId } = data;
      
      socket.to(`chat_${chatId}`).emit('user_typing', {
        chatId,
        userId: socket.userId,
        username: socket.user.username,
        isTyping: false,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error handling typing stop:', error);
    }
  }

  // Handle adding reaction to message
  async handleAddReaction(socket, data) {
    try {
      const { messageId, emoji } = data;

      // Add or update reaction
      await this.db.query(`
        INSERT INTO message_reactions (message_id, user_id, emoji)
        VALUES ($1, $2, $3)
        ON CONFLICT (message_id, user_id, emoji) DO NOTHING
      `, [messageId, socket.userId, emoji]);

      // Get chat ID for the message
      const messageResult = await this.db.query(
        'SELECT chat_id FROM messages WHERE id = $1',
        [messageId]
      );

      if (messageResult.rows.length > 0) {
        const chatId = messageResult.rows[0].chat_id;
        
        // Broadcast reaction to chat
        this.io.to(`chat_${chatId}`).emit('message_reaction_added', {
          messageId,
          userId: socket.userId,
          username: socket.user.username,
          emoji,
          timestamp: new Date()
        });
      }

    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  }

  // Handle removing reaction from message
  async handleRemoveReaction(socket, data) {
    try {
      const { messageId, emoji } = data;

      await this.db.query(
        'DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3',
        [messageId, socket.userId, emoji]
      );

      // Get chat ID for the message
      const messageResult = await this.db.query(
        'SELECT chat_id FROM messages WHERE id = $1',
        [messageId]
      );

      if (messageResult.rows.length > 0) {
        const chatId = messageResult.rows[0].chat_id;
        
        // Broadcast reaction removal to chat
        this.io.to(`chat_${chatId}`).emit('message_reaction_removed', {
          messageId,
          userId: socket.userId,
          username: socket.user.username,
          emoji,
          timestamp: new Date()
        });
      }

    } catch (error) {
      console.error('Error removing reaction:', error);
    }
  }

  // Handle user status update
  async handleUpdateStatus(socket, data) {
    try {
      const { status } = data;
      
      if (!['online', 'away', 'busy', 'offline'].includes(status)) {
        socket.emit('error', {
          type: 'invalid_status',
          message: 'Invalid status value'
        });
        return;
      }

      await this.db.query(
        'UPDATE users SET status = $1, last_seen = CURRENT_TIMESTAMP WHERE id = $2',
        [status, socket.userId]
      );

      // Notify contacts about status change
      await this.notifyContactsStatusChange(socket.userId, status);

      socket.emit('status_updated', {
        status,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error updating status:', error);
    }
  }

  // Handle disconnection
  async handleDisconnection(socket, reason) {
    try {
      // Update user status to offline
      await this.db.query(
        'UPDATE users SET status = $1, last_seen = CURRENT_TIMESTAMP WHERE id = $2',
        ['offline', socket.userId]
      );

      // Notify contacts that user is offline
      await this.notifyContactsStatusChange(socket.userId, 'offline');

      // Remove from connected users
      this.connectedUsers.delete(socket.userId);
      this.userSockets.delete(socket.id);

      console.log(`User ${socket.user.username} disconnected: ${reason}. Total users: ${this.connectedUsers.size}`);

    } catch (error) {
      console.error('Error handling disconnection:', error);
    }
  }

  // Helper method to mark messages as delivered
  async markMessagesAsDelivered(chatId, userId) {
    try {
      await this.db.query(`
        UPDATE message_status 
        SET status = 'delivered', timestamp = CURRENT_TIMESTAMP 
        WHERE message_id IN (
          SELECT id FROM messages WHERE chat_id = $1 AND sender_id != $2
        ) AND user_id = $2 AND status = 'sent'
      `, [chatId, userId]);
    } catch (error) {
      console.error('Error marking messages as delivered:', error);
    }
  }

  // Helper method to send delivery confirmations
  async sendDeliveryConfirmations(chatId, messageId, senderId) {
    try {
      const participantsResult = await this.db.query(
        'SELECT user_id FROM chat_participants WHERE chat_id = $1 AND user_id != $2 AND is_active = true',
        [chatId, senderId]
      );

      participantsResult.rows.forEach(participant => {
        const socketId = this.connectedUsers.get(participant.user_id);
        if (socketId) {
          // Update status to delivered for online users
          this.db.query(
            'UPDATE message_status SET status = $1, timestamp = CURRENT_TIMESTAMP WHERE message_id = $2 AND user_id = $3',
            ['delivered', messageId, participant.user_id]
          );
        }
      });
    } catch (error) {
      console.error('Error sending delivery confirmations:', error);
    }
  }

  // Helper method to notify contacts about status changes
  async notifyContactsStatusChange(userId, status) {
    try {
      const contactsResult = await this.db.query(
        'SELECT user_id FROM contacts WHERE contact_user_id = $1 AND is_blocked = false',
        [userId]
      );

      contactsResult.rows.forEach(contact => {
        const socketId = this.connectedUsers.get(contact.user_id);
        if (socketId) {
          this.io.to(socketId).emit('contact_status_changed', {
            userId,
            status,
            timestamp: new Date()
          });
        }
      });
    } catch (error) {
      console.error('Error notifying contacts about status change:', error);
    }
  }

  // Get connected users count
  getConnectedUsersCount() {
    return this.connectedUsers.size;
  }

  // Get active chats count
  async getActiveChatsCount() {
    try {
      const result = await this.db.query('SELECT COUNT(*) as count FROM chats');
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Error getting active chats count:', error);
      return 0;
    }
  }

  // Placeholder methods for call functionality (to be implemented with WebRTC)
  async handleInitiateCall(socket, data) {
    // TODO: Implement WebRTC call initiation
    console.log('Call initiation not yet implemented');
  }

  async handleAcceptCall(socket, data) {
    // TODO: Implement WebRTC call acceptance
    console.log('Call acceptance not yet implemented');
  }

  async handleDeclineCall(socket, data) {
    // TODO: Implement call decline
    console.log('Call decline not yet implemented');
  }

  async handleEndCall(socket, data) {
    // TODO: Implement call ending
    console.log('Call ending not yet implemented');
  }

  async handleWebRTCOffer(socket, data) {
    // TODO: Implement WebRTC offer handling
    console.log('WebRTC offer not yet implemented');
  }

  async handleWebRTCAnswer(socket, data) {
    // TODO: Implement WebRTC answer handling
    console.log('WebRTC answer not yet implemented');
  }

  async handleWebRTCIceCandidate(socket, data) {
    // TODO: Implement WebRTC ICE candidate handling
    console.log('WebRTC ICE candidate not yet implemented');
  }

  // Placeholder methods for group management
  async handleCreateGroup(socket, data) {
    // This will be handled by the REST API
    console.log('Group creation handled by REST API');
  }

  async handleAddGroupMember(socket, data) {
    // This will be handled by the REST API
    console.log('Add group member handled by REST API');
  }

  async handleRemoveGroupMember(socket, data) {
    // This will be handled by the REST API
    console.log('Remove group member handled by REST API');
  }

  async handleUpdateGroupInfo(socket, data) {
    // This will be handled by the REST API
    console.log('Update group info handled by REST API');
  }

  async handleUpdateProfile(socket, data) {
    // This will be handled by the REST API
    console.log('Update profile handled by REST API');
  }
}

module.exports = SocketService;

