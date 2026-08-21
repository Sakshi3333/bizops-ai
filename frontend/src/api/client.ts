import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const TOKEN_STORAGE_KEY = "bizops_token";

export const apiClient = axios.create({ baseURL: API_URL });

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

// AuthProvider registers itself here so a 401 anywhere can clear auth state
// and bounce to /login, without api/client.ts importing the React context.
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (onUnauthorized) {
        onUnauthorized();
      } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        window.location.assign("/login");
      }
    }
    return Promise.reject(error);
  },
);
