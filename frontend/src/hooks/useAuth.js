import { useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { 
  loginUser, 
  registerUser, 
  logoutUser, 
  getCurrentUser, 
  refreshToken,
  clearAuth 
} from '../store/slices/authSlice';

export const useAuth = () => {
  const dispatch = useDispatch();
  const { user, isAuthenticated, loading, error, accessToken, refreshToken: refreshTokenValue } = useSelector(
    (state) => state.auth
  );

  const login = useCallback(async (identifier, password) => {
    return dispatch(loginUser({ identifier, password }));
  }, [dispatch]);

  const register = useCallback(async (userData) => {
    return dispatch(registerUser(userData));
  }, [dispatch]);

  const logout = useCallback(async () => {
    return dispatch(logoutUser());
  }, [dispatch]);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (token && !user) {
      try {
        await dispatch(getCurrentUser()).unwrap();
      } catch (error) {
        // If getCurrentUser fails, try to refresh token
        const refreshTokenValue = localStorage.getItem('refreshToken');
        if (refreshTokenValue) {
          try {
            await dispatch(refreshToken()).unwrap();
            await dispatch(getCurrentUser()).unwrap();
          } catch (refreshError) {
            // If refresh also fails, clear auth
            dispatch(clearAuth());
          }
        } else {
          dispatch(clearAuth());
        }
      }
    }
  }, [dispatch, user]);

  const refreshAuthToken = useCallback(async () => {
    return dispatch(refreshToken());
  }, [dispatch]);

  return {
    user,
    isAuthenticated,
    loading,
    error,
    accessToken,
    refreshToken: refreshTokenValue,
    login,
    register,
    logout,
    checkAuth,
    refreshAuthToken
  };
};

