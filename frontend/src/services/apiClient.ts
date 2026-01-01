import axios, { AxiosError } from 'axios';
import { showErrorToast } from '../utils/toast';

/**
 * Centralized axios instance with interceptors for consistent error handling
 */
const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Response interceptor for global error handling
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string; error?: string }>) => {
    // Extract error message from response or use default
    const errorMessage = 
      error.response?.data?.message || 
      error.response?.data?.error || 
      error.message || 
      'An unexpected error occurred';

    // Log error for debugging
    console.error('API Error:', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      message: errorMessage,
    });

    // Don't show toast for certain status codes that are handled explicitly
    const shouldSkipToast = 
      error.config?.headers?.['X-Skip-Error-Toast'] === 'true';

    if (!shouldSkipToast) {
      showErrorToast(errorMessage);
    }

    return Promise.reject(error);
  }
);

export default apiClient;
