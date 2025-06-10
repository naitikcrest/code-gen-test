const express = require('express');
const { body, validationResult } = require('express-validator');
const { chatMemberMiddleware, groupAdminMiddleware } = require('../middleware/auth');

const router = express.Router();

// Get all chats for the current user
router.get('/', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const userId = req.user.id;

    const chatsResult = await db.query(`
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
            'senderName', u.first_name || ' ' || u.last_name,
            'createdAt', m.created_at
          )
          FROM messages m
          JOIN users u ON m.sender_id = u.id
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
        ) as unread_count,
        CASE 
          WHEN c.type = 'individual' THEN (
            SELECT json_build_object(
              'id', u.id,
              'username', u.username,
              'firstName', u.first_name,
              'lastName', u.last_name,
              'profilePicture', u.profile_picture,
              'status', u.status,
              'lastSeen', u.last_seen
            )
            FROM chat_participants cp2
            JOIN users u ON cp2.user_id = u.id
            WHERE cp2.chat_id = c.id AND cp2.user_id != $1 AND cp2.is_active = true
            LIMIT 1
          )
          ELSE NULL
        END as other_user,
        CASE 
          WHEN c.type = 'group' THEN (
            SELECT json_agg(
              json_build_object(
                'id', u.id,
                'username', u.username,
                'firstName', u.first_name,
                'lastName', u.last_name,
                'profilePicture', u.profile_picture,
                'role', cp2.role
              )
            )
            FROM chat_participants cp2
            JOIN users u ON cp2.user_id = u.id
            WHERE cp2.chat_id = c.id AND cp2.is_active = true
          )
          ELSE NULL
        END as participants
      FROM chats c
      JOIN chat_participants cp ON c.id = cp.chat_id
      WHERE cp.user_id = $1 AND cp.is_active = true
      ORDER BY 
        CASE 
          WHEN (SELECT created_at FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) IS NOT NULL 
          THEN (SELECT created_at FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1)
          ELSE c.created_at
        END DESC
    `, [userId]);

    res.json({
      success: true,
      chats: chatsResult.rows
    });

  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({
      error: 'Failed to get chats',
      message: 'An error occurred while fetching chats'
    });
  }
});

// Get specific chat details
router.get('/:chatId', chatMemberMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;
    const db = req.app.locals.db;

    const chatResult = await db.query(`
      SELECT 
        c.id,
        c.type,
        c.name,
        c.description,
        c.group_picture,
        c.created_by,
        c.created_at,
        c.updated_at,
        cp.role as user_role,
        CASE 
          WHEN c.type = 'individual' THEN (
            SELECT json_build_object(
              'id', u.id,
              'username', u.username,
              'firstName', u.first_name,
              'lastName', u.last_name,
              'profilePicture', u.profile_picture,
              'status', u.status,
              'lastSeen', u.last_seen
            )
            FROM chat_participants cp2
            JOIN users u ON cp2.user_id = u.id
            WHERE cp2.chat_id = c.id AND cp2.user_id != $1 AND cp2.is_active = true
            LIMIT 1
          )
          ELSE NULL
        END as other_user,
        (
          SELECT json_agg(
            json_build_object(
              'id', u.id,
              'username', u.username,
              'firstName', u.first_name,
              'lastName', u.last_name,
              'profilePicture', u.profile_picture,
              'role', cp2.role,
              'joinedAt', cp2.joined_at
            )
          )
          FROM chat_participants cp2
          JOIN users u ON cp2.user_id = u.id
          WHERE cp2.chat_id = c.id AND cp2.is_active = true
        ) as participants
      FROM chats c
      JOIN chat_participants cp ON c.id = cp.chat_id
      WHERE c.id = $2 AND cp.user_id = $1 AND cp.is_active = true
    `, [req.user.id, chatId]);

    if (chatResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Chat not found',
        message: 'Chat not found or you are not a member'
      });
    }

    res.json({
      success: true,
      chat: chatResult.rows[0]
    });

  } catch (error) {
    console.error('Get chat error:', error);
    res.status(500).json({
      error: 'Failed to get chat',
      message: 'An error occurred while fetching chat details'
    });
  }
});

// Create individual chat
router.post('/individual', [
  body('userId').isUUID().withMessage('Valid user ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { userId } = req.body;
    const currentUserId = req.user.id;
    const db = req.app.locals.db;

    // Check if user exists
    const userExists = await db.query(
      'SELECT id FROM users WHERE id = $1 AND is_active = true',
      [userId]
    );

    if (userExists.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The specified user does not exist'
      });
    }

    // Check if chat already exists between these users
    const existingChat = await db.query(`
      SELECT c.id 
      FROM chats c
      JOIN chat_participants cp1 ON c.id = cp1.chat_id
      JOIN chat_participants cp2 ON c.id = cp2.chat_id
      WHERE c.type = 'individual' 
        AND cp1.user_id = $1 AND cp1.is_active = true
        AND cp2.user_id = $2 AND cp2.is_active = true
    `, [currentUserId, userId]);

    if (existingChat.rows.length > 0) {
      return res.status(409).json({
        error: 'Chat already exists',
        message: 'A chat already exists between these users',
        chatId: existingChat.rows[0].id
      });
    }

    // Create new individual chat
    const chatResult = await db.query(
      'INSERT INTO chats (type, created_by) VALUES ($1, $2) RETURNING *',
      ['individual', currentUserId]
    );

    const chat = chatResult.rows[0];

    // Add both users as participants
    await db.query(
      'INSERT INTO chat_participants (chat_id, user_id) VALUES ($1, $2), ($1, $3)',
      [chat.id, currentUserId, userId]
    );

    // Get the created chat with user details
    const fullChatResult = await db.query(`
      SELECT 
        c.*,
        json_build_object(
          'id', u.id,
          'username', u.username,
          'firstName', u.first_name,
          'lastName', u.last_name,
          'profilePicture', u.profile_picture,
          'status', u.status
        ) as other_user
      FROM chats c
      JOIN chat_participants cp ON c.id = cp.chat_id
      JOIN users u ON cp.user_id = u.id
      WHERE c.id = $1 AND cp.user_id = $2
    `, [chat.id, userId]);

    res.status(201).json({
      success: true,
      message: 'Individual chat created successfully',
      chat: fullChatResult.rows[0]
    });

  } catch (error) {
    console.error('Create individual chat error:', error);
    res.status(500).json({
      error: 'Failed to create chat',
      message: 'An error occurred while creating the chat'
    });
  }
});

// Create group chat
router.post('/group', [
  body('name').isLength({ min: 1, max: 100 }).trim().withMessage('Group name is required and must be less than 100 characters'),
  body('description').optional().isLength({ max: 500 }).withMessage('Description must be less than 500 characters'),
  body('participants').isArray({ min: 1 }).withMessage('At least one participant is required'),
  body('participants.*').isUUID().withMessage('All participant IDs must be valid UUIDs')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { name, description, participants } = req.body;
    const currentUserId = req.user.id;
    const db = req.app.locals.db;

    // Verify all participants exist
    const participantCheck = await db.query(
      'SELECT id FROM users WHERE id = ANY($1) AND is_active = true',
      [participants]
    );

    if (participantCheck.rows.length !== participants.length) {
      return res.status(400).json({
        error: 'Invalid participants',
        message: 'One or more participants do not exist'
      });
    }

    // Create group chat
    const chatResult = await db.query(
      'INSERT INTO chats (type, name, description, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      ['group', name, description, currentUserId]
    );

    const chat = chatResult.rows[0];

    // Add creator as admin
    await db.query(
      'INSERT INTO chat_participants (chat_id, user_id, role) VALUES ($1, $2, $3)',
      [chat.id, currentUserId, 'admin']
    );

    // Add other participants as members
    const participantValues = participants
      .filter(id => id !== currentUserId)
      .map(id => `('${chat.id}', '${id}', 'member')`)
      .join(', ');

    if (participantValues) {
      await db.query(
        `INSERT INTO chat_participants (chat_id, user_id, role) VALUES ${participantValues}`
      );
    }

    // Get the created group with participant details
    const fullGroupResult = await db.query(`
      SELECT 
        c.*,
        json_agg(
          json_build_object(
            'id', u.id,
            'username', u.username,
            'firstName', u.first_name,
            'lastName', u.last_name,
            'profilePicture', u.profile_picture,
            'role', cp.role
          )
        ) as participants
      FROM chats c
      JOIN chat_participants cp ON c.id = cp.chat_id
      JOIN users u ON cp.user_id = u.id
      WHERE c.id = $1 AND cp.is_active = true
      GROUP BY c.id
    `, [chat.id]);

    res.status(201).json({
      success: true,
      message: 'Group chat created successfully',
      chat: fullGroupResult.rows[0]
    });

  } catch (error) {
    console.error('Create group chat error:', error);
    res.status(500).json({
      error: 'Failed to create group',
      message: 'An error occurred while creating the group'
    });
  }
});

// Update group info (admin only)
router.put('/:chatId', chatMemberMiddleware, groupAdminMiddleware, [
  body('name').optional().isLength({ min: 1, max: 100 }).trim(),
  body('description').optional().isLength({ max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { chatId } = req.params;
    const { name, description } = req.body;
    const db = req.app.locals.db;

    // Update group info
    const updateResult = await db.query(
      'UPDATE chats SET name = COALESCE($1, name), description = COALESCE($2, description), updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND type = $4 RETURNING *',
      [name, description, chatId, 'group']
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Group not found',
        message: 'Group not found or not a group chat'
      });
    }

    res.json({
      success: true,
      message: 'Group updated successfully',
      chat: updateResult.rows[0]
    });

  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({
      error: 'Failed to update group',
      message: 'An error occurred while updating the group'
    });
  }
});

// Add member to group (admin only)
router.post('/:chatId/members', chatMemberMiddleware, groupAdminMiddleware, [
  body('userId').isUUID().withMessage('Valid user ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { chatId } = req.params;
    const { userId } = req.body;
    const db = req.app.locals.db;

    // Check if user exists
    const userExists = await db.query(
      'SELECT id FROM users WHERE id = $1 AND is_active = true',
      [userId]
    );

    if (userExists.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The specified user does not exist'
      });
    }

    // Check if user is already a member
    const existingMember = await db.query(
      'SELECT id FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [chatId, userId]
    );

    if (existingMember.rows.length > 0) {
      // Reactivate if they were previously removed
      await db.query(
        'UPDATE chat_participants SET is_active = true, joined_at = CURRENT_TIMESTAMP WHERE chat_id = $1 AND user_id = $2',
        [chatId, userId]
      );
    } else {
      // Add new member
      await db.query(
        'INSERT INTO chat_participants (chat_id, user_id, role) VALUES ($1, $2, $3)',
        [chatId, userId, 'member']
      );
    }

    res.json({
      success: true,
      message: 'Member added successfully'
    });

  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({
      error: 'Failed to add member',
      message: 'An error occurred while adding the member'
    });
  }
});

// Remove member from group (admin only)
router.delete('/:chatId/members/:userId', chatMemberMiddleware, groupAdminMiddleware, async (req, res) => {
  try {
    const { chatId, userId } = req.params;
    const db = req.app.locals.db;

    // Cannot remove yourself as admin (must transfer admin first)
    if (userId === req.user.id) {
      return res.status(400).json({
        error: 'Cannot remove yourself',
        message: 'Transfer admin role to another member before leaving'
      });
    }

    // Remove member
    const removeResult = await db.query(
      'UPDATE chat_participants SET is_active = false, left_at = CURRENT_TIMESTAMP WHERE chat_id = $1 AND user_id = $2 AND is_active = true',
      [chatId, userId]
    );

    if (removeResult.rowCount === 0) {
      return res.status(404).json({
        error: 'Member not found',
        message: 'User is not a member of this group'
      });
    }

    res.json({
      success: true,
      message: 'Member removed successfully'
    });

  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({
      error: 'Failed to remove member',
      message: 'An error occurred while removing the member'
    });
  }
});

// Leave group
router.post('/:chatId/leave', chatMemberMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;
    const db = req.app.locals.db;

    // Check if user is the only admin
    const adminCount = await db.query(
      'SELECT COUNT(*) as count FROM chat_participants WHERE chat_id = $1 AND role = $2 AND is_active = true',
      [chatId, 'admin']
    );

    const userRole = await db.query(
      'SELECT role FROM chat_participants WHERE chat_id = $1 AND user_id = $2 AND is_active = true',
      [chatId, userId]
    );

    if (userRole.rows[0]?.role === 'admin' && adminCount.rows[0].count === 1) {
      return res.status(400).json({
        error: 'Cannot leave group',
        message: 'Transfer admin role to another member before leaving'
      });
    }

    // Leave group
    await db.query(
      'UPDATE chat_participants SET is_active = false, left_at = CURRENT_TIMESTAMP WHERE chat_id = $1 AND user_id = $2',
      [chatId, userId]
    );

    res.json({
      success: true,
      message: 'Left group successfully'
    });

  } catch (error) {
    console.error('Leave group error:', error);
    res.status(500).json({
      error: 'Failed to leave group',
      message: 'An error occurred while leaving the group'
    });
  }
});

module.exports = router;

