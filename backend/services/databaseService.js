class DatabaseService {
  constructor(db) {
    this.db = db;
  }

  // Test database connection
  async testConnection() {
    try {
      const result = await this.db.query('SELECT NOW()');
      console.log('Database connected successfully at:', result.rows[0].now);
      return true;
    } catch (error) {
      console.error('Database connection failed:', error);
      return false;
    }
  }

  // User operations
  async createUser(userData) {
    const { username, email, passwordHash, firstName, lastName, phone } = userData;
    
    const result = await this.db.query(
      `INSERT INTO users (username, email, password_hash, first_name, last_name, phone) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, username, email, first_name, last_name, phone, created_at`,
      [username, email, passwordHash, firstName, lastName, phone]
    );
    
    return result.rows[0];
  }

  async getUserById(userId) {
    const result = await this.db.query(
      'SELECT id, username, email, first_name, last_name, phone, profile_picture, bio, status, last_seen, created_at FROM users WHERE id = $1 AND is_active = true',
      [userId]
    );
    
    return result.rows[0] || null;
  }

  async getUserByEmail(email) {
    const result = await this.db.query(
      'SELECT * FROM users WHERE email = $1 AND is_active = true',
      [email]
    );
    
    return result.rows[0] || null;
  }

  async getUserByUsername(username) {
    const result = await this.db.query(
      'SELECT * FROM users WHERE username = $1 AND is_active = true',
      [username]
    );
    
    return result.rows[0] || null;
  }

  async updateUserStatus(userId, status) {
    const result = await this.db.query(
      'UPDATE users SET status = $1, last_seen = CURRENT_TIMESTAMP WHERE id = $2 RETURNING status, last_seen',
      [status, userId]
    );
    
    return result.rows[0];
  }

  async updateUserProfile(userId, profileData) {
    const { firstName, lastName, bio, profilePicture } = profileData;
    
    const result = await this.db.query(
      `UPDATE users 
       SET first_name = COALESCE($1, first_name), 
           last_name = COALESCE($2, last_name), 
           bio = COALESCE($3, bio), 
           profile_picture = COALESCE($4, profile_picture),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 
       RETURNING id, username, email, first_name, last_name, bio, profile_picture`,
      [firstName, lastName, bio, profilePicture, userId]
    );
    
    return result.rows[0];
  }

  // Chat operations
  async createChat(chatData) {
    const { type, name, description, createdBy } = chatData;
    
    const result = await this.db.query(
      'INSERT INTO chats (type, name, description, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [type, name, description, createdBy]
    );
    
    return result.rows[0];
  }

  async getChatById(chatId) {
    const result = await this.db.query(
      'SELECT * FROM chats WHERE id = $1',
      [chatId]
    );
    
    return result.rows[0] || null;
  }

  async getUserChats(userId) {
    const result = await this.db.query(`
      SELECT 
        c.id,
        c.type,
        c.name,
        c.description,
        c.group_picture,
        c.created_at,
        c.updated_at,
        cp.role,
        (
          SELECT json_build_object(
            'id', m.id,
            'content', m.content,
            'messageType', m.message_type,
            'senderId', m.sender_id,
            'createdAt', m.created_at
          )
          FROM messages m
          WHERE m.chat_id = c.id AND m.is_deleted = false
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as last_message,
        (
          SELECT COUNT(*)::int
          FROM messages m
          LEFT JOIN message_status ms ON m.id = ms.message_id AND ms.user_id = $1
          WHERE m.chat_id = c.id 
            AND m.sender_id != $1 
            AND m.is_deleted = false
            AND (ms.status IS NULL OR ms.status != 'read')
        ) as unread_count
      FROM chats c
      JOIN chat_participants cp ON c.id = cp.chat_id
      WHERE cp.user_id = $1 AND cp.is_active = true
      ORDER BY c.updated_at DESC
    `, [userId]);
    
    return result.rows;
  }

  async addChatParticipant(chatId, userId, role = 'member') {
    const result = await this.db.query(
      'INSERT INTO chat_participants (chat_id, user_id, role) VALUES ($1, $2, $3) RETURNING *',
      [chatId, userId, role]
    );
    
    return result.rows[0];
  }

  async removeChatParticipant(chatId, userId) {
    const result = await this.db.query(
      'UPDATE chat_participants SET is_active = false, left_at = CURRENT_TIMESTAMP WHERE chat_id = $1 AND user_id = $2',
      [chatId, userId]
    );
    
    return result.rowCount > 0;
  }

  async getChatParticipants(chatId) {
    const result = await this.db.query(`
      SELECT 
        u.id,
        u.username,
        u.first_name,
        u.last_name,
        u.profile_picture,
        u.status,
        cp.role,
        cp.joined_at
      FROM chat_participants cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.chat_id = $1 AND cp.is_active = true
    `, [chatId]);
    
    return result.rows;
  }

  // Message operations
  async createMessage(messageData) {
    const { 
      chatId, 
      senderId, 
      content, 
      messageType = 'text', 
      mediaUrl, 
      mediaFilename, 
      replyToMessageId 
    } = messageData;
    
    const result = await this.db.query(
      `INSERT INTO messages (chat_id, sender_id, content, message_type, media_url, media_filename, reply_to_message_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [chatId, senderId, content, messageType, mediaUrl, mediaFilename, replyToMessageId]
    );
    
    return result.rows[0];
  }

  async getChatMessages(chatId, limit = 50, offset = 0) {
    const result = await this.db.query(`
      SELECT 
        m.*,
        u.username,
        u.first_name,
        u.last_name,
        u.profile_picture,
        (
          SELECT json_agg(
            json_build_object(
              'emoji', mr.emoji,
              'userId', mr.user_id,
              'username', ur.username
            )
          )
          FROM message_reactions mr
          JOIN users ur ON mr.user_id = ur.id
          WHERE mr.message_id = m.id
        ) as reactions
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.chat_id = $1 AND m.is_deleted = false
      ORDER BY m.created_at DESC
      LIMIT $2 OFFSET $3
    `, [chatId, limit, offset]);
    
    return result.rows.reverse(); // Return in chronological order
  }

  async updateMessageStatus(messageId, userId, status) {
    const result = await this.db.query(
      `INSERT INTO message_status (message_id, user_id, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id) 
       DO UPDATE SET status = $3, timestamp = CURRENT_TIMESTAMP
       RETURNING *`,
      [messageId, userId, status]
    );
    
    return result.rows[0];
  }

  async getMessageStatus(messageId) {
    const result = await this.db.query(`
      SELECT 
        ms.*,
        u.username,
        u.first_name,
        u.last_name
      FROM message_status ms
      JOIN users u ON ms.user_id = u.id
      WHERE ms.message_id = $1
      ORDER BY ms.timestamp DESC
    `, [messageId]);
    
    return result.rows;
  }

  // Contact operations
  async addContact(userId, contactUserId, contactName = null) {
    const result = await this.db.query(
      'INSERT INTO contacts (user_id, contact_user_id, contact_name) VALUES ($1, $2, $3) RETURNING *',
      [userId, contactUserId, contactName]
    );
    
    return result.rows[0];
  }

  async getUserContacts(userId) {
    const result = await this.db.query(`
      SELECT 
        c.*,
        u.username,
        u.first_name,
        u.last_name,
        u.profile_picture,
        u.status,
        u.last_seen
      FROM contacts c
      JOIN users u ON c.contact_user_id = u.id
      WHERE c.user_id = $1 AND c.is_blocked = false AND u.is_active = true
      ORDER BY u.first_name, u.last_name
    `, [userId]);
    
    return result.rows;
  }

  async blockContact(userId, contactUserId) {
    const result = await this.db.query(
      'UPDATE contacts SET is_blocked = true WHERE user_id = $1 AND contact_user_id = $2',
      [userId, contactUserId]
    );
    
    return result.rowCount > 0;
  }

  async unblockContact(userId, contactUserId) {
    const result = await this.db.query(
      'UPDATE contacts SET is_blocked = false WHERE user_id = $1 AND contact_user_id = $2',
      [userId, contactUserId]
    );
    
    return result.rowCount > 0;
  }

  // Search operations
  async searchUsers(query, excludeUserId = null) {
    const searchQuery = `%${query}%`;
    let sql = `
      SELECT id, username, first_name, last_name, profile_picture
      FROM users 
      WHERE is_active = true 
        AND (username ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1)
    `;
    const params = [searchQuery];
    
    if (excludeUserId) {
      sql += ' AND id != $2';
      params.push(excludeUserId);
    }
    
    sql += ' ORDER BY username LIMIT 20';
    
    const result = await this.db.query(sql, params);
    return result.rows;
  }

  async searchMessages(userId, query, chatId = null) {
    let sql = `
      SELECT 
        m.*,
        u.username,
        u.first_name,
        u.last_name,
        c.name as chat_name,
        c.type as chat_type
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      JOIN chats c ON m.chat_id = c.id
      JOIN chat_participants cp ON c.id = cp.chat_id
      WHERE cp.user_id = $1 
        AND cp.is_active = true
        AND m.is_deleted = false
        AND m.content ILIKE $2
    `;
    const params = [userId, `%${query}%`];
    
    if (chatId) {
      sql += ' AND m.chat_id = $3';
      params.push(chatId);
    }
    
    sql += ' ORDER BY m.created_at DESC LIMIT 50';
    
    const result = await this.db.query(sql, params);
    return result.rows;
  }

  // Utility operations
  async getStats() {
    const usersResult = await this.db.query('SELECT COUNT(*) as count FROM users WHERE is_active = true');
    const chatsResult = await this.db.query('SELECT COUNT(*) as count FROM chats');
    const messagesResult = await this.db.query('SELECT COUNT(*) as count FROM messages WHERE is_deleted = false');
    
    return {
      totalUsers: parseInt(usersResult.rows[0].count),
      totalChats: parseInt(chatsResult.rows[0].count),
      totalMessages: parseInt(messagesResult.rows[0].count)
    };
  }

  async cleanup() {
    // Clean up old sessions
    await this.db.query(
      'DELETE FROM user_sessions WHERE expires_at < CURRENT_TIMESTAMP OR is_active = false'
    );
    
    // Clean up old message reactions (optional)
    // await this.db.query('DELETE FROM message_reactions WHERE created_at < CURRENT_TIMESTAMP - INTERVAL \'1 year\'');
    
    console.log('Database cleanup completed');
  }
}

module.exports = DatabaseService;

