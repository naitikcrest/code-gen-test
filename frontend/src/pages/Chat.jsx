import React, { useState, useEffect } from 'react';
import { Box, useTheme, useMediaQuery } from '@mui/material';
import { useSelector, useDispatch } from 'react-redux';

// Components
import ChatSidebar from '../components/ChatSidebar';
import MessageInterface from '../components/MessageInterface';
import UserProfile from '../components/UserProfile';
import WelcomeScreen from '../components/WelcomeScreen';

// Hooks
import { useSocket } from '../hooks/useSocket';

// Styles
import '../styles/Chat.css';

const Chat = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const dispatch = useDispatch();
  
  const { user } = useSelector((state) => state.auth);
  const { selectedChat, chats } = useSelector((state) => state.chat);
  
  const [showProfile, setShowProfile] = useState(false);
  const [showSidebar, setShowSidebar] = useState(!isMobile);
  
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    // Auto-hide sidebar on mobile when chat is selected
    if (isMobile && selectedChat) {
      setShowSidebar(false);
    }
  }, [isMobile, selectedChat]);

  const handleBackToChats = () => {
    setShowSidebar(true);
  };

  const handleProfileToggle = () => {
    setShowProfile(!showProfile);
  };

  return (
    <Box className="chat-container">
      {/* Connection Status Indicator */}
      {!isConnected && (
        <Box className="connection-status">
          <span>Connecting...</span>
        </Box>
      )}

      <Box className="chat-layout">
        {/* Sidebar */}
        <Box 
          className={`chat-sidebar ${showSidebar ? 'visible' : 'hidden'}`}
          sx={{
            width: isMobile ? '100%' : '400px',
            display: isMobile && !showSidebar ? 'none' : 'flex'
          }}
        >
          <ChatSidebar 
            onProfileClick={handleProfileToggle}
            onChatSelect={() => isMobile && setShowSidebar(false)}
          />
        </Box>

        {/* Main Chat Area */}
        <Box 
          className="chat-main"
          sx={{
            flex: 1,
            display: isMobile && showSidebar ? 'none' : 'flex',
            flexDirection: 'column'
          }}
        >
          {selectedChat ? (
            <MessageInterface 
              chat={selectedChat}
              onBackClick={isMobile ? handleBackToChats : undefined}
              onProfileClick={handleProfileToggle}
            />
          ) : (
            <WelcomeScreen user={user} />
          )}
        </Box>

        {/* Profile Panel */}
        {showProfile && (
          <Box 
            className="profile-panel"
            sx={{
              width: isMobile ? '100%' : '400px',
              position: isMobile ? 'absolute' : 'relative',
              top: 0,
              right: 0,
              height: '100%',
              zIndex: isMobile ? 1000 : 'auto',
              backgroundColor: theme.palette.background.paper
            }}
          >
            <UserProfile 
              user={selectedChat?.type === 'individual' ? selectedChat.otherUser : null}
              chat={selectedChat}
              onClose={handleProfileToggle}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default Chat;

