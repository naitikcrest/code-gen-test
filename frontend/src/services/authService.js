import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Create axios instance
const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          const response = await axios.post(`${API_URL}/api/auth/refresh`, {
            refreshToken
          });

          const { accessToken, refreshToken: newRefreshToken } = response.data.tokens;
          
          localStorage.setItem('accessToken', accessToken);
          localStorage.setItem('refreshToken', newRefreshToken);

          // Retry original request with new token
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, redirect to login
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

const authService = {
  // Register new user
  register: async (userData) => {
    return api.post('/auth/register', userData);
  },

  // Login user
  login: async (identifier, password) => {
    return api.post('/auth/login', { identifier, password });
  },

  // Logout user
  logout: async (refreshToken) => {
    return api.post('/auth/logout', { refreshToken });
  },

  // Logout from all devices
  logoutAll: async () => {
    return api.post('/auth/logout-all');
  },

  // Refresh access token
  refreshToken: async (refreshToken) => {
    return axios.post(`${API_URL}/api/auth/refresh`, { refreshToken });
  },

  // Get current user profile
  getCurrentUser: async () => {
    return api.get('/auth/me');
  },

  // Update user profile
  updateProfile: async (profileData) => {
    return api.put('/auth/profile', profileData);
  },

  // Change password
  changePassword: async (currentPassword, newPassword) => {
    return api.put('/auth/change-password', {
      currentPassword,
      newPassword
    });
  },

  // Request password reset
  requestPasswordReset: async (email) => {
    return api.post('/auth/forgot-password', { email });
  },

  // Reset password
  resetPassword: async (token, newPassword) => {
    return api.post('/auth/reset-password', { token, newPassword });
  },

  // Verify email
  verifyEmail: async (token) => {
    return api.post('/auth/verify-email', { token });
  },

  // Resend verification email
  resendVerification: async (email) => {
    return api.post('/auth/resend-verification', { email });
  }
};

export default authService;

