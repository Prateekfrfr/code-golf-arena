import { io } from 'socket.io-client';

const GUEST_ID_STORAGE_KEY = 'code-golf-arena.guest-id';

const getOrCreateGuestId = () => {
  if (typeof window === 'undefined') return null;

  try {
    const existing = window.localStorage.getItem(GUEST_ID_STORAGE_KEY);
    if (existing) return existing;

    const created = window.crypto.randomUUID();
    window.localStorage.setItem(GUEST_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return window.crypto.randomUUID();
  }
};

const guestId = getOrCreateGuestId();

export const socket = io(
  process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001',
  {
    transports: ['websocket', 'polling'],
    autoConnect: typeof window !== 'undefined',
    auth: guestId ? { guestId } : {}
  }
);

export const getGuestId = () => guestId;
