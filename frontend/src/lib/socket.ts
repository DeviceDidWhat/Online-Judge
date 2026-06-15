import { io, Socket } from 'socket.io-client';

const SOCKET_URL =
  (import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api')
    .replace(/\/api$/, ''); // strip /api suffix — Socket.IO lives at the root

const AUTH_STORAGE_KEY = 'codearena_auth';

function readAccessToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as { accessToken?: string }).accessToken : undefined;
  } catch {
    return undefined;
  }
}

let socketInstance: Socket | null = null;

/**
 * Returns the singleton Socket.IO client, creating it on first call.
 * Always reads the latest access token from localStorage.
 */
export function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      auth: { token: readAccessToken() },
      autoConnect: false,
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }
  return socketInstance;
}

/**
 * Reconnects with a fresh access token.
 * Fixes: previously only reconnected if ALREADY connected — meaning first
 * login after page load never actually connected.
 */
export function reconnectSocket(): void {
  const s = getSocket();
  // Always refresh the token so the server re-authenticates the user.
  s.auth = { token: readAccessToken() };
  if (s.connected) {
    // Already connected — cycle to re-auth with the new token.
    s.disconnect();
  }
  // Connect (or reconnect). This is always called now.
  s.connect();
}

/**
 * Disconnects and destroys the socket instance.
 * Use this on logout so the next login gets a fresh authenticated connection.
 */
export function destroySocket(): void {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}

