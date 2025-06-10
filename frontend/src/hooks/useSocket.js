import { useEffect, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { io } from 'socket.io-client';
import { toast } from 'react-toastify';

// Redux actions
import { setUserStatus } from '../store/slices/authSlice';
import { 
  addMessage, 
  updateMessageStatus, 
  addReaction, 
  removeReaction,
  setTypingUsers 
} from '../store/slices/messageSlice';
import { 
  updateChatLastMessage, 
  updateChatUnreadCount,
  addChat,
  updateChat 
} from '../store/slices/chatSlice';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3001';

export const useSocket = () => {
  const dispatch = useDispatch();
  const socketRef = useRef(null);
  const { user, accessToken } = useSelector((state) => state.auth);
  const { selectedChat } = useSelector((state) => state.chat);

  const connect = useCallback(() => {
    if (!accessToken || socketRef.current?.connected) {
      return;
    }

    socketRef.current = io(SOCKET_URL, {
      auth: {
        token: accessToken
      },
      transports: ['websocket', 'polling']
    });

    const socket = socketRef.current;

    // Connection events
    socket.on('connect', () => {
      console.log('Connected to server');
      dispatch(setUserStatus('online'));
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      dispatch(setUserStatus('offline'));
    });

    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      toast.error('Connection failed. Please check your internet connection.');
    });

    // User status events
    socket.on('user_status_updated', (data) => {
      console.log('User status updated:', data);
    });

    socket.on('contact_status_changed', (data) => {
      console.log('Contact status changed:', data);
      // Update contact status in UI if needed
    });

    // Message events
    socket.on('new_message', (messageData) => {
      console.log('New message received:', messageData);
      
      dispatch(addMessage({
        chatId: messageData.chatId,
        message: messageData
      }));

      // Update chat's last message and unread count
      dispatch(updateChatLastMessage({
        chatId: messageData.chatId,
        lastMessage: messageData
      }));

      // If message is not from current user and not in selected chat, increment unread count
      if (messageData.sender.id !== user?.id && selectedChat?.id !== messageData.chatId) {
        dispatch(updateChatUnreadCount({
          chatId: messageData.chatId,
          increment: true
        }));
      }

      // Show notification if not in current chat
      if (selectedChat?.id !== messageData.chatId && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification(`${messageData.sender.firstName} ${messageData.sender.lastName}`, {
            body: messageData.content || 'Sent a media file',
            icon: messageData.sender.profilePicture || '/default-avatar.png'
          });
        }
      }

      // Auto-mark as delivered if chat is open
      if (selectedChat?.id === messageData.chatId) {
        socket.emit('message_delivered', { messageId: messageData.id });
      }
    });

    socket.on('message_sent', (data) => {
      console.log('Message sent confirmation:', data);
    });

    socket.on('message_status_update', (data) => {
      console.log('Message status update:', data);
      dispatch(updateMessageStatus({
        messageId: data.messageId,
        userId: data.userId,
        status: data.status
      }));
    });

    // Typing events
    socket.on('user_typing', (data) => {
      if (data.userId !== user?.id) {
        dispatch(setTypingUsers({
          chatId: data.chatId,
          userId: data.userId,
          username: data.username,
          isTyping: data.isTyping
        }));
      }
    });

    // Reaction events
    socket.on('message_reaction_added', (data) => {
      if (data.userId !== user?.id) {
        dispatch(addReaction({
          messageId: data.messageId,
          userId: data.userId,
          username: data.username,
          emoji: data.emoji
        }));
      }
    });

    socket.on('message_reaction_removed', (data) => {
      if (data.userId !== user?.id) {
        dispatch(removeReaction({
          messageId: data.messageId,
          userId: data.userId,
          emoji: data.emoji
        }));
      }
    });

    // Chat events
    socket.on('chat_joined', (data) => {
      console.log('Joined chat:', data);
    });

    socket.on('chat_left', (data) => {
      console.log('Left chat:', data);
    });

    // Error events
    socket.on('error', (error) => {
      console.error('Socket error:', error);
      toast.error(error.message || 'An error occurred');
    });

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

  }, [accessToken, dispatch, user?.id, selectedChat?.id]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  const sendMessage = useCallback((messageData) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('send_message', messageData);
    }
  }, []);

  const joinChat = useCallback((chatId) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('join_chat', { chatId });
    }
  }, []);

  const leaveChat = useCallback((chatId) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('leave_chat', { chatId });
    }
  }, []);

  const markMessageAsRead = useCallback((messageId) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('message_read', { messageId });
    }
  }, []);

  const startTyping = useCallback((chatId) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('typing_start', { chatId });
    }
  }, []);

  const stopTyping = useCallback((chatId) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('typing_stop', { chatId });
    }
  }, []);

  const addMessageReaction = useCallback((messageId, emoji) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('add_reaction', { messageId, emoji });
    }
  }, []);

  const removeMessageReaction = useCallback((messageId, emoji) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('remove_reaction', { messageId, emoji });
    }
  }, []);

  const updateStatus = useCallback((status) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('update_status', { status });
    }
  }, []);

  // Auto-connect when user is authenticated
  useEffect(() => {
    if (user && accessToken) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [user, accessToken, connect, disconnect]);

  // Join selected chat when it changes
  useEffect(() => {
    if (selectedChat?.id && socketRef.current?.connected) {
      joinChat(selectedChat.id);
    }
  }, [selectedChat?.id, joinChat]);

  return {
    socket: socketRef.current,
    isConnected: socketRef.current?.connected || false,
    connect,
    disconnect,
    sendMessage,
    joinChat,
    leaveChat,
    markMessageAsRead,
    startTyping,
    stopTyping,
    addMessageReaction,
    removeMessageReaction,
    updateStatus
  };
};

