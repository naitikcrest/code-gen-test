import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  CircularProgress
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Email,
  Person,
  WhatsApp
} from '@mui/icons-material';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';

// Redux
import { loginUser, clearError } from '../store/slices/authSlice';

// Styles
import '../styles/Auth.css';

const Login = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { loading, error } = useSelector((state) => state.auth);
  
  const [showPassword, setShowPassword] = useState(false);
  
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm();

  const onSubmit = async (data) => {
    try {
      const result = await dispatch(loginUser(data));
      
      if (loginUser.fulfilled.match(result)) {
        toast.success('Login successful!');
        navigate('/chat');
      } else {
        toast.error(result.payload || 'Login failed');
      }
    } catch (error) {
      toast.error('An unexpected error occurred');
    }
  };

  const handleTogglePassword = () => {
    setShowPassword(!showPassword);
  };

  React.useEffect(() => {
    dispatch(clearError());
  }, [dispatch]);

  return (
    <Box className="auth-container">
      <Box className="auth-background">
        <Box className="auth-pattern"></Box>
      </Box>
      
      <Box className="auth-content">
        <Paper className="auth-paper" elevation={8}>
          {/* Header */}
          <Box className="auth-header">
            <WhatsApp className="auth-logo" />
            <Typography variant="h4" className="auth-title">
              WhatsApp Web
            </Typography>
            <Typography variant="body1" className="auth-subtitle">
              Sign in to continue to your conversations
            </Typography>
          </Box>

          {/* Error Alert */}
          {error && (
            <Alert severity="error" className="auth-alert">
              {error}
            </Alert>
          )}

          {/* Login Form */}
          <Box 
            component="form" 
            onSubmit={handleSubmit(onSubmit)}
            className="auth-form"
          >
            <TextField
              fullWidth
              label="Username or Email"
              variant="outlined"
              margin="normal"
              {...register('identifier', {
                required: 'Username or email is required',
                minLength: {
                  value: 3,
                  message: 'Must be at least 3 characters'
                }
              })}
              error={!!errors.identifier}
              helperText={errors.identifier?.message}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    {errors.identifier ? <Person color="error" /> : <Person />}
                  </InputAdornment>
                )
              }}
              disabled={loading}
            />

            <TextField
              fullWidth
              label="Password"
              type={showPassword ? 'text' : 'password'}
              variant="outlined"
              margin="normal"
              {...register('password', {
                required: 'Password is required',
                minLength: {
                  value: 6,
                  message: 'Password must be at least 6 characters'
                }
              })}
              error={!!errors.password}
              helperText={errors.password?.message}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={handleTogglePassword}
                      edge="end"
                      disabled={loading}
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
              disabled={loading}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              className="auth-submit-button"
              disabled={loading}
              sx={{ mt: 3, mb: 2 }}
            >
              {loading ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                'Sign In'
              )}
            </Button>

            <Box className="auth-links">
              <Typography variant="body2">
                Don't have an account?{' '}
                <Link to="/register" className="auth-link">
                  Sign up here
                </Link>
              </Typography>
            </Box>
          </Box>

          {/* Demo Credentials */}
          <Box className="demo-credentials">
            <Typography variant="caption" color="textSecondary">
              Demo credentials: Use any username with password "password123"
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Box>
  );
};

export default Login;

