import axios from 'axios';
import { appCheckToken, firebaseAppCheckConfigured } from '../lib/firebase.js';

const baseURL = import.meta.env.VITE_API_BASE_URL || '';
const SESSION_KEY = 'digivote.session';

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable: session lives in memory only */
  }
}

/** Authenticated API client: attaches the DigiVote session token. */
export const api = axios.create({ baseURL, timeout: 30000 });

api.interceptors.request.use((config) => {
  const session = loadSession();
  if (session?.token) config.headers.Authorization = `Bearer ${session.token}`;
  return config;
});

let onUnauthorized = () => {};
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) onUnauthorized();
    return Promise.reject(error);
  },
);

/**
 * Anonymous client for ballots, receipts and public pages. It never sends the session token:
 * ballots must not carry identity.
 */
export const publicApi = axios.create({ baseURL, timeout: 30000 });

// Firebase App Check: attach a token to every request when App Check is configured (no-op otherwise).
if (firebaseAppCheckConfigured) {
  const attachAppCheck = async (config) => {
    const token = await appCheckToken().catch(() => null);
    if (token) config.headers['X-Firebase-AppCheck'] = token;
    return config;
  };
  api.interceptors.request.use(attachAppCheck);
  publicApi.interceptors.request.use(attachAppCheck);
}

/** Human-readable message from an API error. */
export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const data = error?.response?.data;
  if (data?.fieldErrors?.length) {
    return data.fieldErrors.map((f) => `${f.field}: ${f.message}`).join('; ');
  }
  if (data?.message) return data.message;
  if (error?.code === 'ECONNABORTED' || error?.message === 'Network Error') {
    return 'Cannot reach the DigiVote server. Check your connection and try again.';
  }
  return fallback;
}

export function errorCode(error) {
  return error?.response?.data?.code;
}
